import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const SEED = [
  { id: 'p1', name: 'Forum Bornova', category: 'avm', lat: 38.45, lng: 27.21 },
  { id: 'p2', name: 'Kafe Bir', category: 'kafe', lat: 38.43, lng: 27.14 },
];
let srv, token, other;
before(async () => {
  srv = await startServer({ seed: SEED });
  token = await srv.register('varan');
  other = await srv.register('ikincivaran');
});
after(() => srv.close());

const OPEN = { wasOpen: true, hadPaper: false, cleanliness: 4, comfort: 5, isPaid: true, priceAmount: 10 };

test('arrival requires login and a known place', async () => {
  assert.equal((await srv.req('POST', '/api/places/p1/arrival', OPEN)).status, 401);
  assert.equal((await srv.req('POST', '/api/places/yok/arrival', OPEN, token)).status, 404);
});

test('validation: wasOpen must be boolean; stars required when open', async () => {
  assert.equal((await srv.req('POST', '/api/places/p1/arrival', { ...OPEN, wasOpen: 'evet' }, token)).status, 400);
  assert.equal((await srv.req('POST', '/api/places/p1/arrival', { wasOpen: true, isPaid: false }, token)).status, 400);
  assert.equal((await srv.req('POST', '/api/places/p1/arrival', { ...OPEN, hadPaper: 'belki' }, token)).status, 400);
});

test('open + no paper → vote saved, open and no_supplies reports, contributions counted', async () => {
  const r = await srv.req('POST', '/api/places/p1/arrival', OPEN, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.place.stats.voteCount, 1);
  assert.equal(r.body.place.stats.isPaid, true);
  assert.equal(r.body.place.stats.avgPrice, 10);
  assert.equal(r.body.place.status.noSupplies, 1);
  assert.equal(r.body.contributions, 3); // 1 oy + open + no_supplies
  assert.equal((await srv.req('GET', '/api/profile', null, token)).body.stats.contributions, 3);
});

test('closed → only a closed report, no vote even if stars are sent', async () => {
  const r = await srv.req('POST', '/api/places/p2/arrival', { ...OPEN, wasOpen: false }, other);
  assert.equal(r.status, 200);
  assert.equal(r.body.place.stats.voteCount, 0);
  assert.equal(r.body.place.status.closedReports, 1);
  assert.equal(r.body.contributions, 1);
});

test('paper yes → no no_supplies report; re-rating replaces the vote', async () => {
  const r = await srv.req('POST', '/api/places/p1/arrival', { ...OPEN, hadPaper: true, cleanliness: 2 }, token);
  assert.equal(r.body.place.stats.voteCount, 1);
  assert.equal(r.body.place.stats.cleanliness, 2);
  assert.equal(r.body.place.status.noSupplies, 1, 'önceki bildirim duruyor, yenisi eklenmedi');
});
