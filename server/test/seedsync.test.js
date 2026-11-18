import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.js';
import { removeDemoData } from '../app.js';

const place = (id) => ({ id, name: id, category: 'avm', district: 'Konak', address: null, lat: 38.42, lng: 27.13, hours: null, accessible: false, babyChanging: false });
const tmp = () => mkdtempSync(join(tmpdir(), 'tn-sync-'));

test('mevcut veritabanına seed dosyasındaki yeni mekanlar eklenir', async () => {
  const dir = tmp();
  const seedFile = join(dir, 'seed.json');
  writeFileSync(seedFile, JSON.stringify([place('a'), place('b')]));
  let db = await openDb(join(dir, 'x.db'), { seedFile });
  assert.equal(db.get('SELECT COUNT(*) AS n FROM places').n, 2);

  writeFileSync(seedFile, JSON.stringify([place('a'), place('b'), place('c')]));
  db = await openDb(join(dir, 'x.db'), { seedFile });
  assert.deepEqual(db.all('SELECT id FROM places ORDER BY id').map((r) => r.id), ['a', 'b', 'c']);
});

test('yöneticinin sildiği seed mekanı yeniden eklenmez', async () => {
  const dir = tmp();
  const seedFile = join(dir, 'seed.json');
  writeFileSync(seedFile, JSON.stringify([place('a'), place('b')]));
  let db = await openDb(join(dir, 'x.db'), { seedFile });
  db.deletePlace('a');
  db = await openDb(join(dir, 'x.db'), { seedFile });
  assert.deepEqual(db.all('SELECT id FROM places').map((r) => r.id), ['b']);
});

test('örnek (demo) kullanıcılar, oyları ve avatarları silinir; gerçek kullanıcılara dokunulmaz', async () => {
  const dir = tmp();
  const seedFile = join(dir, 'seed.json');
  writeFileSync(seedFile, JSON.stringify([place('a')]));
  const db = await openDb(join(dir, 'x.db'), { seedFile });
  const avatarDir = join(dir, 'avatars');
  mkdirSync(avatarDir);
  writeFileSync(join(avatarDir, '1-demo.png'), 'x');
  const now = new Date().toISOString();
  const demo = db.run("INSERT INTO users (username, password_hash, role, is_demo, avatar_url, created_at) VALUES ('demo', 'x', 'user', 1, '/api/avatars/1-demo.png', ?)", [now]).lastId;
  const real = db.run("INSERT INTO users (username, password_hash, role, created_at) VALUES ('gercek', 'x', 'user', ?)", [now]).lastId;
  for (const u of [demo, real]) {
    db.run('INSERT INTO votes (place_id, user_id, cleanliness, comfort, is_paid, created_at, updated_at) VALUES (?, ?, 4, 4, 0, ?, ?)', ['a', u, now, now]);
  }
  assert.equal(removeDemoData(db, avatarDir), 1);
  assert.deepEqual(db.all('SELECT username FROM users').map((r) => r.username), ['gercek']);
  assert.deepEqual(db.all('SELECT user_id FROM votes').map((r) => r.user_id), [real]);
  assert.equal(existsSync(join(avatarDir, '1-demo.png')), false);
  assert.equal(removeDemoData(db, avatarDir), 0);
});
