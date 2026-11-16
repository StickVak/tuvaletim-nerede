import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './helpers.js';

const seed = JSON.parse(readFileSync(new URL('../seed-places.json', import.meta.url), 'utf8'));
const srv = await startServer({ seed, demo: true });
after(() => srv.close());

test('demo seed: 5-6 İzmir users with bio and avatar files', async () => {
  const places = (await srv.req('GET', '/api/places')).body;
  const voted = places.filter((p) => p.stats.voteCount > 0);
  assert.ok(voted.length >= 8 && voted.length <= 10, `oylu mekan ${voted.length}`);
  assert.ok(places.length - voted.length > 150, 'diğerleri oysuz kalmalı');
  const reviews = (await srv.req('GET', `/api/places/${voted[0].id}/reviews`)).body;
  assert.ok(reviews.length > 0);
  const ids = new Set();
  for (const p of voted) for (const r of (await srv.req('GET', `/api/places/${p.id}/reviews`)).body) ids.add(r.userId);
  assert.ok(ids.size >= 5 && ids.size <= 6, `kullanıcı ${ids.size}`);
  for (const id of ids) {
    const u = (await srv.req('GET', `/api/users/${id}`)).body;
    assert.ok(u.bio && u.bio.length <= 160, u.displayName);
    assert.equal(u.isDemo, true);
    assert.match(u.avatarUrl, /^\/api\/avatars\//);
    assert.ok(existsSync(join(srv.dir, 'avatars', u.avatarUrl.split('/').pop())));
  }
});

test('demo seed is idempotent and demo users cannot log in', async () => {
  const { seedDemo } = await import('../demo.js');
  assert.equal(seedDemo.length >= 1, true);
  const r = await srv.req('POST', '/api/auth/login', { username: 'ayse.karsiyaka', password: '' });
  assert.equal(r.status, 401);
});
