import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer } from './helpers.js';
import { CATEGORIES } from '../validate.js';

const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const SEED = [
  { id: 'eski-avm', name: 'Eski AVM', category: 'avm', province: 'İzmir', district: 'Konak', lat: 38.42, lng: 27.13 },
  { id: 'eski-park', name: 'Eski Park', category: 'park', province: 'İzmir', district: 'Konak', lat: 38.43, lng: 27.14 },
];
let srv, user;
before(async () => {
  srv = await startServer({ seed: SEED });
  user = await srv.register('turcu');
});
after(() => srv.close());

const submit = (category, name) =>
  srv.req('POST', '/api/pending', {
    name, category, lat: 38.4189, lng: 27.1287, province: 'İzmir', district: 'Konak',
    vote: { cleanliness: 4, comfort: 4, isPaid: false }, photo: JPEG,
  }, user);

test('sunucu türleri ortak listeden: Cami ve Restoran dahil 7 tür', () => {
  const json = JSON.parse(readFileSync(new URL('../../src/data/categories.json', import.meta.url), 'utf8')).map((c) => c.id);
  assert.deepEqual(CATEGORIES, json);
  for (const c of ['cami', 'restoran', 'avm', 'kafe', 'belediye', 'park', 'diger']) assert.ok(CATEGORIES.includes(c), c);
});

test('başvuru: Cami ve Restoran kabul edilir; eski türler çalışmaya devam eder; bilinmeyen tür 400', async () => {
  for (const c of ['cami', 'restoran', 'avm', 'diger']) assert.equal((await submit(c, `Tür ${c}`)).status, 201, c);
  const bad = await submit('otel', 'Tür otel');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'Geçersiz mekan türü.');
});

test('admin: başvuru türü düzenlenip onaylanınca haritada yeni türle listelenir', async () => {
  const id = (await submit('diger', 'Merkez Camii WC')).body.id;
  const pend = (await srv.admin('GET', '/api/admin/pending')).body.find((p) => p.id === id);
  assert.equal(pend.category, 'diger');
  const r = await srv.admin('PATCH', `/api/admin/pending/${id}`, { category: 'cami' });
  assert.equal(r.status, 200);
  assert.equal(r.body.category, 'cami');
  assert.equal((await srv.admin('POST', `/api/admin/pending/${id}/approve`)).status, 200);
  const place = (await srv.req('GET', '/api/places')).body.find((p) => p.id === id);
  assert.equal(place.category, 'cami');

  const id2 = (await submit('kafe', 'Lokanta WC')).body.id;
  await srv.admin('PATCH', `/api/admin/pending/${id2}`, { category: 'restoran' });
  await srv.admin('POST', `/api/admin/pending/${id2}/approve`);
  assert.equal((await srv.req('GET', '/api/places')).body.find((p) => p.id === id2).category, 'restoran');
});

test('admin: yeni mekan ve mekan düzenleme Cami/Restoran ile; eski kayıtlar bozulmaz', async () => {
  const created = await srv.admin('POST', '/api/admin/places', { name: 'Hisar Camii', category: 'cami', province: 'İzmir', district: 'Konak', lat: 38.4194, lng: 27.1283 });
  assert.equal(created.status, 201);
  assert.equal(created.body.category, 'cami');
  const patched = await srv.admin('PATCH', '/api/admin/places/eski-park', { category: 'restoran' });
  assert.equal(patched.body.category, 'restoran');
  assert.equal((await srv.admin('PATCH', '/api/admin/places/eski-park', { category: 'otel' })).status, 400);
  const avm = (await srv.req('GET', '/api/places')).body.find((p) => p.id === 'eski-avm');
  assert.equal(avm.category, 'avm', 'eski kayıt değişmedi');
  assert.ok(avm.stats, 'istatistikler hesaplanıyor');
});
