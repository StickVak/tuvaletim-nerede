import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_LIMIT, TILE_PROVIDERS, TILE_REFERRER_POLICY, providerFailed } from './tiles.ts';

test('karo sağlayıcıları: önceki görünüm (OSM standart) birincil, Esri yalnızca yedek; Referer gönderilir', () => {
  assert.equal(TILE_PROVIDERS[0].url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.equal(TILE_PROVIDERS[0].attribution, '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları');
  assert.ok(TILE_PROVIDERS.length >= 2, 'en az bir yedek');
  for (const p of TILE_PROVIDERS) {
    assert.ok(!/cartocdn/.test(p.url), p.url);
    assert.match(p.url, /^https:\/\//);
    assert.match(p.attribution, /OpenStreetMap/);
  }
  assert.equal(TILE_REFERRER_POLICY, 'strict-origin-when-cross-origin', 'no-referrer olmamalı (OSM 403 verir)');
});

test('sağlayıcı ancak hiç karo yüklenemeden ERROR_LIMIT hataya ulaşınca değiştirilir', () => {
  assert.equal(providerFailed({ loaded: 0, failed: ERROR_LIMIT - 1 }), false);
  assert.equal(providerFailed({ loaded: 0, failed: ERROR_LIMIT }), true);
  assert.equal(providerFailed({ loaded: 3, failed: 50 }), false, 'ara sıra düşen karolar sağlayıcı değiştirmez');
});
