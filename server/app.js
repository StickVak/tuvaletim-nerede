import express from 'express';
import { openDb } from './db.js';
import { MIN_ADMIN_KEY_LENGTH, optionalUser, requireAdminKey } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { placeRoutes } from './routes/places.js';
import { pendingRoutes } from './routes/pending.js';
import { adminRoutes } from './routes/admin.js';
import { favoriteRoutes } from './routes/places.js';
import { avatarRoutes, profileRoutes, userRoutes } from './routes/profile.js';
import { DEFAULT_LIMITS, chain, clientIp, ipKey, rateLimit, userKey } from './ratelimit.js';
import { errorHandler, requireObjectBody, securityHeaders } from './security.js';
import { createMailer } from './mailer.js';
import { createPhotoStore, migrateInlinePhotos } from './photos.js';
import { createDeviceStore } from './devices.js';
import { legalRoutes } from './legal.js';
import { usernameKey } from './identity.js';
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
 * contactEmail: Gizlilik Politikası / Hizmet Şartları sayfalarındaki iletişim adresi (legalContact()).
 * clientIpHeader: gerçek istemci IP'sini taşıyan güvenilir başlık (Render/Cloudflare: "cf-connecting-ip"); yoksa req.ip.
 * secureCookies: çerezler her zaman Secure (üretim/HTTPS). production: HSTS + upgrade-insecure-requests.
 * scriptHashes: index.html satır içi betiklerinin CSP hash'leri (inlineScriptHashes()).
 * limits: false → hız sınırı yok (testler); nesne → DEFAULT_LIMITS üzerine yazar.
 */
export async function createApp({
  dbPath, dbUrl, dbAuthToken, dataDir = dirname(dbPath), cloudinary = null, google = null,
  secret, seedFile, adminKey = '', limits = {}, mailer = createMailer(), contactEmail = null,
  clientIpHeader = null, secureCookies = false, production = false, scriptHashes = [],
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
  const limit = (name, message, opts = {}) => (L ? rateLimit(L[name], { name, message, ...opts }) : pass);
  const failed = (s) => s >= 400 && s !== 429;
  const bodyEmail = (req) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) || null : null);
  // Giriş adı (kullanıcı adı ya da e-posta) → hesap anahtarı; büyük/küçük harf ve Türkçe I farkı aynı hesaba sayılır
  const loginKey = (req) => (typeof req.body?.username === 'string' && req.body.username.trim() ? usernameKey(req.body.username).slice(0, 254) : null);

  const limits_ = {
    login: chain(
      limit('login', 'Çok fazla hatalı giriş denemesi.', { countIf: failed }),
      limit('loginAccount', 'Bu hesap için çok fazla hatalı giriş denemesi yapıldı.', { key: loginKey, countIf: (s) => s === 401 }),
    ),
    register: chain(
      limit('register', 'Çok fazla kayıt denemesi.'),
      limit('verifyEmail', 'Bu e-posta için çok fazla hatalı kod denemesi yapıldı.', { key: bodyEmail, countIf: (s) => s === 400 }),
    ),
    sendCode: chain(
      limit('sendCode', 'Çok fazla doğrulama kodu istendi.'),
      // Yalnızca gerçekten gönderilen (ya da gönderimi denenen) kodlar sayılır; biçim hataları sayılmaz
      limit('sendCodeEmail', 'Bu e-posta adresine çok fazla kod gönderildi.', { key: bodyEmail, countIf: (s) => s === 200 || s === 202 || s === 503 }),
    ),
    session: limit('session', 'Çok fazla oturum isteği.'),
    oauth: limit('oauth', 'Çok fazla Google ile giriş denemesi.'),
  };
  const writeLimit = chain(limit('write', 'Çok fazla işlem yapıldı.'), limit('writeUser', 'Çok fazla işlem yapıldı.', { key: userKey }));
  const uploadLimit = limit('upload', 'Çok fazla fotoğraf yüklendi.', { key: (req) => userKey(req) ?? ipKey(req) });
  const adminAuthLimit = limit('adminAuth', 'Çok fazla hatalı yönetici anahtarı denemesi.', { countIf: (s) => s === 401 });
  // Kaba DoS tamponu; fotoğraf/avatar GET'leri (liste kaydırırken çok sayıda) hariç
  const apiLimit = limit('api', 'Çok fazla istek gönderildi.', { key: (req) => (req.method === 'GET' && /\/photo$|^\/avatars\//.test(req.path) ? null : ipKey(req)) });

  const app = express();
  app.disable('x-powered-by');
  app.locals.db = db;
  app.locals.photos = photos;
  app.locals.secureCookies = secureCookies;
  // Vite proxy (127.0.0.1) arkasında gerçek istemci IP'si X-Forwarded-For'dan okunur (üretimde TRUST_PROXY ile değişir)
  app.set('trust proxy', 'loopback');
  app.use(clientIp({ header: clientIpHeader }));
  app.use(securityHeaders({ scriptHashes, production }));
  app.use(legalRoutes({ contactEmail })); // /gizlilik-politikasi, /hizmet-sartlari (herkese açık düz HTML)
  app.use('/api', apiLimit);
  // Gövde sınırı: fotoğraf taşıyan uçlar dışında 100 KB (büyük gövdeyle bellek/CPU tüketimi engellenir)
  app.use(['/api/pending', '/api/admin'], express.json({ limit: '7mb' }));
  app.use('/api/profile/avatar', express.json({ limit: '3mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(requireObjectBody);
  app.use(optionalUser(db, secret));
  app.use('/api/auth', authRoutes(db, secret, { limits: limits_, writeLimit, mailer, google }));
  app.use('/api/places', placeRoutes(db, writeLimit, photos));
  app.use('/api/favorites', favoriteRoutes(db, writeLimit));
  app.use('/api/pending', pendingRoutes(db, chain(writeLimit, uploadLimit), photos));
  app.use('/api/profile', profileRoutes(db, { avatars, writeLimit, uploadLimit }));
  app.use('/api/users', userRoutes(db));
  app.use('/api/avatars', avatarRoutes(avatarDir));
  app.use('/api/admin', adminAuthLimit, requireAdminKey(adminKey), adminRoutes(db, { photos, avatars }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  /** İsteği yapanın sunucunun gördüğü IP'si (hız sınırı anahtarı) — vekil/trust proxy ayarını doğrulamak için */
  app.get('/api/health/ip', (req, res) => res.set('Cache-Control', 'no-store').json({ ip: req.clientIp }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Bulunamadı.' }));
  app.use(errorHandler);
  return app;
}
