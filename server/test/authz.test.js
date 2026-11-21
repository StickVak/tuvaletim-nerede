/**
 * Yetkilendirme denetimi regresyon testleri: yönetim uçları, kitlesel atama (mass assignment), IDOR ve
 * istemci kodunda gizli bilgi / yönetim ucu bulunmaması.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, ADMIN_KEY } from './helpers.js';
import { adminRoutes } from '../routes/admin.js';

const SEED = [{ id: 'p1', name: 'Mekan Bir', category: 'avm', lat: 38.4, lng: 27.1 }];
let srv;
before(async () => {
  srv = await startServer({ seed: SEED });
});
after(() => srv.close());

/** Yönetim yönlendiricisine kayıtlı TÜM uçlar (yeni eklenen uç da otomatik kapsanır) */
function allAdminEndpoints() {
  const router = adminRoutes(srv.db, { photos: {}, avatars: {} });
  const out = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const path = layer.route.path.replace(':placeId', 'p1').replace(':id', '1');
    for (const m of Object.keys(layer.route.methods)) out.push([m.toUpperCase(), `/api/admin${path}`]);
  }
  return out;
}

/** Değişmemesi gereken veritabanı durumu */
const snapshot = async () =>
  JSON.stringify(await Promise.all(['users', 'places', 'votes', 'pending_places', 'status_reports', 'trusted_devices'].map((t) => srv.db.all(`SELECT * FROM ${t} ORDER BY rowid`))));

test('yönetim uçlarının HEPSİ: anahtarsız, yanlış/boş anahtar, kullanıcı belirteci ve atlatma denemeleri → 401; veri değişmez', async () => {
  const user = await srv.register('siradankullanici');
  const endpoints = allAdminEndpoints();
  assert.ok(endpoints.length >= 15, `uç sayısı: ${endpoints.length}`);
  const before = await snapshot();
  const attempts = [
    ['anahtarsız', {}],
    ['yanlış anahtar', { 'X-Admin-Key': 'yanlis-anahtar-1234567890' }],
    ['anahtarın öneki', { 'X-Admin-Key': ADMIN_KEY.slice(0, -1) }],
    ['boş anahtar', { 'X-Admin-Key': '' }],
    ['kullanıcı belirteci', { Authorization: `Bearer ${user}` }],
    ['sahte başlıklar', { 'X-Admin': '1', 'X-Role': 'admin', 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1', Admin: 'true' }],
  ];
  for (const [method, path] of endpoints) {
    for (const [label, headers] of attempts) {
      for (const suffix of ['', '?admin=1&debug=1&role=admin&key=1']) {
        const res = await fetch(srv.url + path + suffix, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify({ closed: true, name: 'Ele geçirildi' }),
        });
        assert.equal(res.status, 401, `${method} ${path}${suffix} (${label}) → ${res.status}`);
      }
    }
  }
  // Büyük/küçük harf ve yol oyunları da aynı korumaya düşer ya da hiç eşleşmez
  for (const p of ['/API/ADMIN/users', '/api/Admin/stats', '/api/admin/users/', '/api/admin/../admin/users']) {
    const s = (await fetch(srv.url + p)).status;
    assert.ok(s === 401 || s === 404, `${p} → ${s}`);
  }
  assert.equal(await snapshot(), before, 'hiçbir yetkisiz istek veriyi değiştirmedi');
});

test('veritabanında role = "admin" olan kullanıcı da yönetim API\'sine erişemez (yetki yalnızca ADMIN_SECRET_KEY)', async () => {
  const { token, user } = await srv.registerFull('rolhilesi');
  await srv.db.run("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
  assert.equal((await srv.req('GET', '/api/admin/users', null, token)).status, 401);
  assert.equal((await srv.req('DELETE', '/api/admin/places/p1', null, token)).status, 401);
  assert.ok(await srv.db.get("SELECT 1 FROM places WHERE id = 'p1'"));
  await srv.db.run("UPDATE users SET role = 'user' WHERE id = ?", [user.id]);
});

test('kitlesel atama: kayıt ve profil gövdesindeki role/id/email/şifre özeti/google_id alanları yok sayılır', async () => {
  const email = 'kitlesel@example.com';
  await srv.req('POST', '/api/auth/send-code', { email, username: 'kitlesel' });
  const reg = await srv.req('POST', '/api/auth/register', {
    username: 'kitlesel', email, password: 'secret1', code: srv.lastCode(email), acceptTerms: true,
    role: 'admin', id: 1, email_verified: 0, google_id: 'x', tokens_valid_after: null,
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.role, 'user');
  const token = reg.body.token;
  const other = await srv.registerFull('kurban');
  const r = await srv.req('PATCH', '/api/profile', {
    displayName: 'Yeni Ad', role: 'admin', id: other.user.id, userId: other.user.id, email: 'kurban@test.local',
    password_hash: 'x', google_id: 'y', avatar_url: 'https://evil.example/x.png',
  }, token);
  assert.equal(r.status, 200);
  const me = await srv.db.get('SELECT * FROM users WHERE id = ?', [reg.body.user.id]);
  assert.equal(me.role, 'user');
  assert.equal(me.email, email);
  assert.equal(me.google_id, null);
  assert.equal(me.avatar_url, null);
  assert.equal(me.display_name, 'Yeni Ad');
  const victim = await srv.db.get('SELECT display_name, role FROM users WHERE id = ?', [other.user.id]);
  assert.equal(victim.display_name, 'kurban', 'başka kullanıcının kaydı değişmedi');
});

test('IDOR: oy, favori, profil, cihaz ve çıkış işlemleri yalnızca isteği yapanın kaydını etkiler', async () => {
  const a = await srv.registerFull('sahipa');
  const b = await srv.registerFull('saldirganb');
  // A'nın oyu
  await srv.req('PUT', '/api/places/p1/vote', { cleanliness: 5, comfort: 5, isPaid: false, comment: 'A yorumu' }, a.token);
  // B gövdeye A'nın kimliğini koysa da yalnızca kendi oyunu yazar
  await srv.req('PUT', '/api/places/p1/vote', { cleanliness: 1, comfort: 1, isPaid: false, comment: 'B yorumu', userId: a.user.id, user_id: a.user.id }, b.token);
  const aVote = await srv.db.get('SELECT cleanliness, comment FROM votes WHERE user_id = ? AND place_id = ?', [a.user.id, 'p1']);
  assert.deepEqual({ ...aVote }, { cleanliness: 5, comment: 'A yorumu' });
  // Favori: B'nin silmesi A'nınkini silmez
  await srv.req('PUT', '/api/favorites/p1', null, a.token);
  await srv.req('DELETE', '/api/favorites/p1', { userId: a.user.id }, b.token);
  assert.ok(await srv.db.get('SELECT 1 FROM favorites WHERE user_id = ? AND place_id = ?', [a.user.id, 'p1']));
  // Profil: B, A'nın şifresini/adını değiştiremez; kendi profil ucu yalnızca kendini döner
  const meB = await srv.req('GET', '/api/profile', null, b.token);
  assert.equal(meB.body.user.id, b.user.id);
  // Cihaz: B, A'nın cihazını iptal edemez
  const aDevice = (await srv.req('GET', '/api/auth/devices', null, a.token)).body[0];
  assert.equal((await srv.req('DELETE', `/api/auth/devices/${aDevice.id}`, null, b.token)).status, 404);
  assert.equal((await srv.req('GET', '/api/auth/me', null, a.token)).status, 200, 'A oturumu sürüyor');
  // Herkese açık profil e-posta, rol, şifre özeti gibi gizli alan döndürmez
  const pub = await srv.req('GET', `/api/users/${a.user.id}`);
  const text = JSON.stringify(pub.body);
  for (const secret of ['email', 'password', 'role', 'google_id', 'tokens_valid_after', '@test.local']) assert.ok(!text.includes(secret), secret);
});

test('istemci kaynak kodunda yönetim ucu, yönetim anahtarı ya da sunucu sırrı yok', () => {
  const root = fileURLToPath(new URL('../../src', import.meta.url));
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|css|html)$/.test(n)) files.push(p);
    }
  };
  walk(root);
  assert.ok(files.length > 10);
  const forbidden = /\/api\/admin|x-admin-key|ADMIN_SECRET_KEY|AUTH_SECRET|TURSO_|libsql:\/\/|CLOUDINARY_API|api_secret|BREVO_API_KEY|xkeysib-|RESEND_API_KEY|GOOGLE_CLIENT_SECRET|SMTP_PASS|process\.env/i;
  for (const f of files) {
    const m = readFileSync(f, 'utf8').match(forbidden);
    assert.equal(m, null, `${f}: ${m?.[0]}`);
  }
});
