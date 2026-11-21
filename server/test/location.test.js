import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROVINCES, findDistrict, findProvince, resolveLocation, trKey } from '../turkey.js';
import { openDb } from '../db.js';
import { startServer } from './helpers.js';

const REAL_SEED = JSON.parse(readFileSync(new URL('../seed-places.json', import.meta.url), 'utf8'));

test('il/ilçe listesi: 81 il, 973 ilçe; plakalar 01-81; il seçilince o ilin ilçeleri', () => {
  assert.equal(PROVINCES.length, 81);
  assert.equal(PROVINCES.reduce((n, p) => n + p.ilceler.length, 0), 973);
  assert.deepEqual(PROVINCES.map((p) => Number(p.plaka)), Array.from({ length: 81 }, (_, i) => i + 1));
  const izmir = findProvince('İzmir');
  assert.equal(izmir.ilceler.length, 30);
  for (const d of ['Konak', 'Çiğli', 'Karşıyaka', 'Ödemiş']) assert.ok(izmir.ilceler.includes(d), d);
  assert.ok(!izmir.ilceler.includes('Kadıköy'), 'başka ilin ilçesi yok');
  assert.equal(findProvince('İstanbul').ilceler.length, 39);
  assert.ok(findProvince('Samsun').ilceler.includes('19 Mayıs'));
});

test('eşleştirme büyük/küçük harf, Türkçe karakter ve boşluk farkına duyarsız; çıktı listedeki yazım', () => {
  for (const v of ['İzmir', 'izmir', 'IZMIR', 'İZMİR', ' Izmir ']) assert.equal(findProvince(v)?.il, 'İzmir', v);
  assert.equal(findProvince('sanliurfa')?.il, 'Şanlıurfa');
  assert.equal(findProvince('afyon karahisar')?.il, 'Afyonkarahisar');
  const izmir = findProvince('izmir');
  for (const v of ['Çiğli', 'cigli', 'ÇİĞLİ', ' çiğli ']) assert.equal(findDistrict(izmir, v), 'Çiğli', v);
  assert.equal(trKey('Güzelbahçe'), trKey('GUZELBAHCE'));
});

test('resolveLocation: geçerli il+ilçe, ile ait olmayan ilçe, geçersiz il, yalnızca ilçeden il çıkarımı', () => {
  assert.deepEqual(resolveLocation({ province: 'izmir', district: 'KONAK' }), { province: 'İzmir', district: 'Konak' });
  assert.deepEqual(resolveLocation({ province: 'Ankara', district: '' }), { province: 'Ankara', district: null });
  assert.deepEqual(resolveLocation({}), { province: null, district: null });
  assert.equal(resolveLocation({ province: 'İzmir', district: 'Kadıköy' }), 'Seçilen ilçe İzmir iline ait değil.');
  assert.equal(resolveLocation({ province: 'Atlantis', district: 'Konak' }), 'Geçersiz il.');
  assert.deepEqual(resolveLocation({ district: 'bornova' }), { province: 'İzmir', district: 'Bornova' });
  assert.equal(resolveLocation({ district: 'Merkez' }), 'İl seçin.', 'aynı ad birden çok ilde');
  // Konum verilirse en yakın il (Afyonkarahisar merkezi yakını)
  assert.deepEqual(resolveLocation({ district: 'merkez', near: { lat: 38.76, lng: 30.54 } }), { province: 'Afyonkarahisar', district: 'Merkez' });
  assert.equal(resolveLocation({ district: 'Uydurma İlçe' }), 'Geçersiz ilçe.');
});

test('geriye dönük uyum: ili boş eski kayıtların ili ilçeden bulunur, ilçe yazımı düzelir; serbest metin olduğu gibi kalır', async () => {
  const srv = await startServer({
    seed: [
      { id: 'eski1', name: 'Eski Bir', category: 'park', district: 'ÇİĞLİ ', lat: 38.49, lng: 27.06 },
      { id: 'eski2', name: 'Eski İki', category: 'park', district: 'merkez', lat: 38.76, lng: 30.54 },
      { id: 'eski3', name: 'Eski Üç', category: 'park', district: 'Kordon boyu', lat: 38.43, lng: 27.14 },
      { id: 'yeni1', name: 'Yeni Bir', category: 'avm', province: 'Ankara', district: 'Çankaya', lat: 39.92, lng: 32.85 },
    ],
  });
  try {
    const rows = Object.fromEntries((await srv.db.all('SELECT id, province, district FROM places')).map((r) => [r.id, r]));
    assert.deepEqual({ ...rows.eski1 }, { id: 'eski1', province: 'İzmir', district: 'Çiğli' });
    assert.deepEqual({ ...rows.eski2 }, { id: 'eski2', province: 'Afyonkarahisar', district: 'Merkez' });
    assert.deepEqual({ ...rows.eski3 }, { id: 'eski3', province: null, district: 'Kordon boyu' });
    assert.deepEqual({ ...rows.yeni1 }, { id: 'yeni1', province: 'Ankara', district: 'Çankaya' });
    const list = (await srv.req('GET', '/api/places')).body;
    assert.equal(list.find((p) => p.id === 'eski1').province, 'İzmir', 'API il alanını döner');
  } finally {
    srv.close();
  }
});

test('yeni mekan başvurusu: il ve ilçe zorunlu, listeden olmalı, yazım listedekine çevrilir', async () => {
  const srv = await startServer();
  try {
    const user = await srv.register('ilcecı');
    const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    const base = { name: 'Yeni Mekan', category: 'park', lat: 41.04, lng: 28.98, vote: { cleanliness: 3, comfort: 3, isPaid: false }, photo: JPEG };
    const missing = await srv.req('POST', '/api/pending', base, user);
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error, 'İl ve ilçe seçin.');
    const wrong = await srv.req('POST', '/api/pending', { ...base, province: 'İstanbul', district: 'Konak' }, user);
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error, 'Seçilen ilçe İstanbul iline ait değil.');
    assert.equal((await srv.req('POST', '/api/pending', { ...base, province: ['x'], district: 'Beyoğlu' }, user)).status, 400);
    const ok = await srv.req('POST', '/api/pending', { ...base, province: 'istanbul', district: 'BEYOĞLU' }, user);
    assert.equal(ok.status, 201);
    const row = await srv.db.get('SELECT province, district FROM pending_places WHERE id = ?', [ok.body.id]);
    assert.deepEqual({ ...row }, { province: 'İstanbul', district: 'Beyoğlu' });
    // Onayda il de mekana taşınır
    assert.equal((await srv.admin('POST', `/api/admin/pending/${ok.body.id}/approve`)).status, 200);
    const place = (await srv.req('GET', '/api/places')).body.find((p) => p.id === ok.body.id);
    assert.equal(place.province, 'İstanbul');
    assert.equal(place.district, 'Beyoğlu');
  } finally {
    srv.close();
  }
});

test('Türkiye geneli başlangıç verisi yüklenir; tekrar açılışta çift kayıt oluşmaz; yöneticinin sildiği geri gelmez', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tn-seed-'));
  const seedFile = join(dir, 'seed.json');
  writeFileSync(seedFile, JSON.stringify(REAL_SEED));
  const path = join(dir, 'tn.db');
  try {
    let db = await openDb(path, { seedFile });
    const count = async () => (await db.get('SELECT COUNT(*) AS n FROM places')).n;
    assert.equal(await count(), REAL_SEED.length);
    const provinces = (await db.all('SELECT province, COUNT(*) AS n FROM places GROUP BY province')).map((r) => r.province);
    for (const il of ['İzmir', 'İstanbul', 'Ankara', 'Antalya', 'Bursa', 'Konya', 'Adana', 'Trabzon', 'Eskişehir']) assert.ok(provinces.includes(il), il);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM places WHERE province IS NULL')).n, 0);
    await db.deletePlace('seed-tr-ankara-ankaragari');
    db.close?.();

    for (let i = 0; i < 2; i++) {
      db = await openDb(path, { seedFile });
      assert.equal(await count(), REAL_SEED.length - 1, `açılış ${i + 2}: çift kayıt yok, silinen geri gelmedi`);
      db.close?.();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
