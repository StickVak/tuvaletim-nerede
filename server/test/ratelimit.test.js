import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const srv = await startServer({ seed: [{ id: 'p1', name: 'Mekan Bir', category: 'avm', lat: 38.4, lng: 27.1 }], limits: { login: { windowMs: 60000, max: 3 }, register: { windowMs: 60000, max: 0 }, write: { windowMs: 60000, max: 2 } } });
after(() => srv.close());

test('login brute force is throttled with 429 and Retry-After', async () => {
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await srv.req('POST', '/api/auth/login', { username: 'x', password: 'y' })).status);
  assert.deepEqual(codes, [401, 401, 401, 429]);
  const res = await fetch(srv.url + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); // register: max 0
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
});

test('vote / report / favorite spam is throttled', async () => {
  // auth kotası doldu; belirteci doğrudan üret
  const { signToken } = await import('../auth.js');
  const { lastId } = (await srv.db.run("INSERT INTO users (username, password_hash, role, created_at) VALUES ('spamci', 'x', 'user', '2026-01-01')"));
  const token = signToken({ id: lastId, role: 'user' }, 'test-secret');
  const body = { cleanliness: 3, comfort: 3, isPaid: false };
  const codes = [];
  codes.push((await srv.req('PUT', '/api/places/p1/vote', body, token)).status);
  codes.push((await srv.req('POST', '/api/places/p1/reports', { type: 'crowded' }, token)).status);
  codes.push((await srv.req('PUT', '/api/favorites/p1', null, token)).status);
  assert.deepEqual(codes, [200, 200, 429]);
  // okuma uçları sınırlanmaz
  assert.equal((await srv.req('GET', '/api/places')).status, 200);
});

test('successful logins do not consume the login budget', async () => {
  const s2 = await startServer({ limits: { login: { windowMs: 60000, max: 2 } } });
  await s2.register('natkullanici');
  const ok = [];
  for (let i = 0; i < 5; i++) ok.push((await s2.req('POST', '/api/auth/login', { username: 'natkullanici', password: 'secret1' })).status);
  assert.deepEqual(ok, [200, 200, 200, 200, 200]);
  const bad = [];
  for (let i = 0; i < 3; i++) bad.push((await s2.req('POST', '/api/auth/login', { username: 'natkullanici', password: 'yanlis' })).status);
  assert.deepEqual(bad, [401, 401, 429]);
  s2.close();
});
