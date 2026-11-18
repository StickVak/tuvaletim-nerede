import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** .env.example'daki yer tutucu — herkese açık olduğu için asla imzalama anahtarı olarak kullanılmaz */
export const EXAMPLE_SECRET = 'buraya-uzun-rastgele-bir-deger-yazin';

/**
 * AUTH_SECRET gerçek bir değerse onu döner. Tanımsız ya da örnek değerse rastgele bir anahtar üretir,
 * dataDir/.auth-secret dosyasına kaydeder (git dışı) ve sonraki açılışlarda aynısını kullanır.
 */
export function resolveSecret(envSecret, dataDir) {
  const { value, generated } = resolveFileSecret(envSecret, EXAMPLE_SECRET, join(dataDir, '.auth-secret'));
  return { secret: value, generated };
}

/** .env.example'daki yönetici anahtarı yer tutucusu */
export const EXAMPLE_ADMIN_KEY = 'buraya-uzun-rastgele-bir-yonetici-anahtari-yazin';

/**
 * ADMIN_SECRET_KEY: tanımsız ya da örnek değerse rastgele üretilip dataDir/.admin-key'e kaydedilir.
 * Yerelde admin/ sunucusu aynı dosyayı okur; Render'da iki servise de aynı değer ortam değişkeniyle verilir.
 */
export function resolveAdminKey(envKey, dataDir) {
  const { value, generated } = resolveFileSecret(envKey, EXAMPLE_ADMIN_KEY, join(dataDir, '.admin-key'));
  return { key: value, generated };
}

function resolveFileSecret(envValue, example, file) {
  if (envValue && envValue !== example) return { value: envValue, generated: false };
  if (existsSync(file)) return { value: readFileSync(file, 'utf8').trim(), generated: false };
  const value = randomBytes(32).toString('base64url');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value, { mode: 0o600 });
  return { value, generated: true };
}
