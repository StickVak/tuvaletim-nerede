import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, SECRET } from './helpers.js';
import { signToken } from '../auth.js';

let srv;
before(async () => {
  srv = await startServer();
});
after(() => srv.close());

test('register returns token and user role user', async () => {
  const r = await srv.req('POST', '/api/auth/register', { username: 'ayse', email: 'ayse@example.com', password: 'secret1' });
  assert.equal(r.status, 201);
  assert.equal(typeof r.body.token, 'string');
  assert.equal(r.body.user.username, 'ayse');
  assert.equal(r.body.user.role, 'user');
  assert.equal(r.body.user.password_hash, undefined);
});

test('duplicate username (case-insensitive) → 409', async () => {
  await srv.req('POST', '/api/auth/register', { username: 'mehmet', password: 'secret1' });
  const r = await srv.req('POST', '/api/auth/register', { username: 'MEHMET', password: 'secret1' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /kullanıcı adı/i);
});

test('short password → 400', async () => {
  const r = await srv.req('POST', '/api/auth/register', { username: 'kisa', password: '123' });
  assert.equal(r.status, 400);
});

test('invalid username → 400', async () => {
  const r = await srv.req('POST', '/api/auth/register', { username: 'a b', password: 'secret1' });
  assert.equal(r.status, 400);
});

test('login wrong password → 401', async () => {
  await srv.req('POST', '/api/auth/register', { username: 'zeynep', password: 'secret1' });
  const r = await srv.req('POST', '/api/auth/login', { username: 'zeynep', password: 'wrongpass' });
  assert.equal(r.status, 401);
});

test('login by email → 200', async () => {
  await srv.req('POST', '/api/auth/register', { username: 'can', email: 'can@example.com', password: 'secret1' });
  const r = await srv.req('POST', '/api/auth/login', { username: 'can@example.com', password: 'secret1' });
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

test('env admin can login with role admin', async () => {
  const r = await srv.req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'admin');
});
