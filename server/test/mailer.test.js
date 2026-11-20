import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer } from '../mailer.js';

test('RESEND_API_KEY varsa Resend API kullanılır', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  };
  const m = createMailer({ RESEND_API_KEY: 're_test', MAIL_FROM: 'Tuvaletim <noreply@ornek.com>', SMTP_HOST: 'smtp.x' }, { fetchImpl });
  assert.equal(m.kind, 'resend');
  await m.sendVerificationCode('ali@example.com', '123456');
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ['ali@example.com']);
  assert.equal(body.from, 'Tuvaletim <noreply@ornek.com>');
  assert.match(body.text, /123456/);
  assert.match(body.html, /123456/);
});

test('Resend hata dönerse gönderim hata fırlatır', async () => {
  const m = createMailer({ RESEND_API_KEY: 're_test' }, { fetchImpl: async () => new Response('{"message":"bad"}', { status: 422 }) });
  await assert.rejects(() => m.sendVerificationCode('ali@example.com', '123456'), /Resend/);
});

test('SMTP_HOST/USER/PASS varsa Nodemailer kullanılır', async () => {
  const sent = [];
  const createTransport = (opts) => {
    assert.equal(opts.host, 'smtp.ornek.com');
    assert.equal(opts.port, 465);
    assert.equal(opts.secure, true);
    assert.deepEqual(opts.auth, { user: 'u@ornek.com', pass: 'p' });
    return { sendMail: async (msg) => void sent.push(msg) };
  };
  const m = createMailer({ SMTP_HOST: 'smtp.ornek.com', SMTP_PORT: '465', SMTP_USER: 'u@ornek.com', SMTP_PASS: 'p' }, { createTransport });
  assert.equal(m.kind, 'smtp');
  await m.sendVerificationCode('ali@example.com', '654321');
  assert.equal(sent[0].to, 'ali@example.com');
  assert.equal(sent[0].from, 'u@ornek.com');
  assert.match(sent[0].text, /654321/);
});

test('yapılandırma yoksa kod sunucu konsoluna yazılır', async () => {
  const lines = [];
  const m = createMailer({}, { log: (s) => lines.push(s) });
  assert.equal(m.kind, 'console');
  await m.sendVerificationCode('ali@example.com', '111222');
  assert.ok(lines.some((l) => l.includes('ali@example.com') && l.includes('111222')));
});

test('eksik SMTP bilgisi konsola düşer', () => {
  assert.equal(createMailer({ SMTP_HOST: 'smtp.x' }).kind, 'console');
});

// ---------------------------------------------------------------- zaman aşımı, yeniden deneme, hata türleri
import { MailError, maskEmail } from '../mailer.js';

const quiet = { warn() {}, error() {}, info() {} };
const fast = { timeoutMs: 40, retryDelayMs: 5, logger: quiet };
const ok200 = () => new Response(JSON.stringify({ id: 'x' }), { status: 200 });
/** İsteği hiç yanıtlamayan sahte sunucu: yalnızca zaman aşımı sinyaliyle reddedilir */
const hang = (_url, init) =>
  new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));

test('Resend: istek zaman aşımına uğrarsa 1 kez yeniden denenir, ikincisi başarılıysa gönderim tamam', async () => {
  let n = 0;
  const m = createMailer({ RESEND_API_KEY: 're' }, { ...fast, fetchImpl: (u, i) => (++n === 1 ? hang(u, i) : ok200()) });
  await m.sendVerificationCode('ali@example.com', '123456');
  assert.equal(n, 2);
});

test('Resend: iki deneme de zaman aşımına uğrarsa MailError(timeout), toplam 2 deneme', async () => {
  let n = 0;
  const m = createMailer({ RESEND_API_KEY: 're' }, { ...fast, fetchImpl: (u, i) => (n++, hang(u, i)) });
  const started = Date.now();
  await assert.rejects(() => m.sendVerificationCode('ali@example.com', '123456'), (e) => {
    assert.ok(e instanceof MailError);
    assert.equal(e.kind, 'timeout');
    assert.equal(e.attempts, 2);
    assert.equal(e.provider, 'resend');
    return true;
  });
  assert.equal(n, 2);
  assert.ok(Date.now() - started < 1000, 'zaman aşımı gerçekten uygulanıyor');
});

test('varsayılan zaman aşımı 8000 ms', () => {
  assert.equal(createMailer({ RESEND_API_KEY: 're' }).timeoutMs, 8000);
});

test('Resend: ağ hatası (bağlantı koptu) yeniden denenir; ikinci deneme de aynı kodu gönderir', async () => {
  const bodies = [];
  const fetchImpl = async (_u, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    return ok200();
  };
  await createMailer({ RESEND_API_KEY: 're' }, { ...fast, fetchImpl }).sendVerificationCode('ali@example.com', '424242');
  assert.equal(bodies.length, 2);
  assert.match(bodies[1].text, /424242/);
});

test('Resend: 429 rate-limit yeniden denenmez; Retry-After saniyesi hataya taşınır', async () => {
  let n = 0;
  const fetchImpl = async () => (n++, new Response('{"message":"Too many requests"}', { status: 429, headers: { 'Retry-After': '42' } }));
  await assert.rejects(() => createMailer({ RESEND_API_KEY: 're' }, { ...fast, fetchImpl }).sendVerificationCode('a@b.co', '111111'), (e) => {
    assert.equal(e.kind, 'rate_limit');
    assert.equal(e.retryAfter, 42);
    assert.equal(e.retryable, false);
    return true;
  });
  assert.equal(n, 1);
});

test('Resend: 5xx sağlayıcı hatası yeniden denenir; 401/422 (yapılandırma/ret) denenmez', async () => {
  let n = 0;
  await createMailer({ RESEND_API_KEY: 're' }, { ...fast, fetchImpl: async () => (++n === 1 ? new Response('{}', { status: 503 }) : ok200()) })
    .sendVerificationCode('a@b.co', '1');
  assert.equal(n, 2);
  for (const [status, kind] of [[401, 'config'], [403, 'config'], [422, 'provider']]) {
    let calls = 0;
    const m = createMailer({ RESEND_API_KEY: 're' }, { ...fast, fetchImpl: async () => (calls++, new Response('{"message":"x"}', { status })) });
    await assert.rejects(() => m.sendVerificationCode('a@b.co', '1'), (e) => e.kind === kind && e.status === status);
    assert.equal(calls, 1, `${status} yeniden denenmez`);
  }
});

test('SMTP: yanıt vermeyen sunucu zaman aşımına uğrar ve 1 kez yeniden denenir; nodemailer zaman aşımları ayarlı', async () => {
  let opts;
  let n = 0;
  const createTransport = (o) => {
    opts = o;
    return { sendMail: () => (n++, new Promise(() => {})) };
  };
  const m = createMailer({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' }, { ...fast, createTransport });
  await assert.rejects(() => m.sendVerificationCode('a@b.co', '1'), (e) => e.kind === 'timeout' && e.attempts === 2);
  assert.equal(n, 2);
  assert.equal(opts.connectionTimeout, 40);
  assert.equal(opts.greetingTimeout, 40);
  assert.equal(opts.socketTimeout, 40);
});

test('SMTP: ağ hatası yeniden denenir; kimlik doğrulama (535) denenmez', async () => {
  let n = 0;
  const flaky = () => ({ sendMail: async () => { if (++n === 1) throw Object.assign(new Error('Connection closed'), { code: 'ECONNECTION' }); } });
  await createMailer({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' }, { ...fast, createTransport: flaky }).sendVerificationCode('a@b.co', '1');
  assert.equal(n, 2);
  let calls = 0;
  const auth = () => ({ sendMail: async () => { calls++; throw Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 }); } });
  await assert.rejects(
    () => createMailer({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' }, { ...fast, createTransport: auth }).sendVerificationCode('a@b.co', '1'),
    (e) => e.kind === 'config',
  );
  assert.equal(calls, 1);
});

test('loglar: her deneme ve son hata türüyle yazılır, e-posta maskelenir, kod loglanmaz', async () => {
  const lines = [];
  const logger = { warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')), info() {} };
  const m = createMailer({ RESEND_API_KEY: 're' }, { timeoutMs: 30, retryDelayMs: 1, logger, fetchImpl: hang });
  await assert.rejects(() => m.sendVerificationCode('ahmet.yilmaz@ornek.com', '987654'));
  const all = lines.join('\n');
  assert.match(all, /tür=timeout/);
  assert.match(all, /deneme=1\/2/);
  assert.match(all, /a\*\*\*@ornek\.com/);
  assert.ok(!all.includes('ahmet.yilmaz'), 'tam adres loglanmaz');
  assert.ok(!all.includes('987654'), 'kod loglanmaz');
  assert.equal(maskEmail('x@y.com'), 'x***@y.com');
});
