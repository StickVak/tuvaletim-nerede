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
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, place_id)
);
CREATE TABLE IF NOT EXISTS status_reports (
  id INTEGER PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('closed', 'no_supplies', 'crowded', 'open')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_place_time ON status_reports(place_id, created_at);
-- E-posta doğrulama kodları (kayıt): kod düz metin değil HMAC olarak saklanır; 10 dk geçerli, en fazla 5 hatalı deneme
CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL
);
-- Yöneticinin sildiği seed mekanları: açılıştaki seed eşitlemesi bunları yeniden eklemez
CREATE TABLE IF NOT EXISTS seed_removed (id TEXT PRIMARY KEY);
`;

/** Sonradan eklenen sütunlar: yeni ve eski veritabanları aynı göçten geçer */
const ADDED_COLUMNS = {
  users: ['display_name TEXT', 'avatar_url TEXT', 'bio TEXT', 'is_demo INTEGER NOT NULL DEFAULT 0'],
  // closed_at: yönetici onaylı kalıcı kapalı (haritada gösterilmez)
  places: ['toilet_type TEXT', 'public_access INTEGER', 'added_by INTEGER REFERENCES users(id) ON DELETE SET NULL', 'closed_at TEXT', 'photo_file TEXT'],
  // resolved_at: yönetici ihbarı onayladı/reddetti; canlı durum ve kuyruk dışında kalır (katkı sayısında kalır)
  status_reports: ['resolved_at TEXT'],
  votes: ['toilet_type TEXT'],
  // photo_file: server/data/photos altındaki dış mekan fotoğrafı (photo sütunu eski base64 içindir, göçte boşaltılır)
  pending_places: ['toilet_type TEXT', 'public_access INTEGER', 'photo_file TEXT'],
};

const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

/**
 * sql.js veritabanını açar (dosya yoksa oluşturur) ve her yazmadan sonra dosyaya kaydeder.
 * Seed dosyasındaki eksik mekanları ekler (bkz. seed eşitleme).
 */
export async function openDb(path, { seedFile } = {}) {
  const SQL = await initSqlJs();
  const db = existsSync(path) ? new SQL.Database(readFileSync(path)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  // Önceki sürümde status_reports CHECK kısıtı 'open' içermiyordu: tabloyu yeniden kur
  const reportsSql = db.exec("SELECT sql FROM sqlite_master WHERE name = 'status_reports'")[0]?.values[0][0];
  if (reportsSql && !reportsSql.includes("'open'")) {
    db.exec('ALTER TABLE status_reports RENAME TO status_reports_old');
    db.exec(SCHEMA);
    db.exec('INSERT INTO status_reports SELECT * FROM status_reports_old; DROP TABLE status_reports_old;');
  }
  db.exec(SCHEMA);
  for (const [table, cols] of Object.entries(ADDED_COLUMNS)) {
    const have = new Set(db.exec(`PRAGMA table_info(${table})`)[0].values.map((r) => r[1]));
    for (const col of cols) if (!have.has(col.split(' ')[0])) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`);
  }
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

  /** Mekanı siler; seed kaynaklıysa açılıştaki eşitlemenin geri getirmemesi için not edilir. */
  function deletePlace(id) {
    return tx(() => {
      if (all("SELECT 1 FROM places WHERE id = ? AND source = 'seed'", [id]).length) run('INSERT OR IGNORE INTO seed_removed (id) VALUES (?)', [id]);
      return run('DELETE FROM places WHERE id = ?', [id]).changes;
    });
  }

  const api = { all, get: (sql, params) => all(sql, params)[0], run, tx, save, deletePlace };

  // Seed eşitleme: veritabanında olmayan (ve yöneticinin silmediği) seed mekanlarını ekle.
  // Yeni kurulumda hepsi, mevcut kurulumda yalnızca seed dosyasına sonradan eklenenler girer.
  if (seedFile && existsSync(seedFile)) {
    const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
    const skip = new Set([...all('SELECT id FROM places'), ...all('SELECT id FROM seed_removed')].map((r) => r.id));
    const missing = seed.filter((p) => !skip.has(p.id));
    const now = new Date().toISOString();
    if (missing.length) {
      tx(() => {
        for (const p of missing) {
          run(
            `INSERT INTO places (id, name, category, district, address, lat, lng, hours, accessible, baby_changing, toilet_type, public_access, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
            [p.id, p.name, p.category, p.district, p.address, p.lat, p.lng, p.hours, !!p.accessible, !!p.babyChanging,
              p.toiletType ?? null, p.publicAccess ?? null, now, now],
          );
        }
      });
    }
  }

  return api;
}
