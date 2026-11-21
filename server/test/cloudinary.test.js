import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cloudinaryConfig, cloudinarySignature, createPhotoStore, publicIdFromUrl } from '../photos.js';

const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]).toString('base64');
const CFG = { cloudName: 'demo-bulut', apiKey: '123456', apiSecret: 'gizli-sir' };

/** Sahte Cloudinary: yüklemeleri ve silmeleri kaydeder */
function fakeCloudinary() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const form = Object.fromEntries(init.body.entries());
    calls.push({ url, form });
    if (url.endsWith('/image/upload')) {
      return Response.json({ public_id: form.public_id, secure_url: `https://res.cloudinary.com/${CFG.cloudName}/image/upload/v1700000000/${form.public_id}.jpg` });
    }
    if (url.endsWith('/image/destroy')) return Response.json({ result: 'ok' });
    return new Response('{}', { status: 404 });
  };
  return { calls, fetchImpl };
}

test('ayar: üç değişken de gerekli', () => {
  assert.equal(cloudinaryConfig({}), null);
  assert.equal(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: 'a', CLOUDINARY_API_KEY: 'b' }), null);
  assert.deepEqual(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: 'a', CLOUDINARY_API_KEY: 'b', CLOUDINARY_API_SECRET: 'c' }), { cloudName: 'a', apiKey: 'b', apiSecret: 'c' });
});

test('imza: Cloudinary belgesindeki örnek (alfabetik parametreler + secret → SHA-1; file/api_key hariç)', () => {
  const params = { timestamp: 1315060510, public_id: 'sample_image', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', file: 'data:...', api_key: 'x' };
  assert.equal(cloudinarySignature(params, 'abcd'), 'bfd09f95f331f558cbd1320e67aa8d488770583e');
});

test('public_id secure_url\'den çıkarılır (sürüm, dönüşüm ve uzantı atılır)', () => {
  assert.equal(publicIdFromUrl('https://res.cloudinary.com/x/image/upload/v1700000000/tuvaletim/places/abc.jpg'), 'tuvaletim/places/abc');
  assert.equal(publicIdFromUrl('https://res.cloudinary.com/x/image/upload/f_auto,q_auto/v1/tuvaletim/avatars/5-abc.webp'), 'tuvaletim/avatars/5-abc');
});

test('yükleme: imzalı istek, data URL ve rastgele public_id; secure_url döner; yerel diske yazılmaz', async () => {
  const { calls, fetchImpl } = fakeCloudinary();
  const store = createPhotoStore({ dir: '/olmayan/klasor', folder: 'tuvaletim/places', cloudinary: CFG, fetchImpl });
  assert.equal(store.kind, 'cloudinary');
  const ref = await store.save(JPEG);
  assert.match(ref, /^https:\/\/res\.cloudinary\.com\/demo-bulut\/image\/upload\/v\d+\/tuvaletim\/places\/[a-f0-9]{32}\.jpg$/);
  const { url, form } = calls[0];
  assert.equal(url, 'https://api.cloudinary.com/v1_1/demo-bulut/image/upload');
  assert.equal(form.file, JPEG);
  assert.equal(form.api_key, '123456');
  assert.ok(!('api_secret' in form), 'secret gönderilmez');
  // Belgeye göre file ve api_key imzaya girmez: yalnızca overwrite, public_id, timestamp
  const expected = createHash('sha1')
    .update(`overwrite=false&public_id=${form.public_id}&timestamp=${form.timestamp}gizli-sir`)
    .digest('hex');
  assert.equal(form.signature, expected);
});

test('görsel olmayan içerik Cloudinary\'ye hiç gönderilmez', async () => {
  const { calls, fetchImpl } = fakeCloudinary();
  const store = createPhotoStore({ dir: '/x', folder: 'f', cloudinary: CFG, fetchImpl });
  await assert.rejects(() => store.save('data:image/png;base64,' + Buffer.from('<html>').toString('base64')), /görsel değil/);
  assert.equal(calls.length, 0);
});

test('silme: destroy API\'si public_id ile çağrılır; sunum Cloudinary\'ye yönlendirir', async () => {
  const { calls, fetchImpl } = fakeCloudinary();
  const store = createPhotoStore({ dir: '/x', folder: 'tuvaletim/places', cloudinary: CFG, fetchImpl });
  const ref = await store.save(JPEG);
  await store.remove(ref);
  const d = calls.at(-1);
  assert.equal(d.url, 'https://api.cloudinary.com/v1_1/demo-bulut/image/destroy');
  assert.equal(d.form.public_id, publicIdFromUrl(ref));
  assert.equal(d.form.invalidate, 'true');
  assert.ok(d.form.signature);

  let redirected;
  store.send({ set() {}, redirect: (code, to) => (redirected = [code, to]) }, ref);
  assert.equal(redirected[0], 302);
  assert.match(redirected[1], /\/image\/upload\/f_auto,q_auto\/v\d+\//);
});

test('Cloudinary hata verirse 502 PhotoError', async () => {
  const store = createPhotoStore({ dir: '/x', folder: 'f', cloudinary: CFG, fetchImpl: async () => Response.json({ error: { message: 'Invalid Signature' } }, { status: 401 }), log: {} });
  await assert.rejects(() => store.save(JPEG), (e) => e.status === 502);
});

// ---------------------------------------------------------------- uçtan uca: Cloudinary modunda sunucu
const realFetch = globalThis.fetch;
after(() => (globalThis.fetch = realFetch));

test('Cloudinary modunda başvuru fotoğrafı yüklenir, mekana bağlanır, silinince Cloudinary\'den de silinir', async () => {
  const { calls, fetchImpl } = fakeCloudinary();
  // Yalnızca Cloudinary istekleri sahte; test istemcisinin istekleri gerçek fetch'e gider
  globalThis.fetch = (url, init) => (String(url).startsWith('https://api.cloudinary.com/') ? fetchImpl(String(url), init) : realFetch(url, init));
  const { startServer } = await import('./helpers.js');
  const srv = await startServer({ seed: [], cloudinary: CFG });
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  try {
    const user = await srv.register('bulutcu');
    const sub = await srv.req('POST', '/api/pending', { name: 'Bulut WC', category: 'park', lat: 38.4, lng: 27.1, province: 'İzmir', district: 'Konak', vote: { cleanliness: 3, comfort: 3, isPaid: false }, photo: JPEG }, user);
    assert.equal(sub.status, 201);
    const ref = (await srv.db.get('SELECT photo_file FROM pending_places WHERE id = ?', [sub.body.id])).photo_file;
    assert.match(ref, /^https:\/\/res\.cloudinary\.com\//, 'veritabanında secure_url');
    assert.equal(existsSync(join(srv.dir, 'photos')), false, 'yerel diske yazılmadı');

    const place = (await srv.admin('POST', `/api/admin/pending/${sub.body.id}/approve`)).body;
    const res = await realFetch(`${srv.url}/api/places/${place.id}/photo`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /^https:\/\/res\.cloudinary\.com\/demo-bulut\/image\/upload\/f_auto,q_auto\//);

    assert.equal((await srv.admin('DELETE', `/api/admin/places/${place.id}`)).status, 204);
    const destroy = calls.find((c) => c.url.endsWith('/destroy'));
    assert.equal(destroy.form.public_id, publicIdFromUrl(ref));

    // reddedilen başvuru da Cloudinary'den silinir
    const sub2 = await srv.req('POST', '/api/pending', { name: 'Ret WC', category: 'park', lat: 38.4, lng: 27.1, province: 'İzmir', district: 'Konak', vote: { cleanliness: 3, comfort: 3, isPaid: false }, photo: JPEG }, user);
    const ref2 = (await srv.db.get('SELECT photo_file FROM pending_places WHERE id = ?', [sub2.body.id])).photo_file;
    await srv.admin('DELETE', `/api/admin/pending/${sub2.body.id}`);
    assert.ok(calls.some((c) => c.url.endsWith('/destroy') && c.form.public_id === publicIdFromUrl(ref2)));

    // profil fotoğrafı da Cloudinary'ye
    const me = await srv.req('PUT', '/api/profile/avatar', { image: JPEG }, user);
    assert.match(me.body.user.avatarUrl, /^https:\/\/res\.cloudinary\.com\/demo-bulut\/image\/upload\/.*tuvaletim\/avatars\//);
  } finally {
    srv.close();
    globalThis.fetch = realFetch;
  }
});
