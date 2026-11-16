import express from 'express';
import { openDb } from './db.js';
import { hashPassword, optionalUser, verifyPassword } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { placeRoutes } from './routes/places.js';
import { pendingRoutes } from './routes/pending.js';
import { adminRoutes } from './routes/admin.js';

/** .env'deki yönetici hesabını oluşturur ya da rolünü/şifresini eşitler. */
function ensureAdmin(db, username, password) {
  const existing = db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!existing) {
    db.run('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)', [username, hashPassword(password), 'admin', new Date().toISOString()]);
  } else if (existing.role !== 'admin' || !verifyPassword(password, existing.password_hash)) {
    db.run('UPDATE users SET role = ?, password_hash = ? WHERE id = ?', ['admin', hashPassword(password), existing.id]);
  }
}

export async function createApp({ dbPath, secret, seedFile, adminUsername, adminPassword }) {
  const db = await openDb(dbPath, { seedFile });
  ensureAdmin(db, adminUsername, adminPassword);

  const app = express();
  app.use(express.json({ limit: '6mb' }));
  app.use(optionalUser(db, secret));
  app.use('/api/auth', authRoutes(db, secret));
  app.use('/api/places', placeRoutes(db));
  app.use('/api/pending', pendingRoutes(db));
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
