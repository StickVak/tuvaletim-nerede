import express from 'express';
import { openDb } from './db.js';
import { hashPassword, optionalUser, verifyPassword } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { placeRoutes } from './routes/places.js';
import { pendingRoutes } from './routes/pending.js';
import { adminRoutes } from './routes/admin.js';
import { favoriteRoutes } from './routes/places.js';
import { avatarRoutes, profileRoutes, userRoutes } from './routes/profile.js';
import { DEFAULT_LIMITS, rateLimit } from './ratelimit.js';
import { existsSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** .env'deki yönetici hesabını oluşturur ya da rolünü/şifresini eşitler. */
function ensureAdmin(db, username, password) {
  const existing = db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!existing) {
    db.run('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)', [username, hashPassword(password), 'admin', new Date().toISOString()]);
  } else if (existing.role !== 'admin' || !verifyPassword(password, existing.password_hash)) {
    db.run('UPDATE users SET role = ?, password_hash = ? WHERE id = ?', ['admin', hashPassword(password), existing.id]);
  }
}

/**
 * Önceki sürümlerin eklediği örnek (demo) kullanıcıları, oylarını (CASCADE) ve avatarlarını siler.
 * Silinen kullanıcı sayısını döner.
 */
export function removeDemoData(db, avatarDir) {
  const demos = db.all('SELECT id, avatar_url FROM users WHERE is_demo = 1');
  if (!demos.length) return 0;
  db.tx(() => {
    for (const u of demos) db.run('DELETE FROM users WHERE id = ?', [u.id]);
  });
  for (const u of demos) {
    const file = u.avatar_url && join(avatarDir, basename(u.avatar_url));
    if (file && existsSync(file)) rmSync(file);
  }
  return demos.length;
}

/** limits: false → hız sınırı yok (testler); nesne → DEFAULT_LIMITS üzerine yazar. */
export async function createApp({ dbPath, secret, seedFile, adminUsername, adminPassword, limits = {} }) {
  const db = await openDb(dbPath, { seedFile });
  ensureAdmin(db, adminUsername, adminPassword);
  const avatarDir = join(dirname(dbPath), 'avatars');
  removeDemoData(db, avatarDir);

  const pass = (_req, _res, next) => next();
  const L = limits === false ? null : { ...DEFAULT_LIMITS, ...limits };
  const loginLimit = L ? rateLimit(L.login, 'Çok fazla hatalı giriş denemesi. Lütfen birkaç dakika sonra tekrar deneyin.', (s) => s >= 400) : pass;
  const registerLimit = L ? rateLimit(L.register, 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.') : pass;
  const writeLimit = L ? rateLimit(L.write) : pass;

  const app = express();
  // Vite proxy (127.0.0.1) arkasında gerçek istemci IP'si X-Forwarded-For'dan okunur
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '6mb' }));
  app.use(optionalUser(db, secret));
  app.use('/api/auth', authRoutes(db, secret, { loginLimit, registerLimit }));
  app.use('/api/places', placeRoutes(db, writeLimit));
  app.use('/api/favorites', favoriteRoutes(db, writeLimit));
  app.use('/api/pending', pendingRoutes(db, writeLimit));
  app.use('/api/profile', profileRoutes(db, { avatarDir, writeLimit }));
  app.use('/api/users', userRoutes(db));
  app.use('/api/avatars', avatarRoutes(avatarDir));
  app.use('/api/admin', adminRoutes(db));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Bulunamadı.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Gönderilen veri çok büyük.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz istek.' });
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  });
  return app;
}
