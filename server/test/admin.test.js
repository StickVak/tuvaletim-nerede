import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]).toString('base64');

const SEED = [
  { id: 'seed-forum', name: 'Forum Bornova', category: 'avm', district: 'Bornova', lat: 38.45, lng: 27.21 },
  { id: 'seed-wc', name: 'Kordon WC', category: 'belediye', district: 'Konak', lat: 38.43, lng: 27.14 },
];
const submission = (o = {}) => ({
  name: 'Yeni Kafe WC',
  category: 'kafe',
  lat: 38.44,
  lng: 27.14,
  district: 'Konak',
  accessible: true,
  vote: { cleanliness: 4, comfort: 5, isPaid: false, priceAmount: null, comment: 'Güzel' },
  photo: JPEG,
  ...o,
});

let srv, user, user2, user3;
before(async () => {
  srv = await startServer({ seed: SEED });
  user = await srv.register('basvuran');
  user2 = await srv.register('ihbarci2');
  user3 = await srv.register('ihbarci3');
});
after(() => srv.close());

// ------------------------------------------------------------------ anahtar doğrulaması
test('yönetim API: anahtarsız 401, yanlış anahtar 401, kullanıcı belirteci yetmez', async () => {
  assert.equal((await srv.admin('GET', '/api/admin/stats', null, null)).status, 401);
  assert.equal((await srv.admin('GET', '/api/admin/stats', null, 'yanlis-anahtar')).status, 401);
  assert.equal((await srv.req('GET', '/api/admin/stats', null, user)).status, 401);
  assert.equal((await srv.admin('GET', '/api/admin/stats')).status, 200);
});

test('ADMIN_SECRET_KEY tanımlı değilse yönetim API tamamen kapalı (503)', async () => {
  const s2 = await startServer({ adminKey: '' });
  assert.equal((await s2.admin('GET', '/api/admin/stats', null, 'herhangi')).status, 503);
  assert.equal((await s2.admin('GET', '/api/admin/stats', null, '')).status, 503);
  s2.close();
});

test('çok kısa anahtar kabul edilmez (sunucu başlamaz)', async () => {
  await assert.rejects(() => startServer({ adminKey: 'kisa' }), /ADMIN_SECRET_KEY/);
});

test('eski sürümlerin role=admin hesabı açılışta silinir', async () => {
  const { openDb } = await import('../db.js');
  const { createApp } = await import('../app.js');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'tn-legacy-'));
  const db = await openDb(join(dir, 'x.db'));
  (await db.run("INSERT INTO users (username, password_hash, role, created_at) VALUES ('admin', 'x', 'admin', '2026-01-01')"));
  (await db.run("INSERT INTO users (username, password_hash, role, created_at) VALUES ('ali', 'x', 'user', '2026-01-01')"));
  const app = await createApp({ dbPath: join(dir, 'x.db'), secret: 's', adminKey: '' });
  assert.deepEqual((await app.locals.db.all('SELECT username FROM users')).map((u) => u.username), ['ali']);
});

// ------------------------------------------------------------------ başvurular
test('pending without token → 401', async () => {
  assert.equal((await srv.req('POST', '/api/pending', submission())).status, 401);
});

test('invalid submission → 400', async () => {
  assert.equal((await srv.req('POST', '/api/pending', submission({ name: 'ab' }), user)).status, 400);
  assert.equal((await srv.req('POST', '/api/pending', submission({ category: 'otel' }), user)).status, 400);
  assert.equal((await srv.req('POST', '/api/pending', submission({ lat: 'x' }), user)).status, 400);
  assert.equal((await srv.req('POST', '/api/pending', submission({ vote: { cleanliness: 9 } }), user)).status, 400);
  assert.equal((await srv.req('POST', '/api/pending', submission({ photo: 'http://evil' }), user)).status, 400);
});

test('submit → appears in admin pending, not in /api/places; approve → place with submitter vote', async () => {
  const sub = await srv.req('POST', '/api/pending', submission(), user);
  assert.equal(sub.status, 201);
  const pending = await srv.admin('GET', '/api/admin/pending');
  const item = pending.body.find((p) => p.id === sub.body.id);
  assert.equal(item.username, 'basvuran');
  assert.equal(item.vote.isPaid, false);
  assert.ok(!(await srv.req('GET', '/api/places')).body.some((p) => p.name === 'Yeni Kafe WC'));

  const approved = await srv.admin('POST', `/api/admin/pending/${sub.body.id}/approve`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.stats.voteCount, 1);
  assert.equal(approved.body.source, 'user');
  assert.equal(approved.body.accessible, true);
  const mine = (await srv.req('GET', '/api/places', null, user)).body.find((p) => p.id === approved.body.id);
  assert.equal(mine.myVote.comment, 'Güzel');
  assert.equal((await srv.admin('GET', '/api/admin/pending')).body.length, 0);
});

test('reject removes pending', async () => {
  const sub = await srv.req('POST', '/api/pending', submission({ name: 'Reddedilecek' }), user);
  assert.equal((await srv.admin('DELETE', `/api/admin/pending/${sub.body.id}`)).status, 204);
  assert.ok(!(await srv.admin('GET', '/api/admin/pending')).body.some((p) => p.id === sub.body.id));
});

// ------------------------------------------------------------------ mekanlar
test('yeni mekan ekleme (POST /api/admin/places)', async () => {
  const r = await srv.admin('POST', '/api/admin/places', { name: 'Admin WC', category: 'belediye', lat: 38.41, lng: 27.12, district: 'Konak', hours: '08:00-20:00' });
  assert.equal(r.status, 201);
  assert.equal(r.body.source, 'admin');
  assert.equal(r.body.closedAt, null);
  assert.ok((await srv.req('GET', '/api/places')).body.some((p) => p.id === r.body.id));
  assert.equal((await srv.admin('POST', '/api/admin/places', { name: 'ab', category: 'avm', lat: 1, lng: 1 })).status, 400);
  assert.equal((await srv.admin('POST', '/api/admin/places', { name: 'Konumsuz Mekan', category: 'avm' })).status, 400);
});

test('patch place name', async () => {
  const r = await srv.admin('PATCH', '/api/admin/places/seed-forum', { name: 'Forum Bornova AVM', lat: 38.451 });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Forum Bornova AVM');
  assert.equal(r.body.lat, 38.451);
  assert.equal((await srv.admin('PATCH', '/api/admin/places/seed-forum', { name: 'x' })).status, 400);
  assert.equal((await srv.admin('PATCH', '/api/admin/places/yok', { name: 'Yok Mekan' })).status, 404);
});

test('yönetim mekan listesi kapalı mekanları da içerir', async () => {
  const list = await srv.admin('GET', '/api/admin/places');
  assert.equal(list.status, 200);
  assert.ok(list.body.some((p) => p.id === 'seed-forum' && p.closedAt === null));
});

// ------------------------------------------------------------------ Temiz Kalp ihbarları
test('ihbar kuyruğu: ≥2 farklı kullanıcı → şüpheli; reddet → kuyruktan ve canlı durumdan düşer', async () => {
  await srv.req('POST', '/api/places/seed-wc/reports', { type: 'closed' }, user2);
  await srv.req('POST', '/api/places/seed-wc/reports', { type: 'closed' }, user3);
  await srv.req('POST', '/api/places/seed-forum/reports', { type: 'crowded' }, user2);
  assert.equal((await srv.req('GET', '/api/places')).body.find((p) => p.id === 'seed-wc').status.closed, true);

  const q = await srv.admin('GET', '/api/admin/reports');
  assert.equal(q.status, 200);
  assert.equal(q.body[0].place.id, 'seed-wc', 'şüpheli olan en üstte');
  assert.equal(q.body[0].flagged, true);
  assert.deepEqual(q.body[0].counts, { closed: 2, no_supplies: 0, crowded: 0 });
  assert.deepEqual(q.body[0].reports.map((r) => r.username).sort(), ['ihbarci2', 'ihbarci3']);
  const forum = q.body.find((x) => x.place.id === 'seed-forum');
  assert.equal(forum.flagged, false);

  assert.equal((await srv.admin('POST', '/api/admin/reports/seed-wc/reject')).status, 204);
  assert.ok(!(await srv.admin('GET', '/api/admin/reports')).body.some((x) => x.place.id === 'seed-wc'));
  assert.equal((await srv.req('GET', '/api/places')).body.find((p) => p.id === 'seed-wc').status.closed, false, 'reddedilen ihbar canlı durumu etkilemez');
  // kullanıcının katkı sayısı korunur
  const me = await srv.req('GET', '/api/profile', null, user2);
  assert.ok(me.body.stats.contributions >= 2);
});

test('ihbar onayı → mekan kalıcı kapalı: haritadan gizlenir, yönetimde görünür, tekrar açılabilir', async () => {
  await srv.req('POST', '/api/places/seed-forum/reports', { type: 'closed' }, user3);
  assert.equal((await srv.admin('POST', '/api/admin/reports/seed-forum/approve')).status, 200);
  assert.ok(!(await srv.req('GET', '/api/places')).body.some((p) => p.id === 'seed-forum'));
  assert.equal((await srv.req('GET', '/api/places/seed-forum/reviews')).status, 404);
  assert.equal((await srv.req('PUT', '/api/places/seed-forum/vote', { cleanliness: 3, comfort: 3, isPaid: false }, user)).status, 404);
  const admin = (await srv.admin('GET', '/api/admin/places')).body.find((p) => p.id === 'seed-forum');
  assert.ok(admin.closedAt);
  assert.ok(!(await srv.admin('GET', '/api/admin/reports')).body.some((x) => x.place.id === 'seed-forum'));

  const reopened = await srv.admin('PATCH', '/api/admin/places/seed-forum', { closed: false });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.closedAt, null);
  assert.ok((await srv.req('GET', '/api/places')).body.some((p) => p.id === 'seed-forum'));
  assert.equal((await srv.admin('POST', '/api/admin/reports/yok/approve')).status, 404);
});

test('tek bir ihbar silinebilir', async () => {
  await srv.req('POST', '/api/places/seed-wc/reports', { type: 'no_supplies' }, user);
  const item = (await srv.admin('GET', '/api/admin/reports')).body.find((x) => x.place.id === 'seed-wc');
  assert.equal((await srv.admin('DELETE', `/api/admin/report-items/${item.reports[0].id}`)).status, 204);
  assert.equal((await srv.admin('DELETE', `/api/admin/report-items/999999`)).status, 404);
  assert.ok(!(await srv.admin('GET', '/api/admin/reports')).body.some((x) => x.place.id === 'seed-wc'));
});

// ------------------------------------------------------------------ kullanıcı denetimi
test('kullanıcı listesi ve ayrıntısı: oylar, ihbarlar, eklenen mekanlar', async () => {
  await srv.req('PUT', '/api/places/seed-wc/vote', { cleanliness: 2, comfort: 2, isPaid: true, priceAmount: 5, comment: 'Kirli' }, user2);
  const list = await srv.admin('GET', '/api/admin/users');
  assert.equal(list.status, 200);
  const u2 = list.body.find((u) => u.username === 'ihbarci2');
  assert.equal(u2.votes, 1);
  assert.ok(u2.reports >= 2);
  assert.equal(list.body.find((u) => u.username === 'basvuran').placesAdded, 1);
  for (const k of ['password_hash', 'passwordHash']) assert.ok(!(k in u2), k);
  assert.equal(u2.email, 'ihbarci2@test.local', 'yönetici e-postayı görür (doğrulanmış kayıt)');

  const d = await srv.admin('GET', `/api/admin/users/${u2.id}`);
  assert.equal(d.status, 200);
  assert.equal(d.body.votes[0].comment, 'Kirli');
  assert.equal(d.body.votes[0].placeName, 'Kordon WC');
  assert.ok(d.body.reports.length >= 2);
  assert.equal((await srv.admin('GET', '/api/admin/users/999999')).status, 404);
});

test('kullanıcı silme: oyları ve ihbarları gider', async () => {
  const u3 = (await srv.admin('GET', '/api/admin/users')).body.find((u) => u.username === 'ihbarci3');
  assert.equal((await srv.admin('DELETE', `/api/admin/users/${u3.id}`)).status, 204);
  assert.ok(!(await srv.admin('GET', '/api/admin/users')).body.some((u) => u.username === 'ihbarci3'));
  assert.equal((await srv.req('GET', '/api/auth/me', null, user3)).status, 401);
});

test('delete vote recalculates stats (voteCount 0)', async () => {
  const votes = await srv.admin('GET', '/api/admin/votes');
  const v = votes.body.find((x) => x.placeId === 'seed-wc');
  assert.equal(v.username, 'ihbarci2');
  assert.equal(v.priceAmount, 5);
  assert.equal((await srv.admin('DELETE', `/api/admin/votes/${v.id}`)).status, 204);
  const place = (await srv.req('GET', '/api/places')).body.find((p) => p.id === 'seed-wc');
  assert.equal(place.stats.voteCount, 0);
});

test('stats', async () => {
  const s = await srv.admin('GET', '/api/admin/stats');
  assert.equal(s.status, 200);
  assert.deepEqual(Object.keys(s.body).sort(), ['avgCleanliness', 'closedPlaces', 'flaggedPlaces', 'pending', 'places', 'reports', 'users', 'votes']);
  assert.equal(s.body.users, 2);
});

test('delete place removes its votes', async () => {
  await srv.req('PUT', '/api/places/seed-forum/vote', { cleanliness: 5, comfort: 5, isPaid: false }, user);
  assert.equal((await srv.admin('DELETE', '/api/admin/places/seed-forum')).status, 204);
  assert.ok(!(await srv.admin('GET', '/api/admin/votes')).body.some((v) => v.placeId === 'seed-forum'));
  assert.ok(!(await srv.req('GET', '/api/places')).body.some((p) => p.id === 'seed-forum'));
});

test('svg photos are rejected and photo responses are nosniff', async () => {
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  assert.equal((await srv.req('POST', '/api/pending', submission({ name: 'SVG Deneme', photo: svg }), user)).status, 400);
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  const sub = await srv.req('POST', '/api/pending', submission({ name: 'JPEG Deneme', photo: jpeg }), user);
  assert.equal(sub.status, 201);
  const place = await srv.admin('POST', `/api/admin/pending/${sub.body.id}/approve`);
  const res = await fetch(`${srv.url}/api/places/${place.body.id}/photo`);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('yönetim anahtarı brute force: başarısız denemeler sınırlanır', async () => {
  const s2 = await startServer({ limits: { adminAuth: { windowMs: 60000, max: 2 } } });
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await s2.admin('GET', '/api/admin/stats', null, 'yanlis')).status);
  assert.deepEqual(codes, [401, 401, 429]);
  s2.close();
});
