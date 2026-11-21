import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { appCsp, inlineScriptHashes } from '../security.js';
import { createHash } from 'node:crypto';

const SEED = [{ id: 'p1', name: 'Mekan Bir', category: 'avm', lat: 38.4, lng: 27.1 }];
const json = (srv, method, path, rawBody, headers = {}) =>
  fetch(srv.url + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: rawBody });

/** Sınırları yalnızca verilenlerle sıkılaştırılmış sunucu (diğerleri varsayılan, testleri etkilemeyecek kadar geniş) */
const WIDE = Object.fromEntries(
  ['api', 'login', 'loginAccount', 'sendCode', 'sendCodeEmail', 'register', 'verifyEmail', 'session', 'oauth', 'write', 'writeUser', 'upload', 'adminAuth']
    .map((k) => [k, { windowMs: 60_000, max: 1000 }]),
);
const limited = (over, extra = {}) => startServer({ seed: SEED, limits: { ...WIDE, ...over }, ...extra });

// ------------------------------------------------------------------ güvenlik başlıkları

test('başlıklar: nosniff, çerçeve yasağı, Referrer-Policy, CSP; x-powered-by yok; HSTS yalnızca üretimde', async () => {
  const srv = await startServer({ seed: SEED });
  try {
    for (const path of ['/api/places', '/gizlilik-politikasi']) {
      const res = await fetch(srv.url + path);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
      assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
      assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/, path);
      assert.equal(res.headers.get('x-powered-by'), null, path);
      assert.equal(res.headers.get('strict-transport-security'), null, 'yerel http: HSTS yok');
    }
    assert.match((await fetch(srv.url + '/api/places')).headers.get('content-security-policy'), /^default-src 'none'/, 'JSON yanıtı hiçbir şey yükleyemez');
  } finally {
    srv.close();
  }
  const prod = await startServer({ seed: SEED, production: true });
  try {
    const res = await fetch(prod.url + '/gizlilik-politikasi');
    assert.match(res.headers.get('strict-transport-security'), /max-age=31536000/);
    assert.match(res.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  } finally {
    prod.close();
  }
});

test('CSP: uygulamanın kullandığı kaynaklar izinli (Google Fonts, OSM, Cloudinary, Google avatar, rota servisleri), satır içi betik yalnızca hash ile', () => {
  const html = '<head><script>try{document.documentElement.classList.add("dark")}catch(e){}</script><script type="module" src="/assets/x.js"></script></head>';
  const hashes = inlineScriptHashes(html);
  const expected = createHash('sha256').update('try{document.documentElement.classList.add("dark")}catch(e){}').digest('base64');
  assert.deepEqual(hashes, [`'sha256-${expected}'`], 'yalnızca satır içi betik, src\'li olan değil');
  const csp = appCsp({ scriptHashes: hashes });
  const dir = (name) => csp.split('; ').find((d) => d.startsWith(`${name} `));
  assert.match(dir('script-src'), new RegExp(`'self' 'sha256-${expected.replace(/[+/=]/g, '\\$&')}'`));
  assert.doesNotMatch(dir('script-src'), /unsafe-inline|unsafe-eval|\*/);
  assert.match(dir('style-src'), /https:\/\/fonts\.googleapis\.com/);
  assert.match(dir('font-src'), /https:\/\/fonts\.gstatic\.com/);
  for (const h of ['https://tile.openstreetmap.org', 'https://res.cloudinary.com', 'https://*.googleusercontent.com', 'data:', 'blob:']) assert.ok(dir('img-src').includes(h), h);
  for (const h of ['https://routing.openstreetmap.de', 'https://router.project-osrm.org', 'https://tile.openstreetmap.org']) assert.ok(dir('connect-src').includes(h), h);
  assert.equal(dir('object-src'), "object-src 'none'");
});

// ------------------------------------------------------------------ hız sınırlama

test('429: Türkçe mesaj + kalan süre, Retry-After başlığı ve retryAfter alanı', async () => {
  const srv = await limited({ api: { windowMs: 60_000, max: 3 } });
  try {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await srv.req('GET', '/api/places')).status);
    assert.deepEqual(codes, [200, 200, 200, 429]);
    const r = await srv.req('GET', '/api/places');
    assert.equal(r.status, 429);
    assert.match(r.body.error, /^Çok fazla istek gönderildi\. Lütfen \d+ (saniye|dakika) sonra tekrar deneyin\.$/);
    assert.ok(r.body.retryAfter > 0 && r.body.retryAfter <= 60);
    assert.equal(Number(r.headers.get('retry-after')), r.body.retryAfter);
    // Fotoğraf GET'leri genel sınırın dışında (liste kaydırırken çok sayıda yüklenir)
    assert.notEqual((await srv.req('GET', '/api/places/p1/photo')).status, 429);
  } finally {
    srv.close();
  }
});

test('doğrulama kodu: HEDEF E-POSTA başına sınır (farklı adres etkilenmez); biçim hataları sayılmaz', async () => {
  const srv = await limited({ sendCodeEmail: { windowMs: 60 * 60_000, max: 2 } });
  try {
    const send = (email) => srv.req('POST', '/api/auth/send-code', { email });
    const skipCooldown = () => srv.db.run('UPDATE email_codes SET next_send_at = ?', [new Date(Date.now() - 1000).toISOString()]);
    for (let i = 0; i < 3; i++) assert.equal((await send('gecersiz-adres')).status, 400);
    assert.equal((await send('hedef@example.com')).status, 200);
    await skipCooldown();
    assert.equal((await send('HEDEF@example.com')).status, 200, 'büyük/küçük harf aynı hedef');
    await skipCooldown();
    const third = await send('hedef@example.com');
    assert.equal(third.status, 429);
    assert.match(third.body.error, /Bu e-posta adresine çok fazla kod gönderildi\. Lütfen \d+ (dakika|saat) sonra/);
    assert.equal((await send('baska@example.com')).status, 200);
  } finally {
    srv.close();
  }
});

test('kod doğrulama: e-posta başına hatalı deneme sınırı', async () => {
  const srv = await limited({ verifyEmail: { windowMs: 60 * 60_000, max: 2 } });
  try {
    const email = 'deneme@example.com';
    await srv.req('POST', '/api/auth/send-code', { email, username: 'denemeci' });
    const body = { username: 'denemeci', email, password: 'secret1', code: '000000', acceptTerms: true };
    if (srv.lastCode(email) === '000000') body.code = '111111';
    assert.equal((await srv.req('POST', '/api/auth/register', body)).status, 400);
    assert.equal((await srv.req('POST', '/api/auth/register', body)).status, 400);
    const r = await srv.req('POST', '/api/auth/register', { ...body, code: srv.lastCode(email) });
    assert.equal(r.status, 429, 'doğru kod da bu pencerede kabul edilmez');
  } finally {
    srv.close();
  }
});

test('giriş: HESAP başına hatalı deneme sınırı (IP değişse de); başka hesap etkilenmez; başarılı giriş sayılmaz', async () => {
  const srv = await limited({ loginAccount: { windowMs: 15 * 60_000, max: 2 } }, { clientIpHeader: 'cf-connecting-ip' });
  try {
    await srv.registerFull('hedefhesap');
    await srv.registerFull('digerhesap');
    const login = (username, password, ip) => srv.req('POST', '/api/auth/login', { username, password }, null, { 'CF-Connecting-IP': ip });
    assert.equal((await login('hedefhesap', 'secret1', '203.0.113.1')).status, 200);
    assert.equal((await login('hedefhesap', 'yanlis1', '203.0.113.1')).status, 401);
    assert.equal((await login('HEDEFHESAP', 'yanlis2', '198.51.100.7')).status, 401, 'farklı IP, aynı hesap');
    const locked = await login('hedefhesap', 'secret1', '192.0.2.9');
    assert.equal(locked.status, 429);
    assert.match(locked.body.error, /Bu hesap için çok fazla hatalı giriş denemesi/);
    assert.equal((await login('digerhesap', 'secret1', '203.0.113.1')).status, 200);
  } finally {
    srv.close();
  }
});

test('yazma: KULLANICI başına sınır (IP sınırına ek); okuma uçları etkilenmez', async () => {
  const srv = await limited({ writeUser: { windowMs: 60_000, max: 2 } });
  try {
    const a = await srv.register('yazanbir');
    const b = await srv.register('yazaniki');
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await srv.req('PUT', '/api/favorites/p1', null, a)).status);
    assert.deepEqual(codes, [204, 204, 429]);
    assert.equal((await srv.req('PUT', '/api/favorites/p1', null, b)).status, 204, 'başka kullanıcı');
    assert.equal((await srv.req('GET', '/api/places', null, a)).status, 200);
  } finally {
    srv.close();
  }
});

test('oturum uçları (refresh/logout) ve Google ile giriş de sınırlı', async () => {
  const srv = await limited({ session: { windowMs: 60_000, max: 2 }, oauth: { windowMs: 60_000, max: 1 } });
  try {
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await srv.req('POST', '/api/auth/refresh')).status);
    assert.deepEqual(codes, [401, 401, 429]);
    const g = async () => (await fetch(srv.url + '/api/auth/google', { redirect: 'manual' })).status;
    assert.equal(await g(), 302);
    assert.equal(await g(), 429);
  } finally {
    srv.close();
  }
});

test('gerçek istemci IP: güvenilir başlık (cf-connecting-ip) kullanılır; sahte X-Forwarded-For etkisiz; geçersiz değer yok sayılır', async () => {
  const srv = await limited({ api: { windowMs: 60_000, max: 2 } }, { clientIpHeader: 'cf-connecting-ip' });
  try {
    const ip = async (headers) => (await srv.req('GET', '/api/health/ip', null, null, headers)).body.ip;
    assert.equal(await ip({ 'CF-Connecting-IP': '203.0.113.5', 'X-Forwarded-For': '1.2.3.4' }), '203.0.113.5');
    assert.equal(await ip({ 'CF-Connecting-IP': '2001:db8::1' }), '2001:db8::1');
    const fallback = await srv.req('GET', '/api/health/ip', null, null, { 'CF-Connecting-IP': 'uydurma' });
    assert.notEqual(fallback.body?.ip, 'uydurma');
    // Sayım bu IP'ye göre: aynı IP 3. istekte durur, farklı IP etkilenmez
    const st = async (h) => (await srv.req('GET', '/api/places', null, null, { 'CF-Connecting-IP': h })).status;
    assert.deepEqual([await st('198.51.100.1'), await st('198.51.100.1'), await st('198.51.100.1')], [200, 200, 429]);
    assert.equal(await st('198.51.100.2'), 200);
  } finally {
    srv.close();
  }
});

// ------------------------------------------------------------------ çerez ve oturum

test('çerezler: üretimde HttpOnly + Secure + SameSite=Lax (http üzerinden bile); yerel http\'de Secure yok', async () => {
  const prod = await startServer({ seed: SEED, secureCookies: true });
  try {
    const { user } = await prod.registerFull('guvenlicerez');
    const r = await prod.req('POST', '/api/auth/login', { username: user.username, password: 'secret1' });
    const c = r.headers.get('set-cookie');
    for (const flag of [/HttpOnly/, /; Secure/, /SameSite=Lax/, /Path=\/api\/auth/]) assert.match(c, flag);
  } finally {
    prod.close();
  }
  const dev = await startServer({ seed: SEED });
  try {
    await dev.registerFull('yerelcerez');
    const c = (await dev.req('POST', '/api/auth/login', { username: 'yerelcerez', password: 'secret1' })).headers.get('set-cookie');
    assert.match(c, /HttpOnly/);
    assert.doesNotMatch(c, /Secure/);
  } finally {
    dev.close();
  }
});

test('oturum token\'ı veritabanında düz metin değil HMAC özeti; çıkış sunucuda iptal eder (belirteç + çerez)', async () => {
  const srv = await startServer({ seed: SEED });
  try {
    await srv.registerFull('ozetci');
    const r = await srv.req('POST', '/api/auth/login', { username: 'ozetci', password: 'secret1' });
    const raw = r.headers.get('set-cookie').match(/tn_device=([^;]+)/)[1];
    const rows = await srv.db.all('SELECT device_token_hash FROM trusted_devices');
    assert.ok(rows.every((d) => /^[a-f0-9]{64}$/.test(d.device_token_hash) && d.device_token_hash !== raw && !d.device_token_hash.includes(raw)));
    const out = await srv.req('POST', '/api/auth/logout', null, r.body.token, { Cookie: `tn_device=${raw}` });
    assert.equal(out.status, 204);
    assert.match(out.headers.get('set-cookie'), /tn_device=;.*Max-Age=0/);
    assert.equal((await srv.req('GET', '/api/auth/me', null, r.body.token)).status, 401);
    assert.equal((await srv.req('POST', '/api/auth/refresh', null, null, { Cookie: `tn_device=${raw}` })).status, 401);
  } finally {
    srv.close();
  }
});

test('bozuk/eksik çerez ve başlıklar hata fırlatmaz: oturumsuz duruma düşülür (500 yok)', async () => {
  const srv = await startServer({ seed: SEED });
  try {
    const cookies = ['tn_device=%E0%A4%A', 'tn_device=', 'tn_device', '=;;;=', `tn_device=${'a'.repeat(9000)}`, 'tn_device=abc; tn_device=def', 'tn_oauth=x.y.z'];
    for (const Cookie of cookies) {
      const r = await srv.req('POST', '/api/auth/refresh', null, null, { Cookie });
      assert.equal(r.status, 401, Cookie.slice(0, 40));
      assert.equal((await srv.req('POST', '/api/auth/logout', null, null, { Cookie })).status, 204);
      assert.equal((await srv.req('GET', '/api/places', null, null, { Cookie })).status, 200);
    }
    for (const Authorization of ['Bearer', 'Bearer ', 'Bearer a.b.c', 'Bearer ' + 'x'.repeat(5000), 'Basic Zm9vOmJhcg==', 'Bearer %%%.%%%']) {
      assert.equal((await srv.req('GET', '/api/auth/me', null, null, { Authorization })).status, 401, Authorization.slice(0, 30));
      assert.equal((await srv.req('GET', '/api/places', null, null, { Authorization })).status, 200);
    }
    // Google dönüşü: çerez/sorgu bozuk → uygulamaya hata koduyla döner (500 değil)
    const g = await fetch(srv.url + '/api/auth/google/callback?state[]=x&code=1', { redirect: 'manual', headers: { Cookie: 'tn_oauth=%%%' } });
    assert.equal(g.status, 302);
  } finally {
    srv.close();
  }
});

// ------------------------------------------------------------------ girdi doğrulama

test('girdi doğrulama: yanlış tip / aşırı uzunluk / bozuk biçim → 400 ve iç ayrıntı içermeyen mesaj', async () => {
  const srv = await startServer({ seed: SEED });
  try {
    const token = await srv.register('dogrulayici');
    const cases = [
      ['POST', '/api/auth/login', { username: { $ne: '' }, password: 'x' }],
      ['POST', '/api/auth/login', { username: ['a'], password: 'secret1' }],
      ['POST', '/api/auth/login', { username: 'dogrulayici', password: 'x'.repeat(129) }],
      ['POST', '/api/auth/send-code', { email: ['a@b.co'] }],
      ['POST', '/api/auth/send-code', { email: '<script>@x.co' }],
      ['POST', '/api/auth/send-code', { email: 'a@b' }],
      ['POST', '/api/auth/register', { username: 'yeni', email: 'y@example.com', password: 'p'.repeat(200), code: '123456', acceptTerms: true }],
      ['POST', '/api/auth/register', { username: 'yeni', email: 'y@example.com', password: 'secret1', code: 123456, acceptTerms: true }],
      ['PUT', '/api/places/p1/vote', { cleanliness: '5', comfort: 3, isPaid: false }],
      ['PUT', '/api/places/p1/vote', { cleanliness: 5, comfort: 3, isPaid: 'false' }],
      ['PUT', '/api/places/p1/vote', { cleanliness: 5, comfort: 3, isPaid: true, priceAmount: 'bedava' }],
      ['PUT', '/api/places/p1/vote', { cleanliness: 5, comfort: 3, isPaid: true, priceAmount: [5] }],
      ['PUT', '/api/places/p1/vote', { cleanliness: 5, comfort: 3, isPaid: false, comment: { x: 1 } }],
      ['PUT', '/api/places/p1/vote', { cleanliness: 5, comfort: 3, isPaid: false, comment: 'y'.repeat(281) }],
      ['POST', '/api/places/p1/reports', { type: 'patladi' }],
      ['POST', '/api/places/p1/arrival', { wasOpen: 'evet' }],
      ['PATCH', '/api/profile', { displayName: 42 }],
      ['PATCH', '/api/profile', { displayName: '   ' }],
      ['PATCH', '/api/profile', { bio: 'b'.repeat(161) }],
      ['PATCH', '/api/profile', { username: ['x'] }],
      ['POST', '/api/profile/password', { currentPassword: 'secret1', newPassword: 12345678 }],
      ['POST', '/api/pending', { name: { x: 1 }, category: 'avm', lat: 38.4, lng: 27.1, vote: { cleanliness: 3, comfort: 3, isPaid: false } }],
      ['POST', '/api/pending', { name: 'Yeni Mekan', category: 'avm', lat: '38.4', lng: 27.1, vote: { cleanliness: 3, comfort: 3, isPaid: false } }],
      ['POST', '/api/pending', { name: 'Yeni Mekan', category: 'avm', lat: 95, lng: 27.1, vote: { cleanliness: 3, comfort: 3, isPaid: false } }],
      ['POST', '/api/pending', { name: 'Yeni Mekan', category: 'uzay', lat: 38.4, lng: 27.1, vote: { cleanliness: 3, comfort: 3, isPaid: false } }],
      ['POST', '/api/pending', { name: 'Yeni Mekan', category: 'avm', lat: 38.4, lng: 27.1, address: ['x'], vote: { cleanliness: 3, comfort: 3, isPaid: false } }],
      ['POST', '/api/pending', { name: 'Yeni Mekan', category: 'avm', lat: 38.4, lng: 27.1, accessible: 'evet', vote: { cleanliness: 3, comfort: 3, isPaid: false } }],
    ];
    for (const [method, path, body] of cases) {
      const r = await srv.req(method, path, body, token);
      assert.equal(r.status, 400, `${method} ${path} ${JSON.stringify(body).slice(0, 80)} → ${r.status} ${r.body?.error}`);
      assert.equal(typeof r.body.error, 'string');
      assert.doesNotMatch(r.body.error, /SQLITE|TypeError|undefined|\[object|at \w+ \(/);
    }
    // Ücret "12,5" kabul edilir; yorumdaki görünmez/kontrol karakterleri atılır
    const ok = await srv.req('PUT', '/api/places/p1/vote', { cleanliness: 5, comfort: 4, isPaid: true, priceAmount: '12,5', comment: ' Temiz\u0000 ve‮ güzel​ ' }, token);
    assert.equal(ok.status, 200);
    const v = await srv.db.get('SELECT comment, price_amount FROM votes WHERE place_id = ?', ['p1']);
    assert.equal(v.comment, 'Temiz ve güzel');
    assert.equal(v.price_amount, 12.5);
  } finally {
    srv.close();
  }
});

test('istek biçimi: yol parametresi, JSON gövdesi, gövde boyutu ve bozuk URL → 4xx (veritabanına gitmeden)', async () => {
  const srv = await startServer({ seed: SEED });
  try {
    const token = await srv.register('bicimci');
    assert.equal((await srv.req('GET', '/api/places/a%20b/reviews')).status, 400);
    assert.equal((await srv.req('GET', `/api/places/${'x'.repeat(101)}/reviews`)).status, 400);
    assert.equal((await srv.req('GET', '/api/users/abc')).status, 400);
    assert.equal((await srv.req('GET', '/api/users/-1')).status, 400);
    assert.equal((await srv.req('DELETE', '/api/auth/devices/1e9', null, token)).status, 400);
    assert.equal((await srv.req('PUT', '/api/favorites/..%2F..%2Fadmin', null, token)).status, 400);
    const bad = await fetch(srv.url + '/api/places/%E0%A4%A/reviews');
    assert.equal(bad.status, 400, 'çözülemeyen yüzde kodlaması 500 değil');

    const auth = { Authorization: `Bearer ${token}` };
    const arr = await json(srv, 'PUT', '/api/places/p1/vote', '[1,2,3]', auth);
    assert.equal(arr.status, 400);
    const broken = await json(srv, 'POST', '/api/auth/login', '{"username": "a",');
    assert.equal(broken.status, 400);
    assert.deepEqual(await broken.json(), { error: 'Geçersiz istek.' });
    const big = await json(srv, 'PUT', '/api/places/p1/vote', JSON.stringify({ cleanliness: 5, comfort: 5, isPaid: false, comment: 'x'.repeat(200_000) }), auth);
    assert.equal(big.status, 413, 'fotoğrafsız uçlarda gövde 100 KB ile sınırlı');
  } finally {
    srv.close();
  }
});

// ------------------------------------------------------------------ hata sızıntısı

test('beklenmeyen hata: istemciye genel mesaj + başvuru kodu; SQL/yığın izi/anahtar yalnızca sunucu logunda', async () => {
  const srv = await startServer({ seed: SEED });
  const origAll = srv.db.all;
  const logged = [];
  const origError = console.error;
  try {
    srv.db.all = async () => {
      throw new Error('SQLITE_ERROR: no such column: gizli_sutun (api_key=sk_live_123)');
    };
    console.error = (...a) => logged.push(a.map(String).join(' '));
    const r = await srv.req('GET', '/api/places/p1/reviews');
    assert.equal(r.status, 500);
    assert.equal(r.body.error, 'Sunucu hatası. Lütfen biraz sonra tekrar deneyin.');
    assert.match(r.body.ref, /^[a-z0-9]{1,8}$/);
    const text = JSON.stringify(r.body);
    for (const leak of ['SQLITE', 'gizli_sutun', 'sk_live', 'at ', '.js']) assert.ok(!text.includes(leak), leak);
    assert.ok(logged.some((l) => l.includes(r.body.ref) && l.includes('gizli_sutun')), 'ayrıntı sunucu logunda');
  } finally {
    srv.db.all = origAll;
    console.error = origError;
    srv.close();
  }
});
