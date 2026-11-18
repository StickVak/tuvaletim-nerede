import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { resolveSecret } from './secret.js';

try {
  process.loadEnvFile();
} catch {
  /* .env yoksa varsayılanlar kullanılır */
}

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const { secret, generated } = resolveSecret(process.env.AUTH_SECRET, here('./data'));
if (generated) console.warn('[api] AUTH_SECRET tanımlı değil (ya da örnek değer); rastgele bir anahtar üretilip server/data/.auth-secret dosyasına kaydedildi.');

const app = await createApp({
  dbPath: here('./data/tuvaletim.db'),
  seedFile: here('./seed-places.json'),
  secret,
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  // Yeni veritabanında örnek kullanıcı ve yorumlar (kapatmak için SEED_DEMO_DATA=false)
  demo: process.env.SEED_DEMO_DATA !== 'false',
});

// Render gibi bir ters vekil arkasında gerçek istemci IP'si (hız sınırı için), ör. TRUST_PROXY=1
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
}

// Üretim: `npm run build` çıktısını (dist/) aynı sunucudan yayınla.
// /api dışındaki her GET isteği index.html'e düşer (React yönlendirmesi, /admin vb.).
const distDir = here('../dist');
if (existsSync(distDir)) {
  const indexHtml = here('../dist/index.html');
  app.use('/assets', express.static(here('../dist/assets'), { immutable: true, maxAge: '1y' }));
  app.use('/assets', (_req, res) => res.sendStatus(404)); // eksik JS/CSS için HTML döndürme
  app.use(express.static(distDir));
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => res.sendFile(indexHtml));
  console.log('[web] dist/ klasörü sunuluyor');
}

app.listen(PORT, () => console.log(`[api] http://localhost:${PORT}`));
