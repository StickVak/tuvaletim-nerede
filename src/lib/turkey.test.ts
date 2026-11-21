import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVINCES, districtsOf, findProvince, matchesLocation, nearestProvince, trKey } from './turkey.ts';
// @ts-expect-error — sunucu modülü JS (tip bildirimi yok)
import * as server from '../../server/turkey.js';

test('il seçilince yalnızca o ilin ilçeleri; il yoksa boş liste', () => {
  assert.equal(PROVINCES.length, 81);
  const izmir = districtsOf('İzmir');
  assert.equal(izmir.length, 30);
  assert.ok(izmir.includes('Çiğli') && izmir.includes('Konak'));
  assert.ok(!izmir.includes('Çankaya'));
  assert.deepEqual(districtsOf('izmir'), izmir, 'yazım farkı');
  assert.equal(districtsOf('Ankara').length, 25);
  assert.ok(districtsOf('Ankara').includes('Çankaya'));
  assert.deepEqual(districtsOf(''), []);
  assert.deepEqual(districtsOf('Atlantis'), []);
  // alfabetik (Türkçe sıralama)
  const ist = districtsOf('İstanbul');
  assert.deepEqual(ist, [...ist].sort((a, b) => a.localeCompare(b, 'tr')));
});

test('il/ilçe filtresi: boş = hepsi; büyük/küçük harf, Türkçe karakter ve boşluk farkı eşleşir', () => {
  const p = { province: 'İzmir', district: 'Çiğli' };
  assert.ok(matchesLocation(p));
  assert.ok(matchesLocation(p, 'İzmir'));
  assert.ok(matchesLocation(p, 'izmir', 'cigli'));
  assert.ok(matchesLocation({ province: 'IZMIR', district: 'ÇİĞLİ ' }, 'İzmir', 'Çiğli'), 'eski kayıt yazımı');
  assert.ok(!matchesLocation(p, 'Ankara'));
  assert.ok(!matchesLocation(p, 'İzmir', 'Konak'));
  assert.ok(!matchesLocation({ province: null, district: 'Konak' }, 'İzmir'), 'ili olmayan kayıt il filtresine girmez');
});

test('en yakın il: konuma göre il ön seçimi', () => {
  assert.equal(nearestProvince({ lat: 41.037, lng: 28.985 }).il, 'İstanbul');
  assert.equal(nearestProvince({ lat: 39.92, lng: 32.85 }).il, 'Ankara');
  assert.equal(nearestProvince({ lat: 38.42, lng: 27.13 }).il, 'İzmir');
  assert.equal(findProvince('sanliurfa')?.il, 'Şanlıurfa');
});

test('istemci ve sunucu aynı veri ve aynı normalleştirme kuralını kullanır', () => {
  assert.deepEqual(server.PROVINCES, PROVINCES);
  for (const s of ['İZMİR', 'Çiğli', ' ığdır ', 'ŞANLIURFA', '19 Mayıs', 'Afyon-karahisar', 'Güzelbahçe']) assert.equal(trKey(s), server.trKey(s), s);
});
