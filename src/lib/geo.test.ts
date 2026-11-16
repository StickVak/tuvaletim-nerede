import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickEmergency } from './geo.ts';
import type { PlaceView } from '../types';

function place(id: string, distance: number | null, opts: { paid?: boolean; votes?: number; rating?: number } = {}): PlaceView {
  return {
    id, name: id, category: 'kafe', district: null, address: null, lat: 0, lng: 0, hasPhoto: false, hours: null,
    accessible: false, babyChanging: false, toiletType: null, publicAccess: true, source: 'seed', createdAt: '', myVote: null, distance, isFavorite: false,
    status: { closed: false, closedReports: 0, noSupplies: 0, crowded: 0 },
    stats: { voteCount: opts.votes ?? 0, cleanliness: opts.rating ?? 0, comfort: opts.rating ?? 0, rating: opts.rating ?? 0, isPaid: opts.paid ?? false, avgPrice: null },
  };
}

test('prefers free within 2km over nearer paid', () => {
  const r = pickEmergency([place('ucretli', 100, { paid: true }), place('ucretsiz', 900)]);
  assert.equal(r?.id, 'ucretsiz');
});

test('falls back to nearest when no free within 2km', () => {
  const r = pickEmergency([place('uzak-ucretsiz', 2500), place('ucretli-uzak', 1200, { paid: true }), place('ucretli-yakin', 400, { paid: true })]);
  assert.equal(r?.id, 'ucretli-yakin');
});

test('among free, rated 5 at 600m beats unrated at 500m', () => {
  const r = pickEmergency([place('puansiz', 500), place('bes-yildiz', 600, { votes: 3, rating: 5 }), place('uzak', 1800)]);
  assert.equal(r?.id, 'bes-yildiz');
});

test('nearest free wins when ratings are equal', () => {
  const r = pickEmergency([place('b', 800), place('a', 300), place('c', 1500)]);
  assert.equal(r?.id, 'a');
});

test('ignores places with null distance', () => {
  assert.equal(pickEmergency([place('bilinmiyor', null), place('bilinen', 3000, { paid: true })])?.id, 'bilinen');
  assert.equal(pickEmergency([place('bilinmiyor', null)]), null);
});

test('returns null for empty list', () => {
  assert.equal(pickEmergency([]), null);
});
