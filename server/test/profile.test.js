import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './helpers.js';

const SEED = [{ id: 'seed-forum', name: 'Forum Bornova', category: 'avm', district: 'Bornova', lat: 38.45, lng: 27.21 }];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let srv, me, other;
before(async () => {
  srv = await startServer({ seed: SEED });
  me = await srv.registerFull('profilci');
  other = await srv.registerFull('baskasi');
});
after(() => srv.close());

test('auth user carries displayName (defaults to username) and avatarUrl', async () => {
  assert.equal(me.user.displayName, 'profilci');
  assert.equal(me.user.avatarUrl, null);
});

test('PATCH /api/profile updates display name and bio; validates lengths', async () => {
  const r = await srv.req('PATCH', '/api/profile', { displayName: 'Ayşe Yılmaz', bio: 'Karşıyaka sahil' }, me.token);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.displayName, 'Ayşe Yılmaz');
  assert.equal(r.body.user.bio, 'Karşıyaka sahil');
  assert.equal((await srv.req('PATCH', '/api/profile', { bio: 'x'.repeat(161) }, me.token)).status, 400);
  assert.equal((await srv.req('PATCH', '/api/profile', { displayName: '' }, me.token)).status, 400);
  assert.equal((await srv.req('PATCH', '/api/profile', { displayName: 'x' }, null)).status, 401);
});

test('password change requires current password', async () => {
  assert.equal((await srv.req('POST', '/api/profile/password', { currentPassword: 'yanlis', newPassword: 'yenisifre1' }, me.token)).status, 400);
  assert.equal((await srv.req('POST', '/api/profile/password', { currentPassword: 'secret1', newPassword: '123' }, me.token)).status, 400);
  assert.equal((await srv.req('POST', '/api/profile/password', { currentPassword: 'secret1', newPassword: 'yenisifre1' }, me.token)).status, 204);
  assert.equal((await srv.req('POST', '/api/auth/login', { username: 'profilci', password: 'secret1' })).status, 401);
  const relog = await srv.req('POST', '/api/auth/login', { username: 'profilci', password: 'yenisifre1' });
  assert.equal(relog.status, 200);
  // Güvenlik: şifre değişince eski erişim belirteçleri geçersiz (uygulama güvenilir cihazla sessizce tazeler)
  assert.equal((await srv.req('GET', '/api/auth/me', null, me.token)).status, 401);
  me.token = relog.body.token;
});

test('avatar upload: raster only, magic bytes checked, stored under data/avatars, served nosniff', async () => {
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64');
  assert.equal((await srv.req('PUT', '/api/profile/avatar', { image: svg }, me.token)).status, 400);
  const fake = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
  assert.equal((await srv.req('PUT', '/api/profile/avatar', { image: fake }, me.token)).status, 400);
  const big = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(2_100_000)]).toString('base64');
  assert.equal((await srv.req('PUT', '/api/profile/avatar', { image: big }, me.token)).status, 413);
  const ok = await srv.req('PUT', '/api/profile/avatar', { image: PNG }, me.token);
  assert.equal(ok.status, 200);
  const url = ok.body.user.avatarUrl;
  assert.match(url, /^\/api\/avatars\/\d+-[a-f0-9]+\.png$/);
  assert.ok(existsSync(join(srv.dir, 'avatars', url.split('/').pop())));
  const res = await fetch(srv.url + url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(srv.url + '/api/avatars/..%2Ftest.db')).status, 404);
  // yeni yükleme eskisini siler
  const again = await srv.req('PUT', '/api/profile/avatar', { image: PNG }, me.token);
  assert.ok(!existsSync(join(srv.dir, 'avatars', url.split('/').pop())));
  assert.equal((await srv.req('DELETE', '/api/profile/avatar', null, me.token)).body.user.avatarUrl, null);
  assert.ok(!existsSync(join(srv.dir, 'avatars', again.body.user.avatarUrl.split('/').pop())));
});

test('GET /api/profile returns stats and activity', async () => {
  await srv.req('PUT', '/api/places/seed-forum/vote', { cleanliness: 4, comfort: 4, isPaid: false, comment: 'İyi' }, me.token);
  await srv.req('PUT', '/api/favorites/seed-forum', null, me.token);
  await srv.req('POST', '/api/places/seed-forum/reports', { type: 'crowded' }, me.token);
  await srv.req('POST', '/api/pending', { name: 'Yeni Yer WC', category: 'park', lat: 38.4, lng: 27.1, province: 'İzmir', district: 'Konak', vote: { cleanliness: 3, comfort: 3, isPaid: false }, photo: 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64') }, me.token);
  const r = await srv.req('GET', '/api/profile', null, me.token);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.stats, { votes: 1, comments: 1, placesAdded: 0, pending: 1, favorites: 1, contributions: 2 }); // 1 oy + 1 bildirim
  const kinds = r.body.activity.map((a) => a.kind).sort();
  assert.deepEqual(kinds, ['favorite', 'pending', 'report', 'vote']);
  assert.equal(r.body.user.email, undefined);
});

test('GET /api/users/:id is public and never exposes secrets', async () => {
  const r = await srv.req('GET', `/api/users/${me.user.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.displayName, 'Ayşe Yılmaz');
  assert.equal(r.body.bio, 'Karşıyaka sahil');
  assert.ok(r.body.createdAt);
  assert.equal(r.body.stats.votes, 1);
  assert.equal(r.body.reviews[0].placeName, 'Forum Bornova');
  assert.equal(r.body.reviews[0].cleanliness, 4);
  const text = JSON.stringify(r.body);
  for (const secret of ['password', 'hash', 'email', 'scrypt', 'role']) assert.ok(!text.includes(secret), secret);
  assert.equal((await srv.req('GET', '/api/users/99999')).status, 404);
});

test('reviews carry author id, display name and avatar', async () => {
  const r = await srv.req('GET', '/api/places/seed-forum/reviews');
  assert.equal(r.body[0].userId, me.user.id);
  assert.equal(r.body[0].displayName, 'Ayşe Yılmaz');
  assert.ok('avatarUrl' in r.body[0]);
});

test('favorites toggle and appear on places as isFavorite', async () => {
  assert.equal((await srv.req('PUT', '/api/favorites/seed-forum', null, other.token)).status, 204);
  assert.equal((await srv.req('PUT', '/api/favorites/seed-forum', null, other.token)).status, 204); // idempotent
  assert.equal((await srv.req('GET', '/api/places', null, other.token)).body[0].isFavorite, true);
  assert.equal((await srv.req('GET', '/api/places')).body[0].isFavorite, false);
  assert.equal((await srv.req('DELETE', '/api/favorites/seed-forum', null, other.token)).status, 204);
  assert.equal((await srv.req('GET', '/api/places', null, other.token)).body[0].isFavorite, false);
  assert.equal((await srv.req('PUT', '/api/favorites/yok', null, other.token)).status, 404);
  assert.equal((await srv.req('PUT', '/api/favorites/seed-forum', null, null)).status, 401);
});

test('status reports: 2 distinct users mark closed → place.status.closed', async () => {
  assert.equal((await srv.req('POST', '/api/places/seed-forum/reports', { type: 'bozuk' }, me.token)).status, 400);
  const a = await srv.req('POST', '/api/places/seed-forum/reports', { type: 'closed' }, me.token);
  assert.equal(a.status, 200);
  assert.equal(a.body.status.closed, false);
  await srv.req('POST', '/api/places/seed-forum/reports', { type: 'closed' }, me.token); // aynı kişi tekrar sayılmaz
  assert.equal((await srv.req('GET', '/api/places')).body[0].status.closed, false);
  const b = await srv.req('POST', '/api/places/seed-forum/reports', { type: 'closed' }, other.token);
  assert.equal(b.body.status.closed, true);
  assert.equal(b.body.status.closedReports, 2);
});

test('toilet type: OSM base, then majority of votes', async () => {
  const p = (await srv.req('GET', '/api/places')).body[0];
  assert.equal(p.toiletType, null);
  assert.equal(p.publicAccess, true); // avm varsayılanı
  await srv.req('PUT', '/api/places/seed-forum/vote', { cleanliness: 4, comfort: 4, isPaid: false, toiletType: 'alaturka' }, other.token);
  assert.equal((await srv.req('GET', '/api/places')).body[0].toiletType, 'alaturka');
  assert.equal((await srv.req('PUT', '/api/places/seed-forum/vote', { cleanliness: 4, comfort: 4, isPaid: false, toiletType: 'uzay' }, other.token)).status, 400);
});
