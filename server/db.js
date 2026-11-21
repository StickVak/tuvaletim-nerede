import { createClient } from '@libsql/client';
import { resolveLocation } from './turkey.js';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import { emailKey, usernameKey } from './identity.js';

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
-- Şifre sıfırlama kodları: kullanıcı başına tek kayıt; kod HMAC olarak saklanır, 15 dk geçerli, en fazla 5 hatalı deneme,
-- başarılı kullanımda silinir (tek kullanımlık)
CREATE TABLE IF NOT EXISTS password_resets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL
);
-- Güvenilir cihazlar (kalıcı oturum): ham token yalnızca istemcinin HttpOnly çerezinde, burada HMAC özeti
CREATE TABLE IF NOT EXISTS trusted_devices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS trusted_devices_user ON trusted_devices(user_id);
-- Yöneticinin sildiği seed mekanları: açılıştaki seed eşitlemesi bunları yeniden eklemez
CREATE TABLE IF NOT EXISTS seed_removed (id TEXT PRIMARY KEY);
`;

/** Sonradan eklenen sütunlar: yeni ve eski veritabanları aynı göçten geçer */
const ADDED_COLUMNS = {
  // tokens_valid_after: "tüm cihazlardan çıkış" / şifre değişikliği anı; öncesinde verilmiş erişim belirteçleri geçersiz
  // username_key/email_key: Türkçe kurallarıyla küçültülmüş, kırpılmış benzersizlik anahtarları (UNIQUE indeksli)
  // google_id: Google hesabı (sub) · email_verified: e-posta sahipliği kanıtlandı (OTP ya da Google)
  // terms_accepted_at/terms_version: Hizmet Şartları + Gizlilik Politikası'nın kabul anı ve kabul edilen sürüm (LEGAL_VERSION)
  users: ['display_name TEXT', 'avatar_url TEXT', 'bio TEXT', 'is_demo INTEGER NOT NULL DEFAULT 0', 'tokens_valid_after TEXT',
    'username_key TEXT', 'email_key TEXT', 'google_id TEXT', 'email_verified INTEGER NOT NULL DEFAULT 0',
    'terms_accepted_at TEXT', 'terms_version TEXT'],
  // closed_at: yönetici onaylı kalıcı kapalı (haritada gösterilmez)
  // province: il (src/data/turkiye.json yazımıyla); district artık listedeki ilçe adı
  places: ['province TEXT', 'toilet_type TEXT', 'public_access INTEGER', 'added_by INTEGER REFERENCES users(id) ON DELETE SET NULL', 'closed_at TEXT', 'photo_file TEXT'],
  // resolved_at: yönetici ihbarı onayladı/reddetti; canlı durum ve kuyruk dışında kalır (katkı sayısında kalır)
  status_reports: ['resolved_at TEXT'],
  // persistent: 1 = "Bu cihazı hatırla" (90 gün, kalıcı çerez); 0 = yalnızca tarayıcı oturumu (1 gün, oturum çerezi)
  trusted_devices: ['persistent INTEGER NOT NULL DEFAULT 1'],
  // next_send_at: bu adrese yeni kod istenebilecek en erken zaman (başarılı gönderimde +60 sn, belirsiz teslimde +15 sn)
  email_codes: ['next_send_at TEXT'],
  votes: ['toilet_type TEXT'],
  // photo_file: dış mekan fotoğrafı — yerel dosya adı (server/data/photos) ya da Cloudinary secure_url
  // (photo sütunu eski base64 içindir, göçte boşaltılır)
  pending_places: ['province TEXT', 'toilet_type TEXT', 'public_access INTEGER', 'photo_file TEXT'],
};

const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const stmt = (sql, params = []) => ({ sql, args: params.map(norm) });
/** libSQL satırlarını düz nesnelere çevirir (sütun adı → değer) */
const plain = (rs) => rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, row[i]])));
const result = (rs) => ({ lastId: rs.lastInsertRowid === undefined ? null : Number(rs.lastInsertRowid), changes: rs.rowsAffected, rows: plain(rs) });

/**
 * Bağlantı ayarı: TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) verilmişse Turso bulut veritabanı,
 * yoksa yerel SQLite dosyası (file:server/data/tuvaletim.db).
 */
export function dbConfig(path, { url, authToken } = {}) {
  if (url) return { url, authToken: authToken || undefined, remote: !url.startsWith('file:') };
  // libSQL "file:" adresi: göreli yol her platformda (Windows dahil) güvenli
  const rel = relative(process.cwd(), path);
  const local = (isAbsolute(rel) ? path : rel).split(sep).join('/');
  return { url: `file:${local}`, remote: false };
}

/**
 * libSQL veritabanını açar: yerel dosya ya da Turso. Şemayı kurar/göç ettirir ve seed dosyasındaki eksik mekanları ekler.
 * API (hepsi async): all, get, run, batch (tek işlemde çoklu yazma), deletePlace, deleteUser, close.
 */
export async function openDb(path, { seedFile, url, authToken } = {}) {
  const config = dbConfig(path, { url, authToken });
  if (!config.remote) mkdirSync(dirname(path), { recursive: true });
  const client = createClient({ url: config.url, authToken: config.authToken });

  const all = async (sql, params) => plain(await client.execute(stmt(sql, params)));
  const get = async (sql, params) => (await all(sql, params))[0];
  const run = async (sql, params) => {
    const r = result(await client.execute(stmt(sql, params)));
    return { lastId: r.lastId, changes: r.changes };
  };
  /** [sql, params] listesini tek işlemde çalıştırır (Turso'da tek ağ isteği); hepsi ya olur ya hiç */
  const batch = async (statements) => (await client.batch(statements.map(([sql, params]) => stmt(sql, params)), 'write')).map(result);

  // Şema ve göçler
  if (config.remote === false) await client.execute('PRAGMA foreign_keys = ON');
  // Önceki sürümde status_reports CHECK kısıtı 'open' içermiyordu: tabloyu yeniden kur
  const reportsSql = (await get("SELECT sql FROM sqlite_master WHERE name = 'status_reports'"))?.sql;
  if (reportsSql && !reportsSql.includes("'open'")) {
    await client.execute('ALTER TABLE status_reports RENAME TO status_reports_old');
    await client.executeMultiple(SCHEMA);
    await client.executeMultiple('INSERT INTO status_reports SELECT * FROM status_reports_old; DROP TABLE status_reports_old;');
  }
  await client.executeMultiple(SCHEMA);
  const added = new Set();
  for (const [table, cols] of Object.entries(ADDED_COLUMNS)) {
    const have = new Set((await all(`PRAGMA table_info(${table})`)).map((r) => r.name));
    for (const col of cols) {
      if (have.has(col.split(' ')[0])) continue;
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col}`);
      added.add(`${table}.${col.split(' ')[0]}`);
    }
  }
  if (added.has('users.email_verified')) {
    // OTP zorunluluğu (2026-11-18 11:50 UTC) sonrası açılan hesapların e-postası doğrulanmıştır; öncekiler doğrulanmamış
    await client.execute("UPDATE users SET email_verified = 1 WHERE email IS NOT NULL AND created_at >= '2026-11-18T11:50:48Z'");
  }
  await migrateIdentityKeys();

  /**
   * İli boş olan eski kayıtlar: ilçe adından il bulunur (aynı ad birden çok ilde varsa kaydın konumuna en yakın il),
   * ilçe yazımı listedekine çevrilir ("cigli", "ÇİĞLİ " → "Çiğli"). Listede olmayan serbest metin olduğu gibi kalır.
   * Yalnızca ili boş satırlara dokunur; her açılışta güvenle çalışır.
   */
  async function migrateLocations() {
    for (const table of ['places', 'pending_places']) {
      const rows = await all(`SELECT id, district, lat, lng FROM ${table} WHERE province IS NULL AND district IS NOT NULL AND district != ''`);
      const stmts = [];
      for (const r of rows) {
        const loc = resolveLocation({ district: r.district, near: r });
        if (typeof loc !== 'string') stmts.push([`UPDATE ${table} SET province = ?, district = ? WHERE id = ?`, [loc.province, loc.district, r.id]]);
      }
      if (stmts.length) await batch(stmts);
    }
  }

  /**
   * Eski kayıtların benzersizlik anahtarlarını doldurur, sonra UNIQUE indeksleri kurar. Eski sürümde ASCII NOCASE'in
   * kaçırdığı çakışmalar (ör. "Çağrı" / "çağrı") sunucuyu düşürmesin diye sonraki kayda ayırt edici ek verilir.
   */
  async function migrateIdentityKeys() {
    const rows = await all('SELECT id, username, email, username_key, email_key FROM users ORDER BY id');
    const takenU = new Set(rows.map((r) => r.username_key).filter(Boolean));
    const takenE = new Set(rows.map((r) => r.email_key).filter(Boolean));
    const updates = [];
    for (const r of rows) {
      let uk = r.username_key;
      let ek = r.email_key;
      if (!uk) {
        uk = usernameKey(r.username);
        if (takenU.has(uk)) {
          console.warn(`[db] kullanıcı adı çakışması (eski kayıt) id=${r.id}: ayırt edici anahtar verildi`);
          uk = `${uk}#${r.id}`;
        }
        takenU.add(uk);
      }
      if (!ek && r.email) {
        ek = emailKey(r.email);
        if (takenE.has(ek)) {
          console.warn(`[db] e-posta çakışması (eski kayıt) id=${r.id}: ayırt edici anahtar verildi`);
          ek = `${ek}#${r.id}`;
        }
        takenE.add(ek);
      }
      if (uk !== r.username_key || ek !== r.email_key) updates.push(['UPDATE users SET username_key = ?, email_key = ? WHERE id = ?', [uk, ek, r.id]]);
    }
    if (updates.length) await batch(updates);
    await client.executeMultiple(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users(username_key);
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users(email_key);
      CREATE UNIQUE INDEX IF NOT EXISTS users_google_id ON users(google_id);
    `);
  }

  /**
   * Mekanı ve ona bağlı oy/favori/bildirimleri siler (Turso'da yabancı anahtar zinciri bağlantıya özel olduğundan açıkça).
   * Seed kaynaklıysa açılıştaki eşitlemenin geri getirmemesi için not edilir. Silinen satır sayısını döner.
   */
  async function deletePlace(id) {
    const r = await batch([
      ["INSERT OR IGNORE INTO seed_removed (id) SELECT id FROM places WHERE id = ? AND source = 'seed'", [id]],
      ['DELETE FROM votes WHERE place_id = ?', [id]],
      ['DELETE FROM favorites WHERE place_id = ?', [id]],
      ['DELETE FROM status_reports WHERE place_id = ?', [id]],
      ['DELETE FROM places WHERE id = ?', [id]],
    ]);
    return r.at(-1).changes;
  }

  /** Kullanıcıyı ve oy/favori/bildirimlerini siler; eklediği mekanlar ve başvurular sahipsiz kalır. */
  async function deleteUser(id, { role = 'user' } = {}) {
    const r = await batch([
      ['DELETE FROM votes WHERE user_id = ? AND user_id IN (SELECT id FROM users WHERE role = ?)', [id, role]],
      ['DELETE FROM favorites WHERE user_id = ? AND user_id IN (SELECT id FROM users WHERE role = ?)', [id, role]],
      ['DELETE FROM status_reports WHERE user_id = ? AND user_id IN (SELECT id FROM users WHERE role = ?)', [id, role]],
      ['DELETE FROM trusted_devices WHERE user_id = ? AND user_id IN (SELECT id FROM users WHERE role = ?)', [id, role]],
      ['DELETE FROM password_resets WHERE user_id = ? AND user_id IN (SELECT id FROM users WHERE role = ?)', [id, role]],
      ['UPDATE places SET added_by = NULL WHERE added_by = ? AND added_by IN (SELECT id FROM users WHERE role = ?)', [id, role]],
      ['UPDATE pending_places SET user_id = NULL WHERE user_id = ? AND user_id IN (SELECT id FROM users WHERE role = ?)', [id, role]],
      ['DELETE FROM users WHERE id = ? AND role = ?', [id, role]],
    ]);
    return r.at(-1).changes;
  }

  const api = { all, get, run, batch, deletePlace, deleteUser, close: () => client.close(), remote: config.remote, url: config.url };

  // Seed eşitleme: veritabanında olmayan (ve yöneticinin silmediği) seed mekanlarını ekle.
  // Yeni kurulumda hepsi, mevcut kurulumda yalnızca seed dosyasına sonradan eklenenler girer.
  if (seedFile && existsSync(seedFile)) {
    const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
    const skip = new Set([...(await all('SELECT id FROM places')), ...(await all('SELECT id FROM seed_removed'))].map((r) => r.id));
    const missing = seed.filter((p) => !skip.has(p.id));
    const now = new Date().toISOString();
    if (missing.length) {
      await batch(
        missing.map((p) => [
          `INSERT INTO places (id, name, category, province, district, address, lat, lng, hours, accessible, baby_changing, toilet_type, public_access, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
          [p.id, p.name, p.category, p.province ?? null, p.district, p.address, p.lat, p.lng, p.hours, !!p.accessible, !!p.babyChanging,
            p.toiletType ?? null, p.publicAccess ?? null, now, now],
        ]),
      );
    }
  }
  // Seed eşitlemesinden SONRA: hem eski kayıtlar hem ili belirtilmemiş seed kayıtları il kazanır
  await migrateLocations();

  return api;
}
