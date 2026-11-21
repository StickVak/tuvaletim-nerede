import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { RESET_INVALID, RESET_SENT } from '../routes/auth.js';
import { MailError } from '../mailer.js';

let srv;
before(async () => {
  srv = await startServer();
});
after(() => srv.close());

const request = (email, s = srv) => s.req('POST', '/api/auth/password-reset/request', { email });
const confirm = (email, code, newPassword = 'yeniSifre1', s = srv) => s.req('POST', '/api/auth/password-reset/confirm', { email, code, newPassword });
const login = (username, password, s = srv) => s.req('POST', '/api/auth/login', { username, password });
const wrongCode = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
const resetRow = (email) => srv.db.get('SELECT r.* FROM password_resets r JOIN users u ON u.id = r.user_id WHERE u.email_key = ?', [email]);
const tick = () => new Promise((r) => setTimeout(r, 50));

test('talep: kayıtlı ve kayıtsız e-posta için birebir aynı yanıt; yalnızca kayıtlıya kod gider; biçim hatası 400', async () => {
  await srv.registerFull('unutkan');
  const known = await request('unutkan@test.local');
  const unknown = await request('hic-yok@example.com');
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(known.body.message, RESET_SENT);
  assert.ok(await srv.lastResetCode('unutkan@test.local'));
  await tick();
  assert.ok(!srv.resetOutbox.some((m) => m.to === 'hic-yok@example.com'));
  const bad = await request('gecersiz');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.field, 'email');
});

test('kod veritabanında düz metin değil HMAC özeti, 15 dk geçerli', async () => {
  await srv.registerFull('ozetkod');
  await request('ozetkod@test.local');
  const code = await srv.lastResetCode('ozetkod@test.local');
  const row = await resetRow('ozetkod@test.local');
  assert.match(row.code_hash, /^[a-f0-9]{64}$/);
  assert.ok(!row.code_hash.includes(code));
  const ttl = Date.parse(row.expires_at) - Date.now();
  assert.ok(ttl > 14 * 60e3 && ttl <= 15 * 60e3);
});

test('geçerli kod: şifre güncellenir; eski şifre, eski belirteç ve güvenilir cihazlar geçersiz; kod tek kullanımlık', async () => {
  const { token } = await srv.registerFull('sifirlayan', 'eskiSifre1');
  const dev = await login('sifirlayan', 'eskiSifre1');
  const deviceCookie = dev.headers.get('set-cookie').match(/tn_device=([^;]+)/)[1];
  await request('sifirlayan@test.local');
  const code = await srv.lastResetCode('sifirlayan@test.local');

  const ok = await confirm('SIFIRLAYAN@test.local', code, 'yeniSifre1');
  assert.equal(ok.status, 200);
  assert.match(ok.body.message, /Şifreniz güncellendi/);
  assert.match(ok.headers.get('set-cookie') ?? '', /tn_device=;.*Max-Age=0/);

  assert.equal((await login('sifirlayan', 'eskiSifre1')).status, 401, 'eski şifre');
  assert.equal((await login('sifirlayan', 'yeniSifre1')).status, 200, 'yeni şifre');
  assert.equal((await srv.req('GET', '/api/auth/me', null, token)).status, 401, 'eski erişim belirteci');
  assert.equal((await srv.req('GET', '/api/auth/me', null, dev.body.token)).status, 401, 'eski cihazın belirteci');
  assert.equal((await srv.req('POST', '/api/auth/refresh', null, null, { Cookie: `tn_device=${deviceCookie}` })).status, 401, 'güvenilir cihaz');
  const u = await srv.db.get("SELECT password_hash, email_verified FROM users WHERE username = 'sifirlayan'");
  assert.match(u.password_hash, /^scrypt\$/);
  assert.equal(u.email_verified, 1);

  const again = await confirm('sifirlayan@test.local', code, 'baskaSifre1');
  assert.equal(again.status, 400, 'aynı kod ikinci kez kullanılamaz');
  assert.equal(again.body.error, RESET_INVALID);
});

test('hatalı kod / kayıtsız e-posta / süresi dolmuş kod: hepsi aynı mesaj; 5 hatalı denemeden sonra doğru kod da geçmez', async () => {
  await srv.registerFull('denemeci');
  await request('denemeci@test.local');
  const code = await srv.lastResetCode('denemeci@test.local');

  const unknown = await confirm('hic-yok@example.com', code);
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error, RESET_INVALID);
  for (let i = 0; i < 5; i++) {
    const r = await confirm('denemeci@test.local', wrongCode(code));
    assert.equal(r.status, 400);
    assert.equal(r.body.error, RESET_INVALID, 'kalan deneme sayısı söylenmez (hesap varlığını sızdırmaz)');
  }
  assert.equal(await resetRow('denemeci@test.local'), undefined, 'kod silindi');
  assert.equal((await confirm('denemeci@test.local', code)).status, 400, 'doğru kod artık geçersiz');

  // süresi dolmuş
  await srv.db.run('DELETE FROM password_resets');
  await request('denemeci@test.local');
  const code2 = await srv.lastResetCode('denemeci@test.local');
  await srv.db.run('UPDATE password_resets SET expires_at = ?', [new Date(Date.now() - 1000).toISOString()]);
  const expired = await confirm('denemeci@test.local', code2);
  assert.equal(expired.status, 400);
  assert.equal(expired.body.error, RESET_INVALID);
  assert.equal((await login('denemeci', 'secret1')).status, 200, 'şifre değişmedi');
});

test('yeni şifre kuralları sunucuda: kısa/uzun/metin olmayan şifre 400, kod harcanmaz', async () => {
  await srv.registerFull('kuralci');
  await request('kuralci@test.local');
  const code = await srv.lastResetCode('kuralci@test.local');
  for (const pw of ['12345', 'x'.repeat(129), 12345678, null]) {
    const r = await confirm('kuralci@test.local', code, pw);
    assert.equal(r.status, 400, String(pw).slice(0, 10));
    assert.equal(r.body.field, 'password');
  }
  assert.equal((await confirm('kuralci@test.local', '12ab56')).body.field, 'code');
  assert.equal((await resetRow('kuralci@test.local')).attempts, 0, 'biçim hataları deneme hakkı yemez');
  assert.equal((await confirm('kuralci@test.local', code, 'gecerli1')).status, 200);
});

test('yeni talep eski kodu geçersiz kılar; 60 sn içindeki ikinci talep sessizce gönderilmez (aynı yanıt)', async () => {
  await srv.registerFull('tekrarci');
  await request('tekrarci@test.local');
  const first = await srv.lastResetCode('tekrarci@test.local');
  const sentBefore = srv.resetOutbox.length;
  const r = await request('tekrarci@test.local');
  assert.equal(r.status, 200);
  assert.equal(r.body.message, RESET_SENT);
  await tick();
  assert.equal(srv.resetOutbox.length, sentBefore, '60 sn dolmadan ikinci e-posta yok');

  await srv.db.run("UPDATE password_resets SET sent_at = ? WHERE user_id = (SELECT id FROM users WHERE username = 'tekrarci')", [new Date(Date.now() - 61_000).toISOString()]);
  await request('tekrarci@test.local');
  await tick();
  const second = await srv.lastResetCode('tekrarci@test.local');
  if (second !== first) assert.equal((await confirm('tekrarci@test.local', first)).status, 400, 'eski kod geçersiz');
  assert.equal((await confirm('tekrarci@test.local', second)).status, 200);
});

test('aynı kodla eşzamanlı iki istekten yalnızca biri başarılı olur', async () => {
  await srv.registerFull('yarisci');
  await request('yarisci@test.local');
  const code = await srv.lastResetCode('yarisci@test.local');
  const results = await Promise.all([confirm('yarisci@test.local', code, 'birinci11'), confirm('yarisci@test.local', code, 'ikinci22')]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
});

test('yalnızca Google ile açılmış (şifresiz) hesap da e-posta koduyla şifre belirleyebilir', async () => {
  const { lastId } = await srv.db.run(
    "INSERT INTO users (username, username_key, email, email_key, email_verified, google_id, password_hash, role, created_at) VALUES ('googleci', 'googleci', 'g@example.com', 'g@example.com', 1, 'sub-1', 'oauth$abc', 'user', ?)",
    [new Date().toISOString()],
  );
  assert.ok(lastId);
  await request('g@example.com');
  const code = await srv.lastResetCode('g@example.com');
  assert.equal((await confirm('g@example.com', code, 'artikSifre1')).status, 200);
  assert.equal((await login('googleci', 'artikSifre1')).status, 200);
});

test('e-posta gönderilemese de yanıt aynı (hata yalnızca logda)', async () => {
  await srv.registerFull('postasiz');
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    srv.failMail(new MailError('config', 'MAIL_FROM tanımlı değil', { provider: 'brevo' }));
    const r = await request('postasiz@test.local');
    assert.equal(r.status, 200);
    assert.equal(r.body.message, RESET_SENT);
    await tick();
    assert.ok(errors.some((l) => l.includes('şifre sıfırlama kodu gönderilemedi') && !l.includes('postasiz@test.local')), 'loglandı, adres maskeli');
  } finally {
    console.error = orig;
  }
});

test('hız sınırı: talepte IP ve e-posta başına (kayıtlı/kayıtsız aynı), doğrulamada e-posta başına hatalı deneme', async () => {
  const s = await startServer({
    limits: {
      resetRequestEmail: { windowMs: 60_000, max: 2 },
      resetConfirmEmail: { windowMs: 60_000, max: 2 },
    },
  });
  try {
    await s.registerFull('sinirli');
    for (const email of ['sinirli@test.local', 'kayitsiz@example.com']) {
      assert.equal((await request(email, s)).status, 200);
      assert.equal((await request(email, s)).status, 200);
      const third = await request(email, s);
      assert.equal(third.status, 429, email);
      assert.match(third.body.error, /Bu e-posta için çok fazla şifre sıfırlama isteği yapıldı\. Lütfen \d+ (saniye|dakika) sonra/);
      assert.ok(Number(third.headers.get('retry-after')) > 0);
    }
    const code = await s.lastResetCode('sinirli@test.local');
    assert.equal((await confirm('sinirli@test.local', wrongCode(code), 'yeniSifre1', s)).status, 400);
    assert.equal((await confirm('sinirli@test.local', wrongCode(code), 'yeniSifre1', s)).status, 400);
    assert.equal((await confirm('sinirli@test.local', code, 'yeniSifre1', s)).status, 429, 'hatalı deneme sınırı doldu');
  } finally {
    s.close();
  }
});
