import { fileURLToPath } from 'node:url';
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

app.listen(PORT, () => console.log(`[api] http://localhost:${PORT}`));
