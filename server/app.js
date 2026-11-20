import express from 'express';
import { openDb } from './db.js';
import { MIN_ADMIN_KEY_LENGTH, optionalUser, requireAdminKey } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { placeRoutes } from './routes/places.js';
import { pendingRoutes } from './routes/pending.js';
import { adminRoutes } from './routes/admin.js';
import { favoriteRoutes } from './routes/places.js';
import { avatarRoutes, profileRoutes, userRoutes } from './routes/profile.js';
import { DEFAULT_LIMITS, rateLimit } from './ratelimit.js';
import { createMailer } from './mailer.js';
import { createPhotoStore, migrateInlinePhotos } from './photos.js';
import { createDeviceStore } from './devices.js';
import { dirname, join } from 'node:path';

/**
 * Önceki sürümlerin eklediği örnek (demo) kullanıcıları, oylarını ve avatarlarını siler.
 * avatars: createPhotoStore(). Silinen kullanıcı sayısını döner.
 */
export async function removeDemoData(db, avatars) {
  const demos = await db.all('SELECT id, avatar_url FROM users WHERE is_demo = 1');
  for (const u of demos) {
    await db.deleteUser(u.id);
    if (u.avatar_url) await avatars.remove(u.avatar_url.startsWith('/api/avatars/') ? u.avatar_url.split('/').pop() : u.avatar_url);
  }
  return demos.length;
}

/**
 * dbPath: yerel SQLite dosyası (dbUrl verilmezse). dbUrl/dbAuthToken: Turso (libsql://…).
 * cloudinary: cloudinaryConfig() sonucu; null ise fotoğraflar server/data altında yerel diske yazılır.
 * dataDir: yerel fotoğraf/avatar klasörlerinin kökü (varsayılan: dbPath'in klasörü).
 * adminKey: ADMIN_SECRET_KEY (yönetim API'si yalnızca bu anahtarla açılır; boşsa API kapalı).
 * limits: false → hız sınırı yok (testler); nesne → DEFAULT_LIMITS üzerine yazar.
 */
export async function createApp({
  dbPath, dbUrl, dbAuthToken, dataDir = dirname(dbPath), cloudinary = null, google = null,
  secret, seedFile, adminKey = '', limits = {}, mailer = createMailer(),
}) {
  if (adminKey && adminKey.length < MIN_ADMIN_KEY_LENGTH) {
    throw new Error(`ADMIN_SECRET_KEY en az ${MIN_ADMIN_KEY_LENGTH} karakter olmalı.`);
  }
  const db = await openDb(dbPath, { seedFile, url: dbUrl, authToken: dbAuthToken });
  // Eski sürümlerde yönetici bir kullanıcı hesabıydı (admin/admin123); artık yetkisi yok, hesabı kaldır
  for (const { id } of await db.all("SELECT id FROM users WHERE role = 'admin'")) await db.deleteUser(id, { role: 'admin' });
  const avatarDir = join(dataDir, 'avatars');
  const photos = createPhotoStore({ dir: join(dataDir, 'photos'), folder: 'tuvaletim/places', cloudinary });
  const avatars = createPhotoStore({ dir: avatarDir, folder: 'tuvaletim/avatars', cloudinary, maxBytes: 2 * 1024 * 1024 });
  await migrateInlinePhotos(db, photos);
  await removeDemoData(db, avatars);
  await createDeviceStore(db, secret).prune(); // süresi çoktan dolmuş / iptal edilmiş güvenilir cihaz kayıtları

  const pass = (_req, _res, next) => next();
  const L = limits === false ? null : { ...DEFAULT_LIMITS, ...limits };
  const loginLimit = L ? rateLimit(L.login, 'Çok fazla hatalı giriş denemesi. Lütfen birkaç dakika sonra tekrar deneyin.', (s) => s >= 400) : pass;
  const registerLimit = L ? rateLimit(L.register, 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.') : pass;
  const writeLimit = L ? rateLimit(L.write) : pass;
  const sendCodeLimit = L ? rateLimit(L.sendCode, 'Çok fazla doğrulama kodu istendi. Lütfen daha sonra tekrar deneyin.') : pass;
  const adminAuthLimit = L ? rateLimit(L.adminAuth, 'Çok fazla hatalı yönetici anahtarı denemesi.', (s) => s === 401) : pass;

  const app = express();
  app.locals.db = db;
  app.locals.photos = photos;
  // Vite proxy (127.0.0.1) arkasında gerçek istemci IP'si X-Forwarded-For'dan okunur
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '6mb' }));
  app.use(optionalUser(db, secret));
  app.use('/api/auth', authRoutes(db, secret, { loginLimit, registerLimit, sendCodeLimit, mailer, google }));
  app.use('/api/places', placeRoutes(db, writeLimit, photos));
  app.use('/api/favorites', favoriteRoutes(db, writeLimit));
  app.use('/api/pending', pendingRoutes(db, writeLimit, photos));
  app.use('/api/profile', profileRoutes(db, { avatars, writeLimit }));
  app.use('/api/users', userRoutes(db));
  app.use('/api/avatars', avatarRoutes(avatarDir));
  app.use('/api/admin', adminAuthLimit, requireAdminKey(adminKey), adminRoutes(db, { photos, avatars }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
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
