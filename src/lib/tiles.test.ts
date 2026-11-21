import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_LIMIT, TILE_PROVIDERS, providerFailed } from './tiles.ts';

test('karo sağlayıcıları: kısıtlı OSM sunucusu ve anahtar isteyen CARTO yok; her birinde OpenStreetMap atfı', () => {
  assert.ok(TILE_PROVIDERS.length >= 2, 'en az bir yedek');
  for (const p of TILE_PROVIDERS) {
    assert.ok(!/tile\.openstreetmap\.org|cartocdn/.test(p.url), p.url);
    assert.match(p.url, /^https:\/\//);
    assert.match(p.attribution, /OpenStreetMap/);
  }
  assert.equal(TILE_PROVIDERS[0].id, 'esri-street');
});

test('sağlayıcı ancak hiç karo yüklenemeden ERROR_LIMIT hataya ulaşınca değiştirilir', () => {
  assert.equal(providerFailed({ loaded: 0, failed: ERROR_LIMIT - 1 }), false);
  assert.equal(providerFailed({ loaded: 0, failed: ERROR_LIMIT }), true);
  assert.equal(providerFailed({ loaded: 3, failed: 50 }), false, 'ara sıra düşen karolar sağlayıcı değiştirmez');
});
