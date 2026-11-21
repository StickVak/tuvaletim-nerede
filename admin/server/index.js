import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAdminServer } from './app.js';

try {
  process.loadEnvFile(); // depo kökündeki .env (npm komutları kökten çalışır)
} catch {
  /* .env yoksa ortam değişkenleri kullanılır */
}

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const EXAMPLE_ADMIN_KEY = 'buraya-uzun-rastgele-bir-yonetici-anahtari-yazin';
const LOCAL_KEY_FILE = here('../../server/data/.admin-key');

/** Ortam değişkeni; yoksa (yerel geliştirme) ana sunucunun ürettiği server/data/.admin-key */
function getKey() {
  const env = process.env.ADMIN_SECRET_KEY;
  if (env && env !== EXAMPLE_ADMIN_KEY) return env;
  return existsSync(LOCAL_KEY_FILE) ? readFileSync(LOCAL_KEY_FILE, 'utf8').trim() : '';
}

// Render kendi PORT'unu verir; yerelde .env'deki PORT ana sunucuya aittir → ADMIN_PORT (varsayılan 3002)
const PORT = Number(process.env.ADMIN_PORT || (process.env.RENDER ? process.env.PORT : '')) || 3002;
const mainApiUrl = (process.env.MAIN_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const production = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
const ipHeaderEnv = (process.env.CLIENT_IP_HEADER ?? '').trim().toLowerCase();
const clientIpHeader = ipHeaderEnv === 'none' ? null : ipHeaderEnv || (process.env.RENDER ? 'cf-connecting-ip' : null);
const app = createAdminServer({ getKey, mainApiUrl, distDir: here('../dist'), appUrl: process.env.MAIN_APP_URL || mainApiUrl, production, clientIpHeader });

if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
}

if (!getKey()) console.warn('[admin] ADMIN_SECRET_KEY tanımlı değil; ana sunucu ilk açılışta server/data/.admin-key üretir (yerel) ya da Render ortam değişkenini ayarlayın.');
app.listen(PORT, () => console.log(`[admin] http://localhost:${PORT}  →  API: ${mainApiUrl}`));
