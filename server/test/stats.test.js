import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../stats.js';

const v = (cleanliness, comfort, is_paid, price_amount = null) => ({ cleanliness, comfort, is_paid, price_amount });

test('no votes: avm free, kafe paid, belediye paid, voteCount 0, avgPrice null', () => {
  const avm = computeStats('avm', []);
  assert.deepEqual(avm, { voteCount: 0, cleanliness: 0, comfort: 0, rating: 0, isPaid: false, avgPrice: null });
  assert.equal(computeStats('kafe', []).isPaid, true);
  assert.equal(computeStats('belediye', []).isPaid, true);
});

test('majority paid with prices [10, 15, null] → isPaid true, avgPrice 12.5', () => {
  const s = computeStats('avm', [v(4, 4, 1, 10), v(4, 4, 1, 15), v(4, 4, 1, null), v(4, 4, 0)]);
  assert.equal(s.isPaid, true);
  assert.equal(s.avgPrice, 12.5);
});

test('majority free on kafe → isPaid false, avgPrice null', () => {
  const s = computeStats('kafe', [v(3, 3, 0), v(3, 3, 0), v(3, 3, 1, 20)]);
  assert.equal(s.isPaid, false);
  assert.equal(s.avgPrice, null);
});

test('tie on avm → false; tie on kafe → true', () => {
  const tie = [v(3, 3, 1, 10), v(3, 3, 0)];
  assert.equal(computeStats('avm', tie).isPaid, false);
  assert.equal(computeStats('kafe', tie).isPaid, true);
});

test('averages: votes (5,4),(3,2) → cleanliness 4, comfort 3, rating 3.5', () => {
  const s = computeStats('park', [v(5, 4, 0), v(3, 2, 0)]);
  assert.equal(s.voteCount, 2);
  assert.equal(s.cleanliness, 4);
  assert.equal(s.comfort, 3);
  assert.equal(s.rating, 3.5);
});

test('zero price amounts are ignored in the average', () => {
  const s = computeStats('kafe', [v(3, 3, 1, 0), v(3, 3, 1, 8)]);
  assert.equal(s.avgPrice, 8);
});
