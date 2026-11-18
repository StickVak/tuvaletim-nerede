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
