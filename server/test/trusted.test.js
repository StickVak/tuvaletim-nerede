import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, SECRET } from './helpers.js';
import { signToken } from '../auth.js';

let srv;
before(async () => {
  srv = await startServer();
});
after(() => srv.close());

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** Set-Cookie'den tn_device değeri ve öznitelikleri */
function deviceCookie(res) {
  const raw = res.headers.get('set-cookie') ?? '';
  const m = raw.match(/tn_device=([^;]*)/);
  return m ? { value: m[1], raw } : null;
}
const asCookie = (c) => ({ Cookie: `tn_device=${c.value}` });
const login = (username, extra = {}, headers = {}) =>
  srv.req('POST', '/api/auth/login', { username, password: 'secret1', ...extra }, null, { 'User-Agent': ANDROID_UA, ...headers });
const refresh = (cookie, headers = {}) => srv.req('POST', '/api/auth/refresh', null, null, { ...(cookie ? asCookie(cookie) : {}), ...headers });

test('başarılı girişte cihaz çerezi: HttpOnly, SameSite=Lax, Path=/api/auth, ~90 gün; veritabanında ham değil HMAC özeti', async () => {
  await srv.registerFull('cihazci');
  const r = await login('cihazci');
  assert.equal(r.status, 200);
  const c = deviceCookie(r);
  assert.ok(c, 'tn_device çerezi verildi');
  assert.match(c.value, /^[A-Za-z0-9_-]{43,}$/, '256 bit rastgele');
  assert.match(c.raw, /HttpOnly/i);
  assert.match(c.raw, /SameSite=Lax/i);
  assert.match(c.raw, /Path=\/api\/auth/);
  const maxAge = Number(c.raw.match(/Max-Age=(\d+)/)[1]);
  assert.ok(maxAge >= 89 * 86400 && maxAge <= 91 * 86400, `Max-Age ${maxAge}`);
  assert.ok(!/;\s*Secure/i.test(c.raw), 'HTTP üzerinde Secure yok (yerel geliştirme)');
  const rows = await srv.db.all("SELECT d.* FROM trusted_devices d JOIN users u ON u.id = d.user_id WHERE u.username = 'cihazci'");
  assert.equal(rows.length, 2, 'kayıt (OTP) + giriş = iki cihaz kaydı');
  const row = rows.at(-1);
  assert.notEqual(row.device_token_hash, c.value);
  assert.ok(!JSON.stringify(rows).includes(c.value), 'ham token saklanmaz');
  assert.equal(row.device_label, 'Chrome · Android');
  assert.equal(row.revoked_at, null);
  assert.ok(Date.parse(row.expires_at) > Date.now() + 89 * 86400e3);
});

test('HTTPS arkasında (X-Forwarded-Proto: https) çerez Secure olur', async () => {
  const r = await login('cihazci', {}, { 'X-Forwarded-Proto': 'https' });
  assert.match(deviceCookie(r).raw, /;\s*Secure/i);
});

test('OTP ile kayıt tamamlanınca da cihaz güvenilir olur', async () => {
  const email = 'otpcihaz@test.local';
  await srv.req('POST', '/api/auth/send-code', { email, username: 'otpcihaz' });
  const r = await srv.req('POST', '/api/auth/register', { username: 'otpcihaz', email, password: 'secret1', code: srv.lastCode(email), acceptTerms: true }, null, { 'User-Agent': IPHONE_UA });
  assert.equal(r.status, 201);
  const c = deviceCookie(r);
  assert.ok(c);
  const ref = await refresh(c);
  assert.equal(ref.status, 200);
  assert.equal(ref.body.user.username, 'otpcihaz');
  const row = await srv.db.get("SELECT device_label FROM trusted_devices d JOIN users u ON u.id = d.user_id WHERE u.username = 'otpcihaz'");
  assert.equal(row.device_label, 'Safari · iPhone');
});

test('"Bu cihazı hatırla" kapalıysa çerez ve kayıt yok', async () => {
  await srv.registerFull('hatirlama');
  const before = (await srv.db.get('SELECT COUNT(*) AS n FROM trusted_devices')).n;
  const r = await login('hatirlama', { remember: false });
  assert.equal(r.status, 200);
  assert.equal(deviceCookie(r), null);
  assert.equal((await srv.db.get('SELECT COUNT(*) AS n FROM trusted_devices')).n, before);
});

test('refresh: geçerli cihaz → yeni erişim belirteci + kullanıcı; last_used_at ve süre güncellenir', async () => {
  await srv.registerFull('tazele');
  const c = deviceCookie(await login('tazele'));
  await srv.db.run('UPDATE trusted_devices SET last_used_at = ?, expires_at = ? WHERE device_token_hash IS NOT NULL AND user_id = (SELECT id FROM users WHERE username = ?)', [
    '2026-01-01T00:00:00.000Z', new Date(Date.now() + 5 * 86400e3).toISOString(), 'tazele',
  ]);
  const r = await refresh(c);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.username, 'tazele');
  const me = await srv.req('GET', '/api/auth/me', null, r.body.token);
  assert.equal(me.status, 200);
  const row = await srv.db.get("SELECT last_used_at, expires_at FROM trusted_devices WHERE user_id = (SELECT id FROM users WHERE username = 'tazele') ORDER BY id DESC");
  assert.ok(Date.parse(row.last_used_at) > Date.now() - 60e3, 'last_used_at güncellendi');
  assert.ok(Date.parse(row.expires_at) > Date.now() + 89 * 86400e3, 'kayan süre: 90 güne uzadı');
  assert.ok(deviceCookie(r), 'çerez süresi de yenilenir');
});

test('refresh: çerez yok / bozuk / iptal edilmiş / süresi dolmuş → 401 ve standart girişe düşer; bozuk çerez silinir', async () => {
  assert.equal((await refresh(null)).status, 401);
  const bad = await refresh({ value: 'uydurma-deger' });
  assert.equal(bad.status, 401);
  assert.match(bad.headers.get('set-cookie') ?? '', /tn_device=;.*Max-Age=0/);

  await srv.registerFull('suresi');
  const c = deviceCookie(await login('suresi'));
  await srv.db.run("UPDATE trusted_devices SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE username = 'suresi')", [new Date(Date.now() - 1000).toISOString()]);
  assert.equal((await refresh(c)).status, 401, 'süresi dolmuş');

  const c2 = deviceCookie(await login('suresi'));
  await srv.db.run("UPDATE trusted_devices SET revoked_at = ? WHERE user_id = (SELECT id FROM users WHERE username = 'suresi')", [new Date().toISOString()]);
  assert.equal((await refresh(c2)).status, 401, 'iptal edilmiş');
});

test('çıkış: yalnızca bu cihaz iptal edilir; diğer cihaz oturumu sürer; bu cihazın belirteci de geçersizleşir', async () => {
  await srv.registerFull('ikicihaz');
  const a = await login('ikicihaz');
  const b = await login('ikicihaz', {}, { 'User-Agent': IPHONE_UA });
  const ca = deviceCookie(a);
  const cb = deviceCookie(b);
  const out = await srv.req('POST', '/api/auth/logout', null, a.body.token, asCookie(ca));
  assert.equal(out.status, 204);
  assert.match(out.headers.get('set-cookie') ?? '', /tn_device=;.*Max-Age=0/, 'çerez silindi');
  assert.equal((await refresh(ca)).status, 401, 'A cihazı artık güvenilir değil');
  assert.equal((await srv.req('GET', '/api/auth/me', null, a.body.token)).status, 401, 'A cihazının erişim belirteci de geçersiz');
  assert.equal((await refresh(cb)).status, 200, 'B cihazı etkilenmedi');
  assert.equal((await srv.req('GET', '/api/auth/me', null, b.body.token)).status, 200);
});

test('çıkış çerezsiz ve belirteçsiz de güvenle çalışır (204)', async () => {
  assert.equal((await srv.req('POST', '/api/auth/logout')).status, 204);
});

test('tüm cihazlardan çıkış: tüm kayıtlar iptal, eski erişim belirteçleri reddedilir; yeniden giriş çalışır', async () => {
  await srv.registerFull('hepsi');
  const a = await login('hepsi');
  const b = await login('hepsi', {}, { 'User-Agent': IPHONE_UA });
  const out = await srv.req('POST', '/api/auth/logout-all', null, b.body.token, asCookie(deviceCookie(b)));
  assert.equal(out.status, 204);
  for (const s of [a, b]) {
    assert.equal((await refresh(deviceCookie(s))).status, 401);
    assert.equal((await srv.req('GET', '/api/auth/me', null, s.body.token)).status, 401);
  }
  const active = await srv.db.get("SELECT COUNT(*) AS n FROM trusted_devices WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE username = 'hepsi')");
  assert.equal(active.n, 0);
  const again = await login('hepsi');
  assert.equal((await srv.req('GET', '/api/auth/me', null, again.body.token)).status, 200, 'sonradan giriş geçerli');
  assert.equal((await srv.req('POST', '/api/auth/logout-all')).status, 401, 'girişsiz kullanılamaz');
});

test('cihaz listesi ve tek cihaz iptali; başkasının cihazı iptal edilemez', async () => {
  await srv.registerFull('liste');
  const a = await login('liste');
  const b = await login('liste', {}, { 'User-Agent': IPHONE_UA });
  const list = await srv.req('GET', '/api/auth/devices', null, a.body.token, asCookie(deviceCookie(a)));
  assert.equal(list.status, 200);
  const active = list.body.filter((d) => d.label === 'Chrome · Android' || d.label === 'Safari · iPhone');
  assert.ok(active.length >= 2);
  assert.equal(list.body.filter((d) => d.current).length, 1, 'bu cihaz işaretli');
  for (const k of ['device_token_hash', 'tokenHash', 'user_agent']) assert.ok(!(k in list.body[0]), k);
  const bDevice = list.body.find((d) => d.label === 'Safari · iPhone');
  await srv.registerFull('yabanci');
  const stranger = (await login('yabanci')).body.token;
  assert.equal((await srv.req('DELETE', `/api/auth/devices/${bDevice.id}`, null, stranger)).status, 404);
  assert.equal((await srv.req('DELETE', `/api/auth/devices/${bDevice.id}`, null, a.body.token)).status, 204);
  assert.equal((await srv.req('GET', '/api/auth/me', null, b.body.token)).status, 401, 'iptal edilen cihazın belirteci hemen geçersiz');
  assert.equal((await refresh(deviceCookie(b))).status, 401);
  assert.equal((await srv.req('GET', '/api/auth/me', null, a.body.token)).status, 200);
});

test('şifre değişince diğer cihazlar iptal edilir; bu cihaz sessiz tazelemeyle devam eder', async () => {
  await srv.registerFull('sifreci');
  const a = await login('sifreci');
  const b = await login('sifreci', {}, { 'User-Agent': IPHONE_UA });
  const r = await srv.req('POST', '/api/profile/password', { currentPassword: 'secret1', newPassword: 'yenisifre1' }, a.body.token, asCookie(deviceCookie(a)));
  assert.equal(r.status, 204);
  assert.equal((await refresh(deviceCookie(b))).status, 401, 'diğer cihaz iptal');
  assert.equal((await srv.req('GET', '/api/auth/me', null, b.body.token)).status, 401);
  const ra = await refresh(deviceCookie(a));
  assert.equal(ra.status, 200, 'bu cihaz güvenilir kalır');
  assert.equal((await srv.req('GET', '/api/auth/me', null, ra.body.token)).status, 200);
});

test('eski biçim belirteçler (did/iat yok) çalışmaya devam eder; tüm cihazlardan çıkıştan sonra reddedilir', async () => {
  const { user } = await srv.registerFull('eskibelirtec');
  const legacy = signToken({ id: user.id, role: 'user' }, SECRET);
  assert.equal((await srv.req('GET', '/api/auth/me', null, legacy)).status, 200);
  const fresh = (await login('eskibelirtec')).body.token;
  await srv.req('POST', '/api/auth/logout-all', null, fresh);
  assert.equal((await srv.req('GET', '/api/auth/me', null, legacy)).status, 401);
});

test('kullanıcı silinince güvenilir cihazları da silinir', async () => {
  await srv.registerFull('silinecek');
  const c = deviceCookie(await login('silinecek'));
  const u = await srv.db.get("SELECT id FROM users WHERE username = 'silinecek'");
  assert.equal((await srv.admin('DELETE', `/api/admin/users/${u.id}`)).status, 204);
  assert.equal((await srv.db.get('SELECT COUNT(*) AS n FROM trusted_devices WHERE user_id = ?', [u.id])).n, 0);
  assert.equal((await refresh(c)).status, 401);
});
