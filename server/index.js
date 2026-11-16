import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

try {
  process.loadEnvFile();
} catch {
  /* .env yoksa varsayılanlar kullanılır */
}

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const secret = process.env.AUTH_SECRET || 'dev-secret-degistirin';
if (!process.env.AUTH_SECRET) console.warn('[api] AUTH_SECRET tanımlı değil; geliştirme anahtarı kullanılıyor (.env dosyasına ekleyin).');

const app = await createApp({
  dbPath: here('./data/tuvaletim.db'),
  seedFile: here('./seed-places.json'),
  secret,
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
});

app.listen(PORT, () => console.log(`[api] http://localhost:${PORT}`));
