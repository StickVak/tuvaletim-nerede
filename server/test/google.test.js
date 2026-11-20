import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startServer } from './helpers.js';
import { googleConfig } from '../google.js';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = (claims) => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.imza`;

/**
 * Sahte Google belirteç ucu: PKCE'yi (code_verifier → code_challenge) gerçekten doğrular, verilen iddialarla id_token döner.
 * claimsFor(nonce) testin istediği kimliği üretir.
 */
function fakeGoogle(claimsFor) {
  const state = { challenge: null, calls: [] };
  const fetchImpl = async (url, init) => {
    const form = new URLSearchParams(init.body);
    state.calls.push({ url, form });
    if (url !== 'https://oauth2.googleapis.com/token') return new Response('{}', { status: 404 });
    if (form.get('code') !== 'iyi-kod') return Response.json({ error: 'invalid_grant' }, { status: 400 });
    const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
    if (challenge !== state.challenge) return Response.json({ error: 'invalid_grant', error_description: 'PKCE' }, { status: 400 });
    return Response.json({ access_token: 'a', id_token: idToken(claimsFor(state.nonce)), token_type: 'Bearer' });
  };
  return { state, fetchImpl };
}

const baseClaims = (nonce, o = {}) => ({
  iss: 'https://accounts.google.com', aud: CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 300, iat: Math.floor(Date.now() / 1000),
  sub: 'google-sub-1', email: 'ayse.yilmaz@gmail.com', email_verified: true, name: 'Ayşe Yılmaz', picture: 'https://lh3.googleusercontent.com/a/x', nonce, ...o,
});

async function setup(claimsFor, extra = {}) {
  const g = fakeGoogle(claimsFor);
  const srv = await startServer({ google: { clientId: CLIENT_ID, clientSecret: 'gizli', redirectUri: 'https://tuvaletim.example/api/auth/google/callback', fetchImpl: g.fetchImpl, ...extra } });
  return { srv, g };
}

/** Akışı başlat: Google'a yönlendirme adresi ve oauth çerezi */
async function start(srv, g) {
  const res = await fetch(`${srv.url}/api/auth/google`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get('location'));
  g.state.challenge = loc.searchParams.get('code_challenge');
  g.state.nonce = loc.searchParams.get('nonce');
  const setCookie = res.headers.get('set-cookie') ?? '';
  return { loc, setCookie, cookie: setCookie.split(';')[0] };
}

async function callback(srv, cookie, params) {
  const res = await fetch(`${srv.url}/api/auth/google/callback?${new URLSearchParams(params)}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  const device = (res.headers.get('set-cookie') ?? '').match(/tn_device=([^;]+)/)?.[1] ?? null;
  return { status: res.status, location: res.headers.get('location'), device, setCookie: res.headers.get('set-cookie') ?? '' };
}

test('yapılandırma: GOOGLE_CLIENT_ID + SECRET gerekli; callback adresi GOOGLE_REDIRECT_URI ya da APP_URL\'den türetilir', () => {
  assert.equal(googleConfig({}), null);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: 'x' }), null);
  assert.deepEqual(googleConfig({ GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', GOOGLE_REDIRECT_URI: 'https://a.b/cb' }), { clientId: 'x', clientSecret: 'y', redirectUri: 'https://a.b/cb' });
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', APP_URL: 'https://tuvaletim.onrender.com/' }).redirectUri, 'https://tuvaletim.onrender.com/api/auth/google/callback');
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' }).redirectUri, null, 'istekten türetilir');
});

test('Google yapılandırılmamışsa: providers google=false, başlatma uygulamaya hata koduyla döner', async () => {
  const srv = await startServer();
  try {
    assert.deepEqual((await srv.req('GET', '/api/auth/providers')).body, { google: false });
    const res = await fetch(`${srv.url}/api/auth/google`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/?auth_error=google_disabled');
  } finally {
    srv.close();
  }
});

test('başlatma: Google yetkilendirme adresi (state, PKCE S256, nonce, openid email profile) + imzalı HttpOnly oauth çerezi', async () => {
  const { srv, g } = await setup((n) => baseClaims(n));
  try {
    assert.deepEqual((await srv.req('GET', '/api/auth/providers')).body, { google: true });
    const { loc, setCookie } = await start(srv, g);
    assert.equal(loc.origin + loc.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    const p = loc.searchParams;
    assert.equal(p.get('client_id'), CLIENT_ID);
    assert.equal(p.get('redirect_uri'), 'https://tuvaletim.example/api/auth/google/callback');
    assert.equal(p.get('response_type'), 'code');
    assert.deepEqual(p.get('scope').split(' ').sort(), ['email', 'openid', 'profile']);
    assert.equal(p.get('code_challenge_method'), 'S256');
    assert.match(p.get('state'), /^[A-Za-z0-9_-]{32,}$/);
    assert.match(p.get('nonce'), /^[A-Za-z0-9_-]{16,}$/);
    assert.match(setCookie, /tn_oauth=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\/api\/auth\/google/);
    assert.ok(!setCookie.includes(p.get('state')) || /\.[A-Za-z0-9_-]{40,}/.test(setCookie), 'çerez imzalı');
  } finally {
    srv.close();
  }
});

test('CSRF: state eşleşmezse, oauth çerezi yoksa ya da çerez kurcalanmışsa giriş yapılmaz', async () => {
  const { srv, g } = await setup((n) => baseClaims(n));
  try {
    const { loc, cookie } = await start(srv, g);
    const state = loc.searchParams.get('state');
    for (const [c, s] of [[cookie, 'baska-state'], [null, state], [cookie.replace(/.$/, (x) => (x === 'A' ? 'B' : 'A')), state]]) {
      const r = await callback(srv, c, { code: 'iyi-kod', state: s });
      assert.equal(r.status, 302);
      assert.equal(r.location, '/?auth_error=state');
      assert.equal(r.device, null);
    }
    assert.equal(g.state.calls.length, 0, 'Google belirteç ucu hiç çağrılmadı');
    assert.equal((await srv.db.get('SELECT COUNT(*) AS n FROM users')).n, 0);
  } finally {
    srv.close();
  }
});

test('yeni kullanıcı: Google adından kullanıcı adı, doğrulanmış e-posta, güvenilir cihaz çerezi; oturum tazelemeyle açılır', async () => {
  const { srv, g } = await setup((n) => baseClaims(n));
  try {
    const { loc, cookie } = await start(srv, g);
    const r = await callback(srv, cookie, { code: 'iyi-kod', state: loc.searchParams.get('state') });
    assert.equal(r.status, 302);
    assert.equal(r.location, '/?auth=google&new=1');
    assert.ok(r.device, 'güvenilir cihaz çerezi verildi');
    assert.match(r.setCookie, /tn_oauth=;[^,]*Max-Age=0/, 'oauth çerezi silindi');
    const form = g.state.calls[0].form;
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.get('redirect_uri'), 'https://tuvaletim.example/api/auth/google/callback');
    assert.equal(form.get('client_secret'), 'gizli');
    const u = await srv.db.get("SELECT * FROM users WHERE google_id = 'google-sub-1'");
    assert.equal(u.username, 'ayşe.yılmaz');
    assert.equal(u.display_name, 'Ayşe Yılmaz');
    assert.equal(u.email, 'ayse.yilmaz@gmail.com');
    assert.equal(u.email_verified, 1);
    assert.equal(u.avatar_url, 'https://lh3.googleusercontent.com/a/x');
    assert.equal((await srv.req('POST', '/api/auth/login', { username: 'ayşe.yılmaz', password: '' })).status, 401, 'şifreyle giriş yok');
    const ref = await srv.req('POST', '/api/auth/refresh', null, null, { Cookie: `tn_device=${r.device}` });
    assert.equal(ref.status, 200);
    assert.equal(ref.body.user.username, 'ayşe.yılmaz');

    // aynı Google hesabıyla tekrar → aynı kullanıcı, yeni hesap yok
    const s2 = await start(srv, g);
    const r2 = await callback(srv, s2.cookie, { code: 'iyi-kod', state: s2.loc.searchParams.get('state') });
    assert.equal(r2.location, '/?auth=google');
    assert.equal((await srv.db.get('SELECT COUNT(*) AS n FROM users')).n, 1);
  } finally {
    srv.close();
  }
});

test('e-posta zaten kayıtlıysa yeni hesap açılmaz: mevcut (doğrulanmış) hesaba google_id bağlanır, şifresi korunur', async () => {
  const { srv, g } = await setup((n) => baseClaims(n, { email: 'Mevcut@Example.com', sub: 'sub-mevcut', name: 'Başka Ad' }));
  try {
    const { user } = await srv.registerFull('mevcut', 'secret1', 'mevcut@example.com');
    const { loc, cookie } = await start(srv, g);
    const r = await callback(srv, cookie, { code: 'iyi-kod', state: loc.searchParams.get('state') });
    assert.equal(r.location, '/?auth=google');
    assert.equal((await srv.db.get('SELECT COUNT(*) AS n FROM users')).n, 1);
    const row = await srv.db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    assert.equal(row.google_id, 'sub-mevcut');
    assert.equal(row.username, 'mevcut', 'kullanıcı adı değişmez');
    assert.equal((await srv.req('POST', '/api/auth/login', { username: 'mevcut', password: 'secret1' })).status, 200, 'şifre korunur');
    const ref = await srv.req('POST', '/api/auth/refresh', null, null, { Cookie: `tn_device=${r.device}` });
    assert.equal(ref.body.user.id, user.id);
  } finally {
    srv.close();
  }
});

test('doğrulanmamış e-postalı eski hesaba bağlanırken önceki şifre ve oturumlar iptal edilir (hesap ele geçirme önlemi)', async () => {
  const { srv, g } = await setup((n) => baseClaims(n, { email: 'eski@example.com', sub: 'sub-eski' }));
  try {
    const { user, token } = await srv.registerFull('eskihesap', 'secret1', 'eski@example.com');
    await srv.db.run('UPDATE users SET email_verified = 0 WHERE id = ?', [user.id]); // OTP öncesi kayıt gibi
    const { loc, cookie } = await start(srv, g);
    const r = await callback(srv, cookie, { code: 'iyi-kod', state: loc.searchParams.get('state') });
    assert.equal(r.location, '/?auth=google');
    assert.equal((await srv.req('POST', '/api/auth/login', { username: 'eskihesap', password: 'secret1' })).status, 401, 'eski şifre devre dışı');
    assert.equal((await srv.req('GET', '/api/auth/me', null, token)).status, 401, 'eski oturum iptal');
    const row = await srv.db.get('SELECT google_id, email_verified FROM users WHERE id = ?', [user.id]);
    assert.deepEqual(row, { google_id: 'sub-eski', email_verified: 1 });
    assert.equal((await srv.req('POST', '/api/auth/refresh', null, null, { Cookie: `tn_device=${r.device}` })).status, 200, 'Google oturumu açık');
  } finally {
    srv.close();
  }
});

test('kullanıcı adı çakışırsa sonuna rastgele rakam eklenir', async () => {
  const { srv, g } = await setup((n) => baseClaims(n, { name: 'Ali Veli', email: 'ali.veli.yeni@gmail.com', sub: 'sub-ali' }));
  try {
    await srv.registerFull('ali.veli');
    const { loc, cookie } = await start(srv, g);
    await callback(srv, cookie, { code: 'iyi-kod', state: loc.searchParams.get('state') });
    const u = await srv.db.get("SELECT username FROM users WHERE google_id = 'sub-ali'");
    assert.match(u.username, /^ali\.veli\.\d{2,4}$/);
  } finally {
    srv.close();
  }
});

test('doğrulanmamış Google e-postası, yanlış aud/iss, süresi dolmuş ya da nonce uyuşmayan belirteç reddedilir', async () => {
  const cases = [
    ['email_unverified', (n) => baseClaims(n, { email_verified: false })],
    ['id_token', (n) => baseClaims(n, { aud: 'baska-uygulama' })],
    ['id_token', (n) => baseClaims(n, { iss: 'https://evil.example' })],
    ['id_token', (n) => baseClaims(n, { exp: Math.floor(Date.now() / 1000) - 10 })],
    ['id_token', () => baseClaims('baska-nonce')],
  ];
  for (const [code, claims] of cases) {
    const { srv, g } = await setup(claims);
    try {
      const { loc, cookie } = await start(srv, g);
      const r = await callback(srv, cookie, { code: 'iyi-kod', state: loc.searchParams.get('state') });
      assert.equal(r.location, `/?auth_error=${code}`);
      assert.equal(r.device, null);
      assert.equal((await srv.db.get('SELECT COUNT(*) AS n FROM users')).n, 0);
    } finally {
      srv.close();
    }
  }
});

test('kullanıcı Google ekranında vazgeçerse ya da kod geçersizse uygulamaya hata koduyla döner', async () => {
  const { srv, g } = await setup((n) => baseClaims(n));
  try {
    const a = await start(srv, g);
    assert.equal((await callback(srv, a.cookie, { error: 'access_denied', state: a.loc.searchParams.get('state') })).location, '/?auth_error=cancelled');
    const b = await start(srv, g);
    assert.equal((await callback(srv, b.cookie, { code: 'kotu-kod', state: b.loc.searchParams.get('state') })).location, '/?auth_error=token');
  } finally {
    srv.close();
  }
});

test('oauth çerezi tek kullanımlık: aynı state ile ikinci geri dönüş reddedilir', async () => {
  const { srv, g } = await setup((n) => baseClaims(n));
  try {
    const { loc, cookie } = await start(srv, g);
    const state = loc.searchParams.get('state');
    assert.equal((await callback(srv, cookie, { code: 'iyi-kod', state })).location, '/?auth=google&new=1');
    assert.equal((await callback(srv, cookie, { code: 'iyi-kod', state })).location, '/?auth_error=state');
  } finally {
    srv.close();
  }
});

test('callback adresi verilmemişse istekten türetilir (Host + protokol) ve belirteç değişiminde aynısı kullanılır', async () => {
  const { srv, g } = await setup((n) => baseClaims(n), { redirectUri: null });
  try {
    const { loc, cookie } = await start(srv, g);
    const expected = `${srv.url}/api/auth/google/callback`;
    assert.equal(loc.searchParams.get('redirect_uri'), expected);
    await callback(srv, cookie, { code: 'iyi-kod', state: loc.searchParams.get('state') });
    assert.equal(g.state.calls[0].form.get('redirect_uri'), expected);
  } finally {
    srv.close();
  }
});
