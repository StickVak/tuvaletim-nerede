/**
 * Mevcut bir veritabanına örnek kullanıcıları ve yorumları ekler (yeni kurulumda otomatik eklenir).
 *   npm run seed:demo        (sunucu durdurulmuşken çalıştırın)
 */
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { seedDemo } from '../server/demo.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const db = await openDb(here('../server/data/tuvaletim.db'), { seedFile: here('../server/seed-places.json') });
console.log(seedDemo(db, here('../server/data/avatars')) ? 'Örnek kullanıcılar ve yorumlar eklendi.' : 'Örnek kullanıcılar zaten var; değişiklik yapılmadı.');
