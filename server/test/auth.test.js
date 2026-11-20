import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, SECRET } from './helpers.js';
import { signToken } from '../auth.js';

let srv;
before(async () => {
  srv = await startServer();
});
after(() => srv.close());

const send = (email, username) => srv.req('POST', '/api/auth/send-code', { email, ...(username ? { username } : {}) });
const reg = (body) => srv.req('POST', '/api/auth/register', { password: 'secret1', acceptTerms: true, ...body });

test('kod iste → 6 haneli kod e-postaya gider; kodla kayıt → 201', async () => {
  const s = await send('Ayse@Example.com', 'ayse');
  assert.equal(s.status, 200);
  assert.equal(s.body.expiresIn, 600);
  assert.equal(s.body.resendIn, 60);
  const code = srv.lastCode('ayse@example.com');
  assert.match(code, /^\d{6}$/);
  const r = await reg({ username: 'ayse', email: 'ayse@example.com', code });
  assert.equal(r.status, 201);
  assert.equal(typeof r.body.token, 'string');
  assert.equal(r.body.user.username, 'ayse');
  assert.equal(r.body.user.role, 'user');
  assert.equal(r.body.user.password_hash, undefined);
  assert.equal((await srv.db.get("SELECT email FROM users WHERE username = 'ayse'")).email, 'ayse@example.com', 'küçük harfe çevrilir');
  // kod tek kullanımlık
  assert.equal((await reg({ username: 'ayse2', email: 'ayse@example.com', code })).status, 409);
});

test('kod saklanırken düz metin tutulmaz', async () => {
  await send('gizli@example.com');
  const row = (await srv.db.get("SELECT * FROM email_codes WHERE email = 'gizli@example.com'"));
  assert.ok(row);
  assert.ok(!JSON.stringify(row).includes(srv.lastCode('gizli@example.com')));
});

test('e-posta zorunlu ve geçerli olmalı; kodsuz kayıt olmaz', async () => {
  assert.equal((await send('')).status, 400);
  assert.equal((await send('gecersiz')).status, 400);
  assert.equal((await reg({ username: 'epostasiz' })).status, 400);
  assert.equal((await reg({ username: 'kodsuz', email: 'kodsuz@example.com' })).status, 400);
  assert.equal((await reg({ username: 'kodsuz', email: 'kodsuz@example.com', code: '123456' })).status, 400, 'kod istenmemiş');
});

test('kayıtlı e-posta ya da alınmış kullanıcı adı için kod gönderilmez (409)', async () => {
  await srv.registerFull('mehmet', 'secret1', 'mehmet@example.com');
  const before = srv.outbox.length;
  const r = await send('MEHMET@example.com');
  assert.equal(r.status, 409);
  assert.match(r.body.error, /e-posta/i);
  const u = await send('baska@example.com', 'MEHMET');
  assert.equal(u.status, 409);
  assert.match(u.body.error, /kullanıcı adı/i);
  assert.equal(srv.outbox.length, before, 'mail gitmedi');
});

test('aynı adrese 60 saniyede ikinci kod → 429 + Retry-After', async () => {
  assert.equal((await send('acele@example.com')).status, 200);
  const res = await fetch(srv.url + '/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'acele@example.com' }) });
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 50);
  // 60 sn geçmiş gibi yap → yeni kod, eski kod geçersiz
  const old = srv.lastCode('acele@example.com');
  await srv.db.run("UPDATE email_codes SET next_send_at = ? WHERE email = 'acele@example.com'", [new Date(Date.now() - 1000).toISOString()]);
  assert.equal((await send('acele@example.com')).status, 200);
  const fresh = srv.lastCode('acele@example.com');
  if (fresh !== old) assert.equal((await reg({ username: 'acele', email: 'acele@example.com', code: old })).status, 400);
  assert.equal((await reg({ username: 'acele', email: 'acele@example.com', code: fresh })).status, 201);
});

test('süresi dolmuş kod (10 dk) reddedilir', async () => {
  await send('gec@example.com');
  (await srv.db.run("UPDATE email_codes SET expires_at = ? WHERE email = 'gec@example.com'", [new Date(Date.now() - 1000).toISOString()]));
  const r = await reg({ username: 'gec', email: 'gec@example.com', code: srv.lastCode('gec@example.com') });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /süresi/i);
});

test('5 hatalı denemeden sonra kod geçersiz olur', async () => {
  await send('deneme@example.com');
  const code = srv.lastCode('deneme@example.com');
  const wrong = code === '000000' ? '111111' : '000000';
  const msgs = [];
  for (let i = 0; i < 5; i++) {
    const r = await reg({ username: 'deneme', email: 'deneme@example.com', code: wrong });
    assert.equal(r.status, 400);
    msgs.push(r.body.error);
  }
  assert.match(msgs[0], /Kalan deneme: 4/);
  assert.match(msgs[4], /yeni kod/i);
  const r = await reg({ username: 'deneme', email: 'deneme@example.com', code });
  assert.equal(r.status, 400, 'doğru kod bile artık geçmez');
});

// ---------------------------------------------------------------- gönderim hataları: kararlı akış
const { MailError } = await import('../mailer.js');

test('zaman aşımı (belirsiz teslim): kod korunur, 202 delivery=uncertain; e-posta geç ulaşırsa kod geçerli', async () => {
  srv.failMail(new MailError('timeout', 'Resend: zaman aşımı', { provider: 'resend', attempts: 2 }), { deliveredAnyway: true });
  const r = await send('gecikme@example.com', 'gecikme');
  assert.equal(r.status, 202);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.delivery, 'uncertain');
  assert.equal(r.body.expiresIn, 600);
  assert.ok(r.body.resendIn > 0 && r.body.resendIn <= 20, `kısa bekleme: ${r.body.resendIn}`);
  assert.match(r.body.message, /gecik/i);
  assert.ok(await srv.db.get("SELECT 1 FROM email_codes WHERE email = 'gecikme@example.com'"), 'kod kaydı silinmedi');
  // geç ulaşan e-postadaki kod çalışır
  const ok = await reg({ username: 'gecikme', email: 'gecikme@example.com', code: srv.lastCode('gecikme@example.com') });
  assert.equal(ok.status, 201);
});

test('belirsiz teslimden sonra kısa bekleme dolunca yeni kod istenebilir; erken istek 429 ve saniye bildirir', async () => {
  srv.failMail(new MailError('timeout', 'x', { provider: 'resend' }));
  const first = await send('tekrar@example.com');
  assert.equal(first.status, 202);
  const early = await send('tekrar@example.com');
  assert.equal(early.status, 429);
  assert.ok(early.body.retryAfter > 0 && early.body.retryAfter <= first.body.resendIn);
  await srv.db.run("UPDATE email_codes SET next_send_at = ? WHERE email = 'tekrar@example.com'", [new Date(Date.now() - 1000).toISOString()]);
  const again = await send('tekrar@example.com');
  assert.equal(again.status, 200);
  assert.equal(again.body.delivery, 'sent');
  assert.equal(again.body.resendIn, 60, 'başarılı gönderimden sonra normal 60 sn');
});

test('sağlayıcı rate-limit: kod silinir, 503 + Retry-After sağlayıcının süresi; mesaj ne zaman denenebileceğini söyler', async () => {
  srv.failMail(new MailError('rate_limit', 'Resend 429: daily quota', { provider: 'resend', retryAfter: 37 }));
  const res = await fetch(srv.url + '/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'kota@example.com' }) });
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '37');
  assert.equal(body.retryAfter, 37);
  assert.equal(body.reason, 'rate_limit');
  assert.match(body.error, /37 saniye/);
  assert.ok(!/quota|Resend/i.test(body.error), 'sağlayıcı ayrıntısı sızmaz');
  assert.equal(await srv.db.get("SELECT 1 FROM email_codes WHERE email = 'kota@example.com'"), undefined);
  // kod silindiği için hemen yeni istek yapılabilir (sunucu tarafında kilit yok)
  assert.equal((await send('kota@example.com')).status, 200);
});

test('ağ hatası (yeniden deneme de başarısız): 503, kısa bekleme; yapılandırma hatası: 503, genel mesaj', async () => {
  srv.failMail(new MailError('network', 'Resend: ağ hatası (ECONNRESET)', { provider: 'resend', attempts: 2 }));
  const net = await send('ag@example.com');
  assert.equal(net.status, 503);
  assert.equal(net.body.reason, 'network');
  assert.ok(net.body.retryAfter >= 5 && net.body.retryAfter <= 30);
  assert.ok(!/ECONNRESET|Resend/.test(net.body.error));

  srv.failMail(new MailError('config', 'Resend 401 (API anahtarı / alan adı): invalid key', { provider: 'resend', status: 401 }));
  const cfg = await send('ayar@example.com');
  assert.equal(cfg.status, 503);
  assert.equal(cfg.body.reason, 'unavailable');
  assert.ok(cfg.body.retryAfter >= 60);
  assert.ok(!/401|key|Resend|anahtar/i.test(cfg.body.error), 'yapılandırma ayrıntısı kullanıcıya gösterilmez');
});

test('beklenmeyen (sınıflanmamış) hata da güvenli mesajla 503 döner, kod silinir', async () => {
  srv.failMail(new Error('SMTP kapalı'));
  const r = await send('hata@example.com');
  assert.equal(r.status, 503);
  assert.ok(!/SMTP/.test(r.body.error));
  assert.equal((await srv.db.get('SELECT COUNT(*) AS n FROM email_codes WHERE email = ?', ['hata@example.com'])).n, 0);
});

test('short password / invalid username → 400 (kod gönderilmeden de)', async () => {
  assert.equal((await send('kisa@example.com', 'a b')).status, 400);
  await send('kisa@example.com', 'kisa');
  assert.equal((await reg({ username: 'kisa', email: 'kisa@example.com', password: '123', code: srv.lastCode('kisa@example.com') })).status, 400);
});

test('login wrong password → 401', async () => {
  await srv.registerFull('zeynep');
  const r = await srv.req('POST', '/api/auth/login', { username: 'zeynep', password: 'wrongpass' });
  assert.equal(r.status, 401);
});

test('login by email → 200', async () => {
  await srv.registerFull('can', 'secret1', 'can@example.com');
  const r = await srv.req('POST', '/api/auth/login', { username: 'CAN@example.com', password: 'secret1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.username, 'can');
});

test('me with valid token → user', async () => {
  const token = await srv.register('elif');
  const r = await srv.req('GET', '/api/auth/me', null, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.username, 'elif');
});

test('me with tampered token → 401', async () => {
  const token = await srv.register('deniz');
  const [payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), role: 'admin' })).toString('base64url');
  const r = await srv.req('GET', '/api/auth/me', null, `${forged}.${sig}`);
  assert.equal(r.status, 401);
});

test('me with expired token → 401', async () => {
  const token = signToken({ id: 1, role: 'user', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET);
  const r = await srv.req('GET', '/api/auth/me', null, token);
  assert.equal(r.status, 401);
});

test('artık kullanıcı tabanlı yönetici hesabı yok (eski admin/admin123 girişi çalışmaz)', async () => {
  const r = await srv.req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  assert.equal(r.status, 401);
});
