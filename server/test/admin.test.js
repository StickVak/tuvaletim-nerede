import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const SEED = [{ id: 'seed-forum', name: 'Forum Bornova', category: 'avm', district: 'Bornova', lat: 38.45, lng: 27.21 }];
const submission = (o = {}) => ({
  name: 'Yeni Kafe WC',
  category: 'kafe',
  lat: 38.44,
  lng: 27.14,
  district: 'Konak',
  accessible: true,
  vote: { cleanliness: 4, comfort: 5, isPaid: false, priceAmount: null, comment: 'Güzel' },
  ...o,
});

let srv, admin, user;
before(async () => {
  srv = await startServer({ seed: SEED });
  admin = await srv.adminToken();
  user = await srv.register('basvuran');
});
after(() => srv.close());

test('pending without token → 401', async () => {
  assert.equal((await srv.req('POST', '/api/pending', submission())).status, 401);
});

test('invalid submission → 400', async () => {
  assert.equal((await srv.req('POST', '/api/pending', submission({ name: 'ab' }), user)).status, 400);
  assert.equal((await srv.req('POST', '/api/pending', submission({ category: 'otel' }), user)).status, 400);
  assert.equal((await srv.req('POST', '/api/pending', submission({ lat: 'x' }), user)).status, 400);
  assert.equal((await srv.req('POST', '/api/pending', submission({ vote: { cleanliness: 9 } }), user)).status, 400);
  assert.equal((await srv.req('POST', '/api/pending', submission({ photo: 'http://evil' }), user)).status, 400);
});

test('normal user on /api/admin/stats → 403', async () => {
  assert.equal((await srv.req('GET', '/api/admin/stats', null, user)).status, 403);
});

test('submit → appears in admin pending, not in /api/places; approve → place with submitter vote', async () => {
  const sub = await srv.req('POST', '/api/pending', submission(), user);
  assert.equal(sub.status, 201);
  const pending = await srv.req('GET', '/api/admin/pending', null, admin);
  const item = pending.body.find((p) => p.id === sub.body.id);
  assert.equal(item.username, 'basvuran');
  assert.equal(item.vote.isPaid, false);
  assert.ok(!(await srv.req('GET', '/api/places')).body.some((p) => p.name === 'Yeni Kafe WC'));

  const approved = await srv.req('POST', `/api/admin/pending/${sub.body.id}/approve`, null, admin);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.stats.voteCount, 1);
  assert.equal(approved.body.stats.isPaid, false);
  assert.equal(approved.body.source, 'user');
  assert.equal(approved.body.accessible, true);
  const mine = (await srv.req('GET', '/api/places', null, user)).body.find((p) => p.id === approved.body.id);
  assert.equal(mine.myVote.comment, 'Güzel');
  assert.equal((await srv.req('GET', '/api/admin/pending', null, admin)).body.length, 0);
});

test('reject removes pending', async () => {
  const sub = await srv.req('POST', '/api/pending', submission({ name: 'Reddedilecek' }), user);
  assert.equal((await srv.req('DELETE', `/api/admin/pending/${sub.body.id}`, null, admin)).status, 204);
  assert.ok(!(await srv.req('GET', '/api/admin/pending', null, admin)).body.some((p) => p.id === sub.body.id));
});

test('patch place name', async () => {
  const r = await srv.req('PATCH', '/api/admin/places/seed-forum', { name: 'Forum Bornova AVM', lat: 38.451 }, admin);
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Forum Bornova AVM');
  assert.equal(r.body.lat, 38.451);
  assert.equal((await srv.req('PATCH', '/api/admin/places/seed-forum', { name: 'x' }, admin)).status, 400);
  assert.equal((await srv.req('PATCH', '/api/admin/places/yok', { name: 'Yok Mekan' }, admin)).status, 404);
});

test('delete vote recalculates stats (voteCount 0)', async () => {
  await srv.req('PUT', '/api/places/seed-forum/vote', { cleanliness: 3, comfort: 3, isPaid: true, priceAmount: 5 }, user);
  const votes = await srv.req('GET', '/api/admin/votes', null, admin);
  const v = votes.body.find((x) => x.placeId === 'seed-forum');
  assert.equal(v.username, 'basvuran');
  assert.equal(v.placeName, 'Forum Bornova AVM');
  assert.equal(v.priceAmount, 5);
  assert.equal((await srv.req('DELETE', `/api/admin/votes/${v.id}`, null, admin)).status, 204);
  const place = (await srv.req('GET', '/api/places')).body.find((p) => p.id === 'seed-forum');
  assert.equal(place.stats.voteCount, 0);
});

test('stats counts places, pending, votes, users', async () => {
  const s = await srv.req('GET', '/api/admin/stats', null, admin);
  assert.equal(s.status, 200);
  assert.deepEqual(Object.keys(s.body).sort(), ['avgCleanliness', 'pending', 'places', 'users', 'votes']);
  assert.equal(s.body.places, 2);
  assert.equal(s.body.users, 1); // yalnızca role='user' (yönetici sayılmaz)
});

test('delete place removes its votes', async () => {
  await srv.req('PUT', '/api/places/seed-forum/vote', { cleanliness: 5, comfort: 5, isPaid: false }, user);
  assert.equal((await srv.req('DELETE', '/api/admin/places/seed-forum', null, admin)).status, 204);
  const votes = await srv.req('GET', '/api/admin/votes', null, admin);
  assert.ok(!votes.body.some((v) => v.placeId === 'seed-forum'));
  assert.ok(!(await srv.req('GET', '/api/places')).body.some((p) => p.id === 'seed-forum'));
});

test('svg photos are rejected (would be served same-origin) and photo responses are nosniff', async () => {
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  assert.equal((await srv.req('POST', '/api/pending', submission({ name: 'SVG Deneme', photo: svg }), user)).status, 400);
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  const sub = await srv.req('POST', '/api/pending', submission({ name: 'JPEG Deneme', photo: jpeg }), user);
  assert.equal(sub.status, 201);
  const place = await srv.req('POST', `/api/admin/pending/${sub.body.id}/approve`, null, admin);
  const res = await fetch(`${srv.url}/api/places/${place.body.id}/photo`);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});
