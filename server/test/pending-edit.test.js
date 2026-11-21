import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
let srv, user;
before(async () => {
  srv = await startServer();
  user = await srv.register('basvuran');
});
after(() => srv.close());

const submit = async (o = {}) =>
  (await srv.req('POST', '/api/pending', {
    name: 'Kordon WC', category: 'belediye', lat: 38.43, lng: 27.14, province: 'İzmir', district: 'Konak', address: 'Kordon',
    vote: { cleanliness: 4, comfort: 3, isPaid: false, comment: 'Temiz' }, photo: JPEG, ...o,
  }, user)).body.id;
const patch = (id, body, key) => srv.admin('PATCH', `/api/admin/pending/${id}`, body, key);

test('başvuru düzenleme yalnızca yönetim anahtarıyla: anahtarsız/yanlış anahtar/kullanıcı belirteci 401, veri değişmez', async () => {
  const id = await submit();
  assert.equal((await patch(id, { name: 'Ele Geçirildi' }, null)).status, 401);
  assert.equal((await patch(id, { name: 'Ele Geçirildi' }, 'yanlis-anahtar-1234567890')).status, 401);
  assert.equal((await srv.req('PATCH', `/api/admin/pending/${id}`, { name: 'Ele Geçirildi' }, user)).status, 401);
  assert.equal((await srv.admin('POST', `/api/admin/pending/${id}/approve`, null, null)).status, 401);
  assert.equal((await srv.admin('DELETE', `/api/admin/pending/${id}`, null, null)).status, 401);
  assert.equal((await srv.db.get('SELECT name FROM pending_places WHERE id = ?', [id])).name, 'Kordon WC');
});

test('düzenleme: ad, tür, il/ilçe (yazım düzeltilir), adres, konum, özellikler, ücret güncellenir; puan ve yorum korunur', async () => {
  const id = await submit();
  const r = await patch(id, {
    name: 'Kordon Belediye WC', category: 'park', province: 'izmir', district: 'KARŞIYAKA', address: 'Bostanlı İskelesi',
    lat: 38.4561, lng: 27.0967, hours: '08:00-22:00', accessible: true, babyChanging: true, publicAccess: true,
    toiletType: 'alafranga', isPaid: true, priceAmount: 10,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Kordon Belediye WC');
  assert.equal(r.body.province, 'İzmir');
  assert.equal(r.body.district, 'Karşıyaka');
  assert.equal(r.body.lat, 38.4561);
  assert.equal(r.body.lng, 27.0967);
  assert.equal(r.body.publicAccess, true);
  assert.deepEqual(r.body.vote, { cleanliness: 4, comfort: 3, isPaid: true, priceAmount: 10, comment: 'Temiz', toiletType: 'alafranga' });
  // Yalnızca gönderilen alan değişir
  const r2 = await patch(id, { hours: null });
  assert.equal(r2.body.hours, null);
  assert.equal(r2.body.name, 'Kordon Belediye WC');
  assert.equal(r2.body.district, 'Karşıyaka');
  // Ücretsize çevirince tutar silinir
  assert.equal((await patch(id, { isPaid: false })).body.vote.priceAmount, null);
});

test('düzenleme doğrulaması: Türkiye dışı/bozuk konum, ile ait olmayan ilçe, geçersiz ücret ve alanlar 400; olmayan başvuru 404', async () => {
  const id = await submit();
  const bad = [
    [{ lat: 48.85, lng: 2.35 }, /Türkiye sınırları/],
    [{ lat: '38.4' }, /Geçerli bir konum/],
    [{ lng: Number.NaN }, /Geçerli bir konum/],
    [{ province: 'İstanbul', district: 'Konak' }, /İstanbul iline ait değil/],
    [{ district: 'Çankaya' }, /İzmir iline ait değil/],
    [{ province: '' , district: '' }, /İl ve ilçe seçin/],
    [{ isPaid: true, priceAmount: 5000 }, /0-1000/],
    [{ isPaid: 'evet' }, /Ücretli/],
    [{ name: 'ab' }, /3-60/],
    [{ category: 'otel' }, /Geçersiz mekan türü/],
    [{ toiletType: 'roket' }, /Geçersiz tuvalet tipi/],
    [{ photo: JPEG }, /fotoğrafı buradan değiştirilemez/],
  ];
  for (const [body, msg] of bad) {
    const r = await patch(id, body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.body.error, msg, JSON.stringify(body));
  }
  const row = await srv.db.get('SELECT name, lat, lng, province, district FROM pending_places WHERE id = ?', [id]);
  assert.deepEqual({ ...row }, { name: 'Kordon WC', lat: 38.43, lng: 27.14, province: 'İzmir', district: 'Konak' }, 'hatalı istekler hiçbir şeyi değiştirmedi');
  assert.equal((await patch('olmayan-basvuru', { name: 'Yeni Ad' })).status, 404);
  assert.equal((await patch('bozuk id!', { name: 'Yeni Ad' })).status, 400);
});

test('onay: düzenlenmiş başvuru haritada düzenlenen konum, il/ilçe ve bilgilerle yayınlanır', async () => {
  const id = await submit({ name: 'Yanlış Konumlu WC' });
  await patch(id, { name: 'Doğru Konumlu WC', province: 'Ankara', district: 'Çankaya', lat: 39.9208, lng: 32.8541, accessible: true, isPaid: true, priceAmount: 5 });
  assert.equal((await srv.admin('POST', `/api/admin/pending/${id}/approve`)).status, 200);
  const place = (await srv.req('GET', '/api/places')).body.find((p) => p.id === id);
  assert.ok(place, 'haritada');
  assert.equal(place.name, 'Doğru Konumlu WC');
  assert.equal(place.lat, 39.9208);
  assert.equal(place.lng, 32.8541);
  assert.equal(place.province, 'Ankara');
  assert.equal(place.district, 'Çankaya');
  assert.equal(place.accessible, true);
  assert.equal(place.stats.isPaid, true, 'başvuranın (düzenlenmiş) ücret oyu sayılır');
  assert.equal((await srv.db.get('SELECT COUNT(*) AS n FROM pending_places WHERE id = ?', [id])).n, 0);
});

test('yeni başvurular da Türkiye dışı konumla kabul edilmez', async () => {
  const r = await srv.req('POST', '/api/pending', {
    name: 'Paris WC', category: 'park', lat: 48.85, lng: 2.35, province: 'İzmir', district: 'Konak',
    vote: { cleanliness: 3, comfort: 3, isPaid: false }, photo: JPEG,
  }, user);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Türkiye sınırları/);
});
