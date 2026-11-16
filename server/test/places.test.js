import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const SEED = [
  { id: 'seed-forum', name: 'Forum Bornova', category: 'avm', district: 'Bornova', lat: 38.45, lng: 27.21 },
  { id: 'seed-sb', name: 'Starbucks Alsancak', category: 'kafe', district: 'Konak', lat: 38.43, lng: 27.14, accessible: true },
];
const vote = (o = {}) => ({ cleanliness: 4, comfort: 3, isPaid: true, priceAmount: null, comment: null, ...o });

let srv;
before(async () => {
  srv = await startServer({ seed: SEED });
});
after(() => srv.close());

test('GET /api/places returns seeded places with voteCount 0', async () => {
  const r = await srv.req('GET', '/api/places');
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 2);
  const sb = r.body.find((p) => p.id === 'seed-sb');
  assert.equal(sb.stats.voteCount, 0);
  assert.equal(sb.stats.isPaid, true);
  assert.equal(sb.accessible, true);
  assert.equal(sb.babyChanging, false);
  assert.equal(sb.source, 'seed');
  assert.equal(sb.myVote, null);
  assert.equal(r.body.find((p) => p.id === 'seed-forum').stats.isPaid, false);
});

test('vote without token → 401', async () => {
  const r = await srv.req('PUT', '/api/places/seed-sb/vote', vote());
  assert.equal(r.status, 401);
});

test('vote then re-vote updates same row: voteCount stays 1, myVote reflects second vote', async () => {
  const token = await srv.register('oyveren');
  const first = await srv.req('PUT', '/api/places/seed-forum/vote', vote({ cleanliness: 2 }), token);
  assert.equal(first.status, 200);
  assert.equal(first.body.stats.voteCount, 1);
  const second = await srv.req('PUT', '/api/places/seed-forum/vote', vote({ cleanliness: 5, isPaid: false, comment: 'Temiz' }), token);
  assert.equal(second.body.stats.voteCount, 1);
  assert.equal(second.body.stats.cleanliness, 5);
  assert.deepEqual(second.body.myVote, { cleanliness: 5, comfort: 3, isPaid: false, priceAmount: null, comment: 'Temiz' });
  const list = await srv.req('GET', '/api/places', null, token);
  assert.equal(list.body.find((p) => p.id === 'seed-forum').myVote.cleanliness, 5);
});

test('two users paid 10 and 15 → stats.avgPrice 12.5, isPaid true', async () => {
  const a = await srv.register('ucretli1');
  const b = await srv.register('ucretli2');
  await srv.req('PUT', '/api/places/seed-sb/vote', vote({ priceAmount: 10 }), a);
  const r = await srv.req('PUT', '/api/places/seed-sb/vote', vote({ priceAmount: 15 }), b);
  assert.equal(r.body.stats.isPaid, true);
  assert.equal(r.body.stats.avgPrice, 12.5);
});

test('free vote drops priceAmount', async () => {
  const t = await srv.register('ucretsizci');
  const r = await srv.req('PUT', '/api/places/seed-forum/vote', vote({ isPaid: false, priceAmount: 30 }), t);
  assert.equal(r.body.myVote.priceAmount, null);
});

test('priceAmount -5 → 400; 1001 → 400; cleanliness 6 → 400; unknown place → 404', async () => {
  const t = await srv.register('hatali');
  assert.equal((await srv.req('PUT', '/api/places/seed-sb/vote', vote({ priceAmount: -5 }), t)).status, 400);
  assert.equal((await srv.req('PUT', '/api/places/seed-sb/vote', vote({ priceAmount: 1001 }), t)).status, 400);
  assert.equal((await srv.req('PUT', '/api/places/seed-sb/vote', vote({ cleanliness: 6 }), t)).status, 400);
  assert.equal((await srv.req('PUT', '/api/places/seed-sb/vote', vote({ comfort: 2.5 }), t)).status, 400);
  assert.equal((await srv.req('PUT', '/api/places/yok/vote', vote(), t)).status, 404);
});

test('empty or non-numeric priceAmount is treated as no amount', async () => {
  const t = await srv.register('bosucret');
  const r = await srv.req('PUT', '/api/places/seed-sb/vote', vote({ priceAmount: '' }), t);
  assert.equal(r.status, 200);
  assert.equal(r.body.myVote.priceAmount, null);
});

test('GET /api/places/:id/reviews lists only commented votes, newest first, with username', async () => {
  const a = await srv.register('yorumcu1');
  const b = await srv.register('yorumcu2');
  const c = await srv.register('yorumsuz');
  await srv.req('PUT', '/api/places/seed-forum/vote', vote({ comment: 'İlk yorum' }), a);
  await new Promise((r) => setTimeout(r, 5));
  await srv.req('PUT', '/api/places/seed-forum/vote', vote({ comment: 'İkinci yorum', isPaid: true, priceAmount: 7 }), b);
  await srv.req('PUT', '/api/places/seed-forum/vote', vote({ comment: '' }), c);
  const r = await srv.req('GET', '/api/places/seed-forum/reviews');
  assert.equal(r.status, 200);
  const mine = r.body.filter((x) => ['yorumcu1', 'yorumcu2', 'yorumsuz'].includes(x.username));
  assert.deepEqual(mine.map((x) => x.username), ['yorumcu2', 'yorumcu1']);
  assert.equal(mine[0].comment, 'İkinci yorum');
  assert.equal(mine[0].priceAmount, 7);
  assert.equal(mine[0].user_id, undefined);
  assert.equal((await srv.req('GET', '/api/places/yok/reviews')).status, 404);
});

test('list omits photo data (hasPhoto flag) and photo is served separately as an image', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const admin = await srv.adminToken();
  assert.equal((await srv.req('PATCH', '/api/admin/places/seed-sb', { photo: png }, admin)).status, 200);
  const list = (await srv.req('GET', '/api/places')).body;
  const sb = list.find((p) => p.id === 'seed-sb');
  assert.equal(sb.photo, undefined);
  assert.equal(sb.hasPhoto, true);
  assert.equal(list.find((p) => p.id === 'seed-forum').hasPhoto, false);
  const res = await fetch(`${srv.url}/api/places/seed-sb/photo`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await res.arrayBuffer()).subarray(1, 4).toString(), 'PNG');
  assert.equal((await fetch(`${srv.url}/api/places/seed-forum/photo`)).status, 404);
});
