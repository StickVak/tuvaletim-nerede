import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer, MailError, parseSender } from '../mailer.js';

const quiet = { warn() {}, error() {}, info() {} };
const fast = { timeoutMs: 40, retryDelayMs: 5, logger: quiet };
const ENV = { BREVO_API_KEY: 'xkeysib-test', MAIL_FROM: 'Tuvaletim Nerede? <noreply@tuvaletim.app>' };
const created = () => new Response(JSON.stringify({ messageId: '<abc@smtp-relay.mailin.fr>' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
const brevoError = (status, code, message, headers = {}) =>
  new Response(JSON.stringify({ code, message }), { status, headers: { 'Content-Type': 'application/json', ...headers } });
/** Yanıt vermeyen sunucu: yalnızca zaman aşımı sinyaliyle reddedilir */
const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));

test('gönderen ayrıştırma: "Ad <adres>" ya da yalın adres; boş/geçersiz → null', () => {
  assert.deepEqual(parseSender('Tuvaletim Nerede? <noreply@tuvaletim.app>'), { name: 'Tuvaletim Nerede?', email: 'noreply@tuvaletim.app' });
  assert.deepEqual(parseSender('"Tuvaletim" <a@b.co>'), { name: 'Tuvaletim', email: 'a@b.co' });
  assert.deepEqual(parseSender('  a@b.co '), { name: null, email: 'a@b.co' });
  for (const bad of [undefined, '', '   ', 'Tuvaletim', 'Ad <eksik>', 'a@b', '<>']) assert.equal(parseSender(bad), null, String(bad));
});

test('BREVO_API_KEY varsa Brevo seçilir (Resend/SMTP tanımlı olsa bile) ve /v3/smtp/email doğru biçimde çağrılır', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => (calls.push({ url, init }), created());
  const m = createMailer({ ...ENV, RESEND_API_KEY: 're', SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' }, { ...fast, fetchImpl });
  assert.equal(m.kind, 'brevo');
  assert.match(m.summary, /brevo/);
  assert.match(m.summary, /noreply@tuvaletim\.app/);
  await m.sendVerificationCode('ali@example.com', '135790');
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['api-key'], 'xkeysib-test');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.equal(init.headers.Accept, 'application/json');
  const body = JSON.parse(init.body);
  assert.deepEqual(body.sender, { name: 'Tuvaletim Nerede?', email: 'noreply@tuvaletim.app' });
  assert.deepEqual(body.to, [{ email: 'ali@example.com' }]);
  assert.match(body.subject, /135790/);
  assert.match(body.htmlContent, /135790/);
  assert.match(body.textContent, /135790/);
});

test('MAIL_FROM boş ya da geçersizse: açılışta net hata, her gönderim API çağrılmadan MailError(config)', async () => {
  for (const MAIL_FROM of [undefined, '', 'gecersiz-adres']) {
    const errors = [];
    let calls = 0;
    const m = createMailer({ BREVO_API_KEY: 'k', MAIL_FROM }, { ...fast, logger: { ...quiet, error: (...a) => errors.push(a.join(' ')) }, fetchImpl: async () => (calls++, created()) });
    assert.equal(m.kind, 'brevo');
    assert.ok(m.configError, 'yapılandırma hatası raporlanır');
    assert.match(m.configError, /MAIL_FROM/);
    assert.ok(errors.some((l) => /MAIL_FROM/.test(l)), 'açılışta loglanır');
    await assert.rejects(() => m.sendVerificationCode('a@b.co', '111111'), (e) => e instanceof MailError && e.kind === 'config' && /MAIL_FROM/.test(e.message));
    assert.equal(calls, 0, 'Brevo çağrılmaz');
  }
});

test('Brevo: zaman aşımında 1 kez yeniden denenir; ikincisi başarılıysa tamam (aynı kod)', async () => {
  const bodies = [];
  const fetchImpl = (u, i) => (bodies.push(JSON.parse(i.body)), bodies.length === 1 ? hang(u, i) : created());
  await createMailer(ENV, { ...fast, fetchImpl }).sendVerificationCode('a@b.co', '246810');
  assert.equal(bodies.length, 2);
  assert.match(bodies[1].textContent, /246810/);
});

test('Brevo: iki deneme de zaman aşımı → MailError(timeout, attempts 2)', async () => {
  let n = 0;
  await assert.rejects(
    () => createMailer(ENV, { ...fast, fetchImpl: (u, i) => (n++, hang(u, i)) }).sendVerificationCode('a@b.co', '1'),
    (e) => e.kind === 'timeout' && e.attempts === 2 && e.provider === 'brevo',
  );
  assert.equal(n, 2);
});

test('Brevo: ağ hatası ve 5xx yeniden denenir', async () => {
  let n = 0;
  await createMailer(ENV, { ...fast, fetchImpl: async () => { if (++n === 1) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }); return created(); } })
    .sendVerificationCode('a@b.co', '1');
  assert.equal(n, 2);
  n = 0;
  await createMailer(ENV, { ...fast, fetchImpl: async () => (++n === 1 ? brevoError(502, 'internal_error', 'Bad gateway') : created()) }).sendVerificationCode('a@b.co', '1');
  assert.equal(n, 2);
});

test('Brevo: geçersiz API anahtarı (401), yetkisiz IP (403) ve doğrulanmamış gönderen (400) → config, yeniden denenmez', async () => {
  const cases = [
    [401, 'unauthorized', 'Key not found'],
    [403, 'permission_denied', 'Unable to send email. Your SMTP account is not yet activated. Unrecognised IP address 1.2.3.4'],
    [400, 'invalid_parameter', 'Sender noreply@tuvaletim.app is not valid. Validate your sender or authenticate your domain'],
  ];
  for (const [status, code, message] of cases) {
    let calls = 0;
    const m = createMailer(ENV, { ...fast, fetchImpl: async () => (calls++, brevoError(status, code, message)) });
    await assert.rejects(() => m.sendVerificationCode('a@b.co', '1'), (e) => {
      assert.equal(e.kind, 'config', `${status}`);
      assert.equal(e.status, status);
      assert.equal(e.provider, 'brevo');
      assert.ok(e.message.includes(code) && e.message.includes(message.slice(0, 20)), 'Brevo kodu ve mesajı hatada');
      return true;
    });
    assert.equal(calls, 1, `${status} yeniden denenmez`);
  }
});

test('Brevo: başka 400 hatası (ör. geçersiz alıcı) sağlayıcı reddi, yeniden denenmez', async () => {
  let calls = 0;
  const m = createMailer(ENV, { ...fast, fetchImpl: async () => (calls++, brevoError(400, 'invalid_parameter', 'email is not valid in to')) });
  await assert.rejects(() => m.sendVerificationCode('a@b.co', '1'), (e) => e.kind === 'provider' && e.status === 400 && !e.retryable);
  assert.equal(calls, 1);
});

test('Brevo: 429 rate-limit → bekleme süresi Retry-After ya da x-sib-ratelimit-reset başlığından, yeniden denenmez', async () => {
  for (const headers of [{ 'Retry-After': '25' }, { 'x-sib-ratelimit-reset': '25' }]) {
    let calls = 0;
    const m = createMailer(ENV, { ...fast, fetchImpl: async () => (calls++, brevoError(429, 'too_many_requests', 'Rate limit exceeded', headers)) });
    await assert.rejects(() => m.sendVerificationCode('a@b.co', '1'), (e) => e.kind === 'rate_limit' && e.retryAfter === 25);
    assert.equal(calls, 1);
  }
});

test('loglar: Brevo durum kodu, hata kodu ve mesajı yazılır; API anahtarı, tam adres ve kod yazılmaz', async () => {
  const lines = [];
  const logger = { warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')), info() {} };
  const m = createMailer(ENV, { timeoutMs: 40, retryDelayMs: 1, logger, fetchImpl: async () => brevoError(401, 'unauthorized', 'Key not found') });
  await assert.rejects(() => m.sendVerificationCode('ahmet.yilmaz@ornek.com', '864209'));
  const all = lines.join('\n');
  assert.match(all, /sağlayıcı=brevo/);
  assert.match(all, /tür=config/);
  assert.match(all, /durum=401/);
  assert.match(all, /unauthorized/);
  assert.match(all, /Key not found/);
  assert.ok(!all.includes('xkeysib-test'), 'API anahtarı loglanmaz');
  assert.ok(!all.includes('ahmet.yilmaz'), 'tam adres loglanmaz');
  assert.ok(!all.includes('864209'), 'kod loglanmaz');
});

test('BREVO_API_KEY yoksa eski sıra korunur ve seçim özeti açıkça söyler', () => {
  assert.equal(createMailer({ RESEND_API_KEY: 're' }, fast).kind, 'resend');
  assert.equal(createMailer({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' }, fast).kind, 'smtp');
  const c = createMailer({}, fast);
  assert.equal(c.kind, 'console');
  assert.match(c.summary, /BREVO_API_KEY/);
  assert.match(createMailer({ RESEND_API_KEY: 're' }, fast).summary, /resend/);
});

// ---------------------------------------------------------------- uçtan uca: gerçek Brevo mailer + sahte Brevo API ile send-code
import { startServer } from './helpers.js';

/** Sahte Brevo: sıradaki yanıtları sırayla verir, gönderilen kodları kaydeder */
function fakeBrevo(responses) {
  const sent = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const r = responses.shift() ?? 'ok';
    if (r === 'hang') return hang(url, init);
    if (r === 'ok') {
      sent.push({ to: body.to[0].email, code: body.textContent.match(/\b(\d{6})\b/)[1] });
      return created();
    }
    return r();
  };
  return { sent, fetchImpl };
}

const sendCode = (srv, email) => srv.req('POST', '/api/auth/send-code', { email });

test('send-code + Brevo: başarılı gönderim → 200, kodla kayıt olunur', async () => {
  const b = fakeBrevo(['ok']);
  const srv = await startServer({ mailer: createMailer(ENV, { ...fast, fetchImpl: b.fetchImpl }) });
  try {
    const r = await sendCode(srv, 'brevo-ok@example.com');
    assert.equal(r.status, 200);
    assert.equal(r.body.delivery, 'sent');
    const reg = await srv.req('POST', '/api/auth/register', { username: 'brevook', email: 'brevo-ok@example.com', password: 'secret1', code: b.sent[0].code, acceptTerms: true });
    assert.equal(reg.status, 201);
  } finally {
    srv.close();
  }
});

test('send-code + Brevo 401 (geçersiz anahtar): 503 güvenli mesaj, kod silinir, ayrıntı istemciye gitmez; tekrar deneme engellenmez', async () => {
  const b = fakeBrevo([() => brevoError(401, 'unauthorized', 'Key not found'), 'ok']);
  const srv = await startServer({ mailer: createMailer(ENV, { ...fast, fetchImpl: b.fetchImpl }) });
  try {
    const r = await sendCode(srv, 'brevo-key@example.com');
    assert.equal(r.status, 503);
    assert.equal(r.body.reason, 'unavailable');
    assert.ok(!/Key not found|unauthorized|Brevo|401|api/i.test(r.body.error), r.body.error);
    assert.equal(await srv.db.get("SELECT 1 FROM email_codes WHERE email = 'brevo-key@example.com'"), undefined);
    // anahtar düzeltilince (burada: sıradaki yanıt başarılı) kullanıcı hemen yeniden deneyebilir
    assert.equal((await sendCode(srv, 'brevo-key@example.com')).status, 200);
  } finally {
    srv.close();
  }
});

test('send-code + Brevo: iki deneme de zaman aşımı → 202 belirsiz teslim, kod korunur', async () => {
  const b = fakeBrevo(['hang', 'hang']);
  const srv = await startServer({ mailer: createMailer(ENV, { ...fast, fetchImpl: b.fetchImpl }) });
  try {
    const r = await sendCode(srv, 'brevo-slow@example.com');
    assert.equal(r.status, 202);
    assert.equal(r.body.delivery, 'uncertain');
    assert.ok(await srv.db.get("SELECT 1 FROM email_codes WHERE email = 'brevo-slow@example.com'"));
  } finally {
    srv.close();
  }
});

test('send-code + Brevo: ilk deneme 5xx, ikinci başarılı → kullanıcı için tek başarılı istek', async () => {
  const b = fakeBrevo([() => brevoError(503, 'internal_error', 'Service unavailable'), 'ok']);
  const srv = await startServer({ mailer: createMailer(ENV, { ...fast, fetchImpl: b.fetchImpl }) });
  try {
    const r = await sendCode(srv, 'brevo-retry@example.com');
    assert.equal(r.status, 200);
    assert.equal(b.sent.length, 1);
  } finally {
    srv.close();
  }
});

test('send-code + Brevo, MAIL_FROM eksik: 503 güvenli mesaj, Brevo çağrılmaz', async () => {
  let calls = 0;
  const srv = await startServer({ mailer: createMailer({ BREVO_API_KEY: 'k' }, { ...fast, fetchImpl: async () => (calls++, created()) }) });
  try {
    const r = await sendCode(srv, 'brevo-from@example.com');
    assert.equal(r.status, 503);
    assert.ok(!/MAIL_FROM/.test(r.body.error), 'yapılandırma ayrıntısı istemciye gitmez');
    assert.equal(calls, 0);
  } finally {
    srv.close();
  }
});

test('send-code + Brevo 429: 503 + Brevo\'nun bekleme süresi', async () => {
  const b = fakeBrevo([() => brevoError(429, 'too_many_requests', 'Rate limit exceeded', { 'x-sib-ratelimit-reset': '33' })]);
  const srv = await startServer({ mailer: createMailer(ENV, { ...fast, fetchImpl: b.fetchImpl }) });
  try {
    const r = await sendCode(srv, 'brevo-429@example.com');
    assert.equal(r.status, 503);
    assert.equal(r.body.reason, 'rate_limit');
    assert.equal(r.body.retryAfter, 33);
  } finally {
    srv.close();
  }
});
