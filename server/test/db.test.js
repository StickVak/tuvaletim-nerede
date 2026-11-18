import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dbConfig, openDb } from '../db.js';

test('TURSO_DATABASE_URL verilirse Turso (uzak), verilmezse yerel file: adresi', () => {
  assert.deepEqual(dbConfig('server/data/x.db', { url: 'libsql://tuvaletim-ornek.turso.io', authToken: 'tok' }), {
    url: 'libsql://tuvaletim-ornek.turso.io', authToken: 'tok', remote: true,
  });
  const local = dbConfig(resolve('server/data/tuvaletim.db'));
  assert.equal(local.remote, false);
  assert.equal(local.url, 'file:server/data/tuvaletim.db', 'göreli, eğik çizgili yol (Windows uyumlu)');
  assert.equal(dbConfig('x.db', { url: 'file:baska.db' }).remote, false);
});

test('yerel libSQL: kimlikler sayı, batch tek işlem (hata olursa hiçbiri yazılmaz)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tn-db-'));
  const db = await openDb(join(dir, 'x.db'));
  const { lastId } = await db.run("INSERT INTO users (username, password_hash, role, created_at) VALUES ('a', 'x', 'user', '2026-01-01')");
  assert.equal(typeof lastId, 'number');
  await assert.rejects(() =>
    db.batch([
      ["INSERT INTO users (username, password_hash, role, created_at) VALUES ('b', 'x', 'user', '2026-01-01')", []],
      ["INSERT INTO users (username, password_hash, role, created_at) VALUES ('a', 'x', 'user', '2026-01-01')", []], // UNIQUE hatası
    ]),
  );
  assert.deepEqual((await db.all('SELECT username FROM users')).map((u) => u.username), ['a'], 'geri alındı');
  const row = await db.get('SELECT id, username FROM users WHERE id = ?', [lastId]);
  assert.deepEqual(row, { id: lastId, username: 'a' }, 'düz nesne');
  db.close();
});
