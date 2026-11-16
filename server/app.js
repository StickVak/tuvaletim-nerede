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
import { seedDemo } from './demo.js';
import { dirname, join } from 'node:path';

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
 * limits: false → hız sınırı yok (testler); nesne → DEFAULT_LIMITS üzerine yazar.
 * demo: true → yeni oluşturulan veritabanına örnek kullanıcılar eklenir.
 */
export async function createApp({ dbPath, secret, seedFile, adminUsername, adminPassword, limits = {}, demo = false }) {
  const db = await openDb(dbPath, { seedFile });
  ensureAdmin(db, adminUsername, adminPassword);
  const avatarDir = join(dirname(dbPath), 'avatars');
  if (demo && db.seeded) seedDemo(db, avatarDir);

  const pass = (_req, _res, next) => next();
  const L = limits === false ? null : { ...DEFAULT_LIMITS, ...limits };
  const authLimit = L ? rateLimit(L.auth, 'Çok fazla giriş denemesi. Lütfen birkaç dakika sonra tekrar deneyin.') : pass;
  const writeLimit = L ? rateLimit(L.write) : pass;

  const app = express();
  // Vite proxy (127.0.0.1) arkasında gerçek istemci IP'si X-Forwarded-For'dan okunur
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '6mb' }));
  app.use(optionalUser(db, secret));
  app.use('/api/auth', authRoutes(db, secret, authLimit));
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
