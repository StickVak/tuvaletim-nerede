import initSqlJs from 'sql.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  district TEXT,
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  photo TEXT,
  hours TEXT,
  accessible INTEGER NOT NULL DEFAULT 0,
  baby_changing INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cleanliness INTEGER NOT NULL,
  comfort INTEGER NOT NULL,
  is_paid INTEGER NOT NULL,
  price_amount REAL,
  comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, place_id)
);
CREATE TABLE IF NOT EXISTS pending_places (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  district TEXT,
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  photo TEXT,
  hours TEXT,
  accessible INTEGER NOT NULL DEFAULT 0,
  baby_changing INTEGER NOT NULL DEFAULT 0,
  cleanliness INTEGER NOT NULL,
  comfort INTEGER NOT NULL,
  is_paid INTEGER NOT NULL,
  price_amount REAL,
  comment TEXT,
  submitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS votes_place ON votes(place_id);
`;

const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

/**
 * sql.js veritabanını açar (dosya yoksa oluşturur) ve her yazmadan sonra dosyaya kaydeder.
 * `places` boşsa seed dosyasından doldurur.
 */
export async function openDb(path, { seedFile } = {}) {
  const SQL = await initSqlJs();
  const db = existsSync(path) ? new SQL.Database(readFileSync(path)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  let inTx = false;

  function save() {
    if (inTx) return;
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, Buffer.from(db.export()));
    renameSync(tmp, path);
    // export() bağlantıyı yeniden açar ve PRAGMA'ları sıfırlar
    db.run('PRAGMA foreign_keys = ON');
  }

  function all(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params.map(norm));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function run(sql, params = []) {
    db.run(sql, params.map(norm));
    const changes = db.getRowsModified();
    const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    save();
    return { lastId, changes };
  }

  /** fn içindeki tüm yazmalar tek işlemde; sonunda bir kez kaydedilir. */
  function tx(fn) {
    db.run('BEGIN');
    inTx = true;
    try {
      const result = fn();
      db.run('COMMIT');
      inTx = false;
      save();
      return result;
    } catch (err) {
      db.run('ROLLBACK');
      inTx = false;
      throw err;
    }
  }

  const api = { all, get: (sql, params) => all(sql, params)[0], run, tx, save };

  if (seedFile && existsSync(seedFile) && api.get('SELECT COUNT(*) AS n FROM places').n === 0) {
    const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
    const now = new Date().toISOString();
    tx(() => {
      for (const p of seed) {
        run(
          `INSERT INTO places (id, name, category, district, address, lat, lng, hours, accessible, baby_changing, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
          [p.id, p.name, p.category, p.district, p.address, p.lat, p.lng, p.hours, !!p.accessible, !!p.babyChanging, now, now],
        );
      }
    });
  }

  return api;
}
