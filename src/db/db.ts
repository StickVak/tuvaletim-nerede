import Dexie, { type Table, type Transaction } from 'dexie';
import type { AdminUser, FeeType, PendingSubmission, Place, Review } from '../types';
import { buildSeedPlaces } from './seed';
import { randomId, sha256 } from '../lib/sha256';

export const DEFAULT_ADMIN_USERNAME = (import.meta.env.VITE_ADMIN_USERNAME as string | undefined)?.trim() || 'admin';
export const DEFAULT_ADMIN_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || 'admin123';
export const ADMIN_FROM_ENV = Boolean(import.meta.env.VITE_ADMIN_PASSWORD);

export function hashPassword(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

export function makeAdminUser(username: string, password: string): AdminUser {
  const salt = randomId(12);
  return { username, salt, passwordHash: hashPassword(password, salt), role: 'admin', createdAt: new Date().toISOString() };
}

export class TuvaletimDB extends Dexie {
  places!: Table<Place, string>;
  reviews!: Table<Review, number>;
  pending_submissions!: Table<PendingSubmission, string>;
  admin_users!: Table<AdminUser, number>;

  constructor() {
    super('tuvaletim-nerede');
    this.version(1).stores({
      places: 'id, name, category, city, fee, source, createdAt',
      reviews: '++id, placeId, voterId, createdAt, [placeId+voterId]',
      pending_submissions: 'id, submittedAt',
      admin_users: '++id, &username',
    });
    // Veritabanı İLK oluşturulduğunda otomatik çalışır (soğuk başlangıç)
    this.on('populate', (tx: Transaction) => {
      tx.table('places').bulkAdd(buildSeedPlaces());
      tx.table('admin_users').add(makeAdminUser(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD));
      migrateLegacyLocalStorage(tx);
    });
  }
}

export const db = new TuvaletimDB();

/** v1 (localStorage) sürümünde kullanıcıların eklediği kayıtları yeni veritabanına taşır. */
function migrateLegacyLocalStorage(tx: Transaction) {
  try {
    type Legacy = {
      id: string; name: string; category: Place['category']; lat: number; lng: number; photo?: string;
      cleanliness: number; comfort: number; isFree: boolean; price?: string; hours?: string;
      accessible?: boolean; babyChanging?: boolean; address?: string; createdAt: string;
    };
    const read = (k: string): Legacy[] => JSON.parse(localStorage.getItem(k) || '[]');
    const fee = (t: Legacy): FeeType => (t.isFree ? 'free' : /müşteri/i.test(t.price ?? '') ? 'customers' : 'paid');
    const approved = read('tn.toilets.approved');
    const pending = read('tn.toilets.pending');
    const now = new Date().toISOString();
    for (const t of approved) {
      tx.table('places').add({
        id: t.id, name: t.name, category: t.category, lat: t.lat, lng: t.lng, photo: t.photo, address: t.address,
        fee: fee(t), price: t.isFree ? undefined : t.price, hours: t.hours, accessible: t.accessible, babyChanging: t.babyChanging,
        cleanlinessTotal: t.cleanliness, comfortTotal: t.comfort, ratingCount: 1, source: 'user', createdAt: t.createdAt, updatedAt: now,
      } satisfies Place);
    }
    for (const t of pending) {
      tx.table('pending_submissions').add({
        id: t.id, name: t.name, category: t.category, lat: t.lat, lng: t.lng, photo: t.photo, address: t.address,
        fee: fee(t), price: t.isFree ? undefined : t.price, hours: t.hours, accessible: t.accessible, babyChanging: t.babyChanging,
        cleanliness: t.cleanliness, comfort: t.comfort, voterId: 'legacy', submittedAt: t.createdAt,
      } satisfies PendingSubmission);
    }
    localStorage.removeItem('tn.toilets.approved');
    localStorage.removeItem('tn.toilets.pending');
  } catch {
    /* eski veri yoksa / bozuksa yok say */
  }
}

/** .env'de yönetici şifresi tanımlandıysa veritabanındaki kaydı onunla eşitler. */
export async function syncEnvAdmin() {
  if (!ADMIN_FROM_ENV) return;
  const existing = await db.admin_users.where('username').equals(DEFAULT_ADMIN_USERNAME).first();
  if (!existing) {
    await db.admin_users.add(makeAdminUser(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD));
  } else if (existing.passwordHash !== hashPassword(DEFAULT_ADMIN_PASSWORD, existing.salt)) {
    const fresh = makeAdminUser(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
    await db.admin_users.update(existing.id!, { salt: fresh.salt, passwordHash: fresh.passwordHash });
  }
}
