import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** .env.example'daki yer tutucu — herkese açık olduğu için asla imzalama anahtarı olarak kullanılmaz */
export const EXAMPLE_SECRET = 'buraya-uzun-rastgele-bir-deger-yazin';

/**
 * AUTH_SECRET gerçek bir değerse onu döner. Tanımsız ya da örnek değerse rastgele bir anahtar üretir,
 * dataDir/.auth-secret dosyasına kaydeder (git dışı) ve sonraki açılışlarda aynısını kullanır.
 */
export function resolveSecret(envSecret, dataDir) {
  if (envSecret && envSecret !== EXAMPLE_SECRET) return { secret: envSecret, generated: false };
  const file = join(dataDir, '.auth-secret');
  if (existsSync(file)) return { secret: readFileSync(file, 'utf8').trim(), generated: false };
  const secret = randomBytes(48).toString('base64url');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, secret, { mode: 0o600 });
  return { secret, generated: true };
}
