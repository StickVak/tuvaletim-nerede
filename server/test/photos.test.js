import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './helpers.js';

// Gerçek imzalı küçük görseller (magic byte kontrolünden geçer)
export const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]).toString('base64');
const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
const FAKE_PNG = 'data:image/png;base64,' + Buffer.from('<html><script>alert(1)</script></html>').toString('base64');

const SEED = [{ id: 'seed-forum', name: 'Forum Bornova', category: 'avm', district: 'Bornova', lat: 38.45, lng: 27.21 }];
const submission = (o = {}) => ({
  name: 'Fotoğraflı WC', category: 'kafe', lat: 38.44, lng: 27.14,
  vote: { cleanliness: 4, comfort: 4, isPaid: false }, photo: JPEG, ...o,
});

let srv, user;
const photosDir = () => join(srv.dir, 'photos');
const files = () => (existsSync(photosDir()) ? readdirSync(photosDir()) : []);
before(async () => {
  srv = await startServer({ seed: SEED });
  user = await srv.register('fotografci');
});
after(() => srv.close());

test('dış mekan fotoğrafı olmadan başvuru kabul edilmez', async () => {
  for (const photo of [undefined, null, '']) {
    const r = await srv.req('POST', '/api/pending', submission({ photo }), user);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /fotoğraf/i);
  }
});

test('içerik baytları görsel olmayan dosya reddedilir', async () => {
  const r = await srv.req('POST', '/api/pending', submission({ photo: FAKE_PNG }), user);
  assert.equal(r.status, 400);
  assert.equal(files().length, 0);
});

test('fotoğraf diskte rastgele adla saklanır, veritabanında base64 tutulmaz', async () => {
  const r = await srv.req('POST', '/api/pending', submission(), user);
  assert.equal(r.status, 201);
  const row = (await srv.db.get('SELECT photo, photo_file FROM pending_places WHERE id = ?', [r.body.id]));
  assert.equal(row.photo, null);
  assert.match(row.photo_file, /^[a-f0-9]{32}\.jpg$/);
  assert.ok(existsSync(join(photosDir(), row.photo_file)));
});

test('yönetim: başvuru fotoğrafı anahtarla görüntülenir; onayda mekana bağlanır', async () => {
  const sub = await srv.req('POST', '/api/pending', submission({ name: 'Onaylanacak WC' }), user);
  const item = (await srv.admin('GET', '/api/admin/pending')).body.find((p) => p.id === sub.body.id);
  assert.equal(item.photo, `/api/admin/pending/${sub.body.id}/photo`);
  assert.equal(item.hasPhoto, true);
  const res = await fetch(srv.url + item.photo, { headers: { 'X-Admin-Key': (await import('./helpers.js')).ADMIN_KEY } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(srv.url + item.photo)).status, 401, 'anahtarsız görülemez');

  const place = (await srv.admin('POST', `/api/admin/pending/${sub.body.id}/approve`)).body;
  assert.equal(place.hasPhoto, true);
  const pub = await fetch(`${srv.url}/api/places/${place.id}/photo`);
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await pub.arrayBuffer()), Buffer.from(JPEG.split(',')[1], 'base64'));
});

test('reddedilen başvurunun fotoğrafı silinir', async () => {
  const sub = await srv.req('POST', '/api/pending', submission({ name: 'Reddedilecek WC' }), user);
  const file = (await srv.db.get('SELECT photo_file FROM pending_places WHERE id = ?', [sub.body.id])).photo_file;
  assert.equal((await srv.admin('DELETE', `/api/admin/pending/${sub.body.id}`)).status, 204);
  assert.equal(existsSync(join(photosDir(), file)), false);
});

test('yönetim düzenleme: fotoğraf değişince eskisi, kaldırılınca dosya silinir; mekan silinince de', async () => {
  const p = (await srv.admin('PATCH', '/api/admin/places/seed-forum', { photo: JPEG })).body;
  assert.equal(p.hasPhoto, true);
  const first = (await srv.db.get("SELECT photo_file FROM places WHERE id = 'seed-forum'")).photo_file;
  await srv.admin('PATCH', '/api/admin/places/seed-forum', { photo: PNG });
  const second = (await srv.db.get("SELECT photo_file FROM places WHERE id = 'seed-forum'")).photo_file;
  assert.match(second, /\.png$/);
  assert.equal(existsSync(join(photosDir(), first)), false);
  const res = await fetch(`${srv.url}/api/places/seed-forum/photo`);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal((await srv.admin('PATCH', '/api/admin/places/seed-forum', { photo: null })).body.hasPhoto, false);
  assert.equal(existsSync(join(photosDir(), second)), false);
  assert.equal((await fetch(`${srv.url}/api/places/seed-forum/photo`)).status, 404);

  const created = (await srv.admin('POST', '/api/admin/places', { name: 'Silinecek Fotolu', category: 'park', lat: 38.4, lng: 27.1, photo: JPEG })).body;
  const f = (await srv.db.get('SELECT photo_file FROM places WHERE id = ?', [created.id])).photo_file;
  assert.ok(existsSync(join(photosDir(), f)));
  await srv.admin('DELETE', `/api/admin/places/${created.id}`);
  assert.equal(existsSync(join(photosDir(), f)), false);
  assert.equal((await srv.admin('PATCH', '/api/admin/places/seed-forum', { photo: FAKE_PNG })).status, 400);
});

test('eski sürümlerde veritabanına gömülü base64 fotoğraflar açılışta dosyaya taşınır', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { openDb } = await import('../db.js');
  const { createApp } = await import('../app.js');
  const dir = mkdtempSync(join(tmpdir(), 'tn-photomig-'));
  const seedFile = join(dir, 'seed.json');
  writeFileSync(seedFile, JSON.stringify(SEED));
  const db = await openDb(join(dir, 'x.db'), { seedFile });
  (await db.run("UPDATE places SET photo = ? WHERE id = 'seed-forum'", [JPEG]));
  (await db.run(`INSERT INTO pending_places (id, name, category, lat, lng, photo, cleanliness, comfort, is_paid, submitted_at)
          VALUES ('user-eski', 'Eski Başvuru', 'park', 38.4, 27.1, ?, 3, 3, 0, '2026-01-01')`, [PNG]));
  const app = await createApp({ dbPath: join(dir, 'x.db'), secret: 's', seedFile, mailer: { kind: 'test', sendVerificationCode: async () => {} } });
  const db2 = app.locals.db;
  const place = (await db2.get("SELECT photo, photo_file FROM places WHERE id = 'seed-forum'"));
  assert.equal(place.photo, null);
  assert.ok(existsSync(join(dir, 'photos', place.photo_file)));
  const pend = (await db2.get("SELECT photo, photo_file FROM pending_places WHERE id = 'user-eski'"));
  assert.equal(pend.photo, null);
  assert.match(pend.photo_file, /\.png$/);
});
