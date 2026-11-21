import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, CATEGORY_ORDER, isCategory, placeholderPhoto } from './categories.ts';
import { matchesCategory } from './filters.ts';
// @ts-expect-error — sunucu modülü JS (tip bildirimi yok)
import { CATEGORIES as SERVER_CATEGORIES } from '../../server/validate.js';

const json = JSON.parse(readFileSync(new URL('../data/categories.json', import.meta.url), 'utf8')) as { id: string; label: string }[];

test('mekan türleri tek kaynaktan: JSON = istemci sırası = sunucu doğrulaması; Cami ve Restoran var, eskiler korunur', () => {
  assert.deepEqual(CATEGORY_ORDER, json.map((c) => c.id));
  assert.deepEqual(SERVER_CATEGORIES, json.map((c) => c.id));
  for (const id of ['avm', 'kafe', 'belediye', 'park', 'diger', 'cami', 'restoran']) assert.ok(CATEGORY_ORDER.includes(id as never), id);
  assert.equal(CATEGORIES.cami.label, 'Cami');
  assert.equal(CATEGORIES.restoran.label, 'Restoran');
  for (const c of CATEGORY_ORDER) {
    assert.ok(CATEGORIES[c].icon, `${c}: simge`);
    assert.match(CATEGORIES[c].from, /^#[0-9A-F]{6}$/i);
    assert.match(placeholderPhoto(c), /^data:image\/svg\+xml/, `${c}: temsili görsel`);
  }
  assert.ok(decodeURIComponent(placeholderPhoto('cami')).includes('CAMİ'), 'temsili görselde Türkçe büyük harf etiket');
});

test('mekan türü filtresi: boş = hepsi; seçilen tür; tanınmayan (eski kayıtlı) değer filtrelemez', () => {
  const places = [{ category: 'cami' as const }, { category: 'restoran' as const }, { category: 'avm' as const }];
  assert.equal(places.filter((p) => matchesCategory(p, '')).length, 3);
  assert.equal(places.filter((p) => matchesCategory(p, undefined)).length, 3);
  assert.deepEqual(places.filter((p) => matchesCategory(p, 'cami')), [{ category: 'cami' }]);
  assert.deepEqual(places.filter((p) => matchesCategory(p, 'restoran')), [{ category: 'restoran' }]);
  assert.equal(places.filter((p) => matchesCategory(p, 'eski-tur')).length, 3);
  assert.ok(isCategory('cami') && !isCategory('otel') && !isCategory(5));
});
