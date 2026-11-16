import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, isOpenNow, sortPlaces } from './filters.ts';
import { pickEmergency } from './geo.ts';
import type { PlaceView } from '../types';

const at = (iso: string) => new Date(iso); // yerel saat
const MON_10 = at('2026-11-16T10:00:00+03:00'); // Pazartesi
const SUN_23 = at('2026-11-22T23:30:00+03:00'); // Pazar

test('isOpenNow: simple "HH:MM – HH:MM" ranges, overnight and 24h', () => {
  assert.equal(isOpenNow('10:00 – 22:00', MON_10), true);
  assert.equal(isOpenNow('10:00 – 22:00', at('2026-11-16T09:59:00+03:00')), false);
  assert.equal(isOpenNow('22:00-02:00', at('2026-11-16T01:30:00+03:00')), true);
  assert.equal(isOpenNow('22:00-02:00', at('2026-11-16T03:00:00+03:00')), false);
  assert.equal(isOpenNow('24 saat', SUN_23), true);
  assert.equal(isOpenNow('24/7', SUN_23), true);
});

test('isOpenNow: OSM day ranges and lists', () => {
  assert.equal(isOpenNow('Mo-Fr 09:00-18:00; Sa 10:00-14:00', MON_10), true);
  assert.equal(isOpenNow('Mo-Fr 09:00-18:00; Sa 10:00-14:00', SUN_23), false);
  assert.equal(isOpenNow('Sa,Su 08:00-24:00', SUN_23), true);
  assert.equal(isOpenNow('Mo-Su 07:00-23:00', SUN_23), false);
  assert.equal(isOpenNow('Mo off; Tu-Su 08:00-20:00', MON_10), false);
});

test('isOpenNow: unknown → null', () => {
  assert.equal(isOpenNow(null, MON_10), null);
  assert.equal(isOpenNow('sunrise-sunset', MON_10), null);
});

function place(id: string, o: Partial<PlaceView> & { paid?: boolean; votes?: number; rating?: number; price?: number | null } = {}): PlaceView {
  const { paid = false, votes = 0, rating = 0, price = null, ...rest } = o;
  return {
    id, name: id, category: 'avm', district: null, address: null, lat: 0, lng: 0, hasPhoto: false, hours: null,
    accessible: false, babyChanging: false, toiletType: null, publicAccess: true, source: 'seed', createdAt: '',
    stats: { voteCount: votes, cleanliness: rating, comfort: rating, rating, isPaid: paid, avgPrice: price },
    status: { closed: false, closedReports: 0, noSupplies: 0, crowded: 0 },
    isFavorite: false, myVote: null, distance: 100, ...rest,
  };
}

test('applyFilters: chips combine with AND', () => {
  const list = [
    place('a', { accessible: true, babyChanging: true }),
    place('b', { accessible: true, paid: true }),
    place('c', { toiletType: 'ikisi', isFavorite: true, publicAccess: false }),
    place('d', { toiletType: 'alaturka', hours: '00:00-01:00' }),
  ];
  const ids = (chips: Parameters<typeof applyFilters>[1]) => applyFilters(list, chips, MON_10).map((p) => p.id);
  assert.deepEqual(ids(['free']), ['a', 'c', 'd']);
  assert.deepEqual(ids(['free', 'accessible']), ['a']);
  assert.deepEqual(ids(['baby']), ['a']);
  assert.deepEqual(ids(['alafranga']), ['c']);
  assert.deepEqual(ids(['alaturka']), ['c', 'd']);
  assert.deepEqual(ids(['public']), ['a', 'b', 'd']);
  assert.deepEqual(ids(['favorites']), ['c']);
  assert.deepEqual(ids(['open']), [], 'saati bilinmeyen ya da kapalı olanlar çıkar');
});

test('sortPlaces: distance, cleanliness, cheapest, most voted', () => {
  const list = [
    place('near-paid', { distance: 100, paid: true, price: 10, votes: 1, rating: 2 }),
    place('far-free', { distance: 900, votes: 5, rating: 4 }),
    place('mid-cheap', { distance: 500, paid: true, price: 5, votes: 9, rating: 5 }),
    place('paid-unknown', { distance: 50, paid: true }),
  ];
  const ids = (s: Parameters<typeof sortPlaces>[1]) => sortPlaces(list, s).map((p) => p.id);
  assert.deepEqual(ids('distance'), ['paid-unknown', 'near-paid', 'mid-cheap', 'far-free']);
  assert.deepEqual(ids('cleanliness'), ['mid-cheap', 'far-free', 'near-paid', 'paid-unknown']);
  assert.deepEqual(ids('cheapest'), ['far-free', 'mid-cheap', 'near-paid', 'paid-unknown']);
  assert.deepEqual(ids('popular'), ['mid-cheap', 'far-free', 'near-paid', 'paid-unknown']);
});

test('pickEmergency skips places reported closed', () => {
  const closed = place('kapali', { distance: 100, status: { closed: true, closedReports: 2, noSupplies: 0, crowded: 0 } });
  assert.equal(pickEmergency([closed, place('acik', { distance: 600 })])?.id, 'acik');
  assert.equal(pickEmergency([closed]), null);
});

test('isOpenNow uses Turkey time regardless of device timezone', () => {
  // 07:30Z = İstanbul 10:30 (UTC+3)
  assert.equal(isOpenNow('10:00-22:00', new Date('2026-11-16T07:30:00Z')), true);
  assert.equal(isOpenNow('10:00-22:00', new Date('2026-11-16T06:30:00Z')), false);
});
