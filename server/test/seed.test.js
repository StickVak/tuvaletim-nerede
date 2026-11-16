import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const seed = JSON.parse(readFileSync(new URL('../seed-places.json', import.meta.url), 'utf8'));

// Kullanıcının adını verdiği 24 nokta
const NAMED = {
  avm: ['seed-optimum-avm', 'seed-forum-bornova', 'seed-istinyepark-izmir', 'seed-agora-avm', 'seed-hilltown-karsiyaka',
    'seed-mavibahce-avm', 'seed-konak-pier', 'seed-point-bornova', 'seed-ege-perla'],
  kafe: ['seed-starbucks-buca-tinaztepe', 'seed-sirinyer-izban-kafe', 'seed-starbucks-kibris-sehitleri', 'seed-starbucks-konak-pier',
    'seed-starbucks-bornova-kucukpark', 'seed-starbucks-karsiyaka-carsi', 'seed-starbucks-bostanli'],
  belediye: ['seed-wc-buca-hasanaga', 'seed-wc-sirinyer', 'seed-wc-konak-kemeralti', 'seed-wc-alsancak-gundogdu', 'seed-wc-kulturpark',
    'seed-wc-bornova-meydan', 'seed-wc-karsiyaka-iskele', 'seed-wc-bostanli-sahil'],
};

test('all 24 named places present with their category', () => {
  const byId = new Map(seed.map((p) => [p.id, p]));
  for (const [category, ids] of Object.entries(NAMED)) {
    for (const id of ids) {
      assert.ok(byId.has(id), `${id} eksik`);
      assert.equal(byId.get(id).category, category, id);
    }
  }
});

test('province-wide scan adds more than the named 24', () => {
  assert.ok(seed.length > 24, `toplam ${seed.length}`);
});

test('every place is inside İzmir province bounds', () => {
  for (const p of seed) {
    assert.ok(p.lat >= 37.8 && p.lat <= 39.45 && p.lng >= 26.2 && p.lng <= 28.5, `${p.id} ${p.lat},${p.lng}`);
  }
});

test('no rating fields present', () => {
  for (const p of seed) {
    for (const k of ['cleanliness', 'comfort', 'rating', 'ratingCount', 'votes', 'stats']) assert.equal(p[k], undefined, `${p.id}.${k}`);
  }
});

test('ids and osm ids unique', () => {
  assert.equal(new Set(seed.map((p) => p.id)).size, seed.length);
  const osm = seed.filter((p) => p.osm).map((p) => `${p.osm.type}${p.osm.id}`);
  assert.equal(new Set(osm).size, osm.length);
});

test('category is one of the allowed values', () => {
  for (const p of seed) assert.ok(['avm', 'kafe', 'belediye', 'park', 'diger'].includes(p.category), p.id);
});

test('approximate places say so in the address and have a district', () => {
  const approx = seed.filter((p) => p.approximate);
  assert.ok(approx.length > 0);
  for (const p of approx) {
    assert.match(p.address ?? '', /yaklaşık konum/, p.id);
    assert.ok(p.district, `${p.id} ilçesiz`);
  }
});
