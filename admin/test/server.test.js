import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, ADMIN_KEY } from '../../server/test/helpers.js';
import { createAdminServer, COOKIE } from '../server/app.js';

const SEED = [{ id: 'seed-forum', name: 'Forum Bornova', category: 'avm', district: 'Bornova', lat: 38.45, lng: 27.21 }];

let main, adminSrv, url, key = ADMIN_KEY;
const listen = (app) => new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });

before(async () => {
  main = await startServer({ seed: SEED });
  const dist = mkdtempSync(join(tmpdir(), 'tn-admin-dist-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Panel</title>');
  const app = createAdminServer({ getKey: () => key, mainApiUrl: main.url, distDir: dist, limits: { login: { windowMs: 60000, max: 3 } } });
  adminSrv = await listen(app);
  url = `http://127.0.0.1:${adminSrv.address().port}`;
});
after(() => {
  adminSrv.close();
  main.close();
});

async function call(method, path, { body, cookie, csrf = true, raw = false } = {}) {
  const res = await fetch(url + path, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-TN-Admin': '1' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* html */ }
  return { status: res.status, body: json, text, headers: res.headers };
}

async function login(k = key) {
  const r = await call('POST', '/auth/login', { body: { key: k } });
  const set = r.headers.get('set-cookie') ?? '';
  return { ...r, cookie: set.split(';')[0], set };
}

test('anahtarsız/yanlış anahtar giriş yapamaz; oturumsuz API 401', async () => {
  assert.equal((await call('POST', '/auth/login', { body: {} })).status, 401);
  assert.equal((await call('GET', '/api/admin/stats')).status, 401);
  assert.equal((await call('GET', '/auth/me')).status, 401);
});

test('doğru anahtar → httpOnly + SameSite=Strict çerez; API ana sunucuya anahtarla iletilir', async () => {
  const r = await login();
  assert.equal(r.status, 200);
  assert.match(r.set, /HttpOnly/);
  assert.match(r.set, /SameSite=Strict/);
  assert.ok(!r.set.includes(key), 'anahtar çerezde yok');
  assert.equal((await call('GET', '/auth/me', { cookie: r.cookie })).status, 200);
  const stats = await call('GET', '/api/admin/stats', { cookie: r.cookie });
  assert.equal(stats.status, 200);
  assert.equal(stats.body.places, 1);
});

test('yazma istekleri gövdeyle iletilir; CSRF başlığı olmadan 403', async () => {
  const { cookie } = await login();
  const body = { name: 'Panelden Eklenen', category: 'belediye', lat: 38.41, lng: 27.12 };
  assert.equal((await call('POST', '/api/admin/places', { body, cookie, csrf: false })).status, 403);
  const r = await call('POST', '/api/admin/places', { body, cookie });
  assert.equal(r.status, 201);
  assert.equal(r.body.name, 'Panelden Eklenen');
  assert.equal((await call('PATCH', `/api/admin/places/${r.body.id}`, { body: { closed: true }, cookie })).body.closedAt !== null, true);
  assert.equal((await call('DELETE', `/api/admin/places/${r.body.id}`, { cookie })).status, 204);
});

test('çıkış oturumu geçersiz kılar (çerez kopyalansa bile)', async () => {
  const { cookie } = await login();
  assert.equal((await call('POST', '/auth/logout', { cookie })).status, 204);
  assert.equal((await call('GET', '/api/admin/stats', { cookie })).status, 401);
});

test('anahtar değişince eski oturumlar düşer', async () => {
  const { cookie } = await login();
  const old = key;
  key = 'tamamen-baska-bir-anahtar-123456';
  assert.equal((await call('GET', '/auth/me', { cookie })).status, 401);
  key = old;
});

test('ana sunucu anahtarı reddederse (farklı ADMIN_SECRET_KEY) anlaşılır 502', async () => {
  const other = createAdminServer({ getKey: () => 'yanlis-ama-yeterince-uzun-anahtar', mainApiUrl: main.url, limits: false });
  const s = await listen(other);
  const u = `http://127.0.0.1:${s.address().port}`;
  const lr = await fetch(u + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'yanlis-ama-yeterince-uzun-anahtar' }) });
  const cookie = lr.headers.get('set-cookie').split(';')[0];
  const r = await fetch(u + '/api/admin/stats', { headers: { Cookie: cookie } });
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /ADMIN_SECRET_KEY/);
  s.close();
});

test('ana sunucuya ulaşılamazsa 502', async () => {
  const other = createAdminServer({ getKey: () => key, mainApiUrl: 'http://127.0.0.1:9', limits: false });
  const s = await listen(other);
  const u = `http://127.0.0.1:${s.address().port}`;
  const lr = await fetch(u + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
  const r = await fetch(u + '/api/admin/stats', { headers: { Cookie: lr.headers.get('set-cookie').split(';')[0] } });
  assert.equal(r.status, 502);
  s.close();
});

test('yalnızca /api/admin ve fotoğraf ucu iletilir; diğer ana API uçları kapalı', async () => {
  const { cookie } = await login();
  assert.equal((await call('GET', '/api/places', { cookie })).status, 404);
  assert.equal((await call('POST', '/api/auth/login', { cookie, body: {} })).status, 404);
});

test('vekil yolu /api/admin dışına çıkamaz (.. ve kodlanmış hâlleri)', async () => {
  const { cookie } = await login();
  const http = await import('node:http');
  // fetch yolu kendisi normalleştirir; saldırgan ham yol gönderebilir
  const raw = (path) => new Promise((resolve, reject) => {
    const req = http.request(url + '/', { path, headers: { Cookie: cookie } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
  for (const path of ['/api/admin/../places', '/api/admin/%2e%2e/places', '/api/admin/%2E%2e/places', '/api/admin/.%2e/places', '/api/admin/x/..%2f..%2fplaces']) {
    const r = await raw(path);
    assert.equal(r.status, 400, `${path} → ${r.status}`);
    assert.ok(!r.body.includes('Forum Bornova'), path);
  }
});

test('güvenlik başlıkları ve SPA sunumu', async () => {
  const r = await call('GET', '/reports');
  assert.equal(r.status, 200);
  assert.match(r.text, /Panel/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await call('GET', '/healthz')).text, 'ok');
});

test('Cloudinary fotoğraf yönlendirmesi tarayıcıya iletilir; başka adrese yönlendirme iletilmez', async () => {
  const express = (await import('express')).default;
  const fake = express();
  fake.get('/api/admin/pending/p1/photo', (_req, res) => res.redirect(302, 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/tuvaletim/places/abc.jpg'));
  fake.get('/api/admin/pending/p2/photo', (_req, res) => res.redirect(302, 'https://kotu.example.com/x'));
  const up = await listen(fake);
  const other = createAdminServer({ getKey: () => key, mainApiUrl: `http://127.0.0.1:${up.address().port}`, limits: false });
  const s = await listen(other);
  const u = `http://127.0.0.1:${s.address().port}`;
  const lr = await fetch(u + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
  const cookie = lr.headers.get('set-cookie').split(';')[0];
  const r = await fetch(u + '/api/admin/pending/p1/photo', { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /^https:\/\/res\.cloudinary\.com\//);
  assert.match(r.headers.get('content-security-policy'), /img-src[^;]*https:\/\/res\.cloudinary\.com/);
  const bad = await fetch(u + '/api/admin/pending/p2/photo', { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(bad.status, 502);
  s.close();
  up.close();
});

test('anahtar yapılandırılmamışsa giriş 503', async () => {
  const other = createAdminServer({ getKey: () => '', mainApiUrl: main.url, limits: false });
  const s = await listen(other);
  const r = await fetch(`http://127.0.0.1:${s.address().port}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'x' }) });
  assert.equal(r.status, 503);
  s.close();
});

test('hatalı anahtar denemeleri sınırlanır (429)', async () => {
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call('POST', '/auth/login', { body: { key: 'yanlis' } })).status);
  assert.ok(codes.includes(429), codes.join(','));
  assert.equal(codes.at(-1), 429);
});

test('adres arama (/api/geocode): oturum gerekir; Nominatim sonucu {lat,lng,label}; Türkiye ile sınırlı; hata anlaşılır 502', async () => {
  const calls = [];
  let fail = false;
  const geocodeFetch = async (u, opts) => {
    calls.push({ url: new URL(u), ua: opts?.headers?.['User-Agent'] });
    if (fail) return new Response('busy', { status: 503 });
    return Response.json([{ lat: '41.0378', lon: '28.9850', display_name: 'Taksim Meydanı, Beyoğlu, İstanbul' }]);
  };
  const app = createAdminServer({ getKey: () => key, mainApiUrl: main.url, distDir: null, geocodeFetch });
  const s = await listen(app);
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    const anon = await fetch(`${base}/api/geocode?q=Taksim`);
    assert.equal(anon.status, 401, 'oturumsuz');
    assert.equal(calls.length, 0);
    const lr = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TN-Admin': '1' }, body: JSON.stringify({ key }) });
    const cookie = (lr.headers.get('set-cookie') ?? '').split(';')[0];
    const get = (q) => fetch(`${base}/api/geocode?q=${encodeURIComponent(q)}`, { headers: { Cookie: cookie } });
    const r = await get('Taksim Meydanı, Beyoğlu, İstanbul');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { result: { lat: 41.0378, lng: 28.985, label: 'Taksim Meydanı, Beyoğlu, İstanbul' } });
    assert.equal(calls[0].url.hostname, 'nominatim.openstreetmap.org');
    assert.equal(calls[0].url.searchParams.get('countrycodes'), 'tr');
    assert.match(calls[0].ua, /tuvaletim-nerede-admin/);
    await get('Taksim Meydanı, Beyoğlu, İstanbul');
    assert.equal(calls.length, 1, 'aynı sorgu önbellekten');
    assert.equal((await get('x')).status, 400, 'çok kısa sorgu');
    fail = true;
    const bad = await get('Başka bir adres');
    assert.equal(bad.status, 502);
    assert.match((await bad.json()).error, /Konum servisine şu an ulaşılamıyor/);
  } finally {
    s.close();
  }
});

test('başvuru düzenleme vekil üzerinden: oturum ve CSRF başlığı olmadan değiştirilemez', async () => {
  const user = await main.register('vekilbasvuru');
  const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  const sub = await main.req('POST', '/api/pending', { name: 'Vekil WC', category: 'park', lat: 38.44, lng: 27.14, province: 'İzmir', district: 'Konak', vote: { cleanliness: 3, comfort: 3, isPaid: false }, photo: JPEG }, user);
  // Kendi panel sunucusu: önceki testler giriş deneme sınırını doldurmuş olabilir
  const s2 = await listen(createAdminServer({ getKey: () => key, mainApiUrl: main.url, distDir: null }));
  const base = `http://127.0.0.1:${s2.address().port}`;
  const patch = (body, headers) => fetch(`${base}/api/admin/pending/${sub.body.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await patch({ name: 'Ele Geçirildi' }, { 'X-TN-Admin': '1' })).status, 401, 'oturumsuz');
    const lr = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TN-Admin': '1' }, body: JSON.stringify({ key }) });
    assert.equal(lr.status, 200);
    const Cookie = (lr.headers.get('set-cookie') ?? '').split(';')[0];
    assert.equal((await patch({ name: 'CSRF Deneme' }, { Cookie })).status, 403, 'CSRF başlığı yok');
    const ok = await patch({ name: 'Vekil WC (düzeltildi)', lat: 38.4321, lng: 27.1432 }, { Cookie, 'X-TN-Admin': '1' });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.name, 'Vekil WC (düzeltildi)');
    assert.equal(body.lat, 38.4321);
  } finally {
    s2.close();
  }
});
