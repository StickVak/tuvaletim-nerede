/**
 * Kullanıcı kimliği benzersizliği: kullanıcı adı ve e-posta büyük/küçük harf duyarsız ve kırpılmış olarak tekildir.
 * SQLite'ın COLLATE NOCASE'i yalnızca ASCII harfleri eşitler ("Çağrı" ≠ "çağrı"); bu yüzden Türkçe kurallarıyla
 * küçültülmüş anahtarlar (users.username_key / users.email_key) UNIQUE indeksle korunur.
 */
import { randomBytes, randomInt } from 'node:crypto';

export const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,30}$/u;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_TAKEN = 'Bu e-posta adresiyle zaten bir hesap mevcut. Lütfen giriş yapın.';
export const USERNAME_TAKEN = 'Bu kullanıcı adı daha önce alınmış. Lütfen farklı bir kullanıcı adı seçin.';
export const USERNAME_INVALID = 'Kullanıcı adı 3-30 karakter olmalı; harf, rakam, _ . - kullanılabilir.';

/**
 * "  ÇAĞRI " → "çağri". I/İ/ı/i tek harf sayılır: büyük harfle (ASCII "I" ya da Türkçe "İ") yazan kullanıcı aynı hesaba
 * ulaşır ve "ali" / "alı" gibi birbirine benzeyen (taklit amaçlı) adlar ayrı hesap açamaz.
 */
export const usernameKey = (u) => String(u ?? '').normalize('NFKC').trim().replace(/[İIı]/g, 'i').toLowerCase();
/** "  Ali@Example.COM " → "ali@example.com"; boşsa null */
export const emailKey = (e) => String(e ?? '').trim().toLowerCase() || null;

export const conflict = (field) => ({ status: 409, field, error: field === 'email' ? EMAIL_TAKEN : USERNAME_TAKEN });

/** Yazmadan önce kontrol: { status, field, error } ya da null. exceptUserId: kendi kaydı (profil güncelleme) */
export async function identityConflict(db, { username, email, exceptUserId = -1 }) {
  if (email !== undefined && email !== null) {
    if (await db.get('SELECT 1 FROM users WHERE email_key = ? AND id != ?', [emailKey(email), exceptUserId])) return conflict('email');
  }
  if (username !== undefined && username !== null) {
    if (await db.get('SELECT 1 FROM users WHERE username_key = ? AND id != ?', [usernameKey(username), exceptUserId])) return conflict('username');
  }
  return null;
}

/** Yarış durumunda UNIQUE indeks hatası → aynı 409 yanıtı (yoksa null) */
export function conflictFromDbError(err) {
  const m = String(err?.message ?? '');
  if (!/UNIQUE constraint failed/i.test(m)) return null;
  if (/users\.(email_key|email)\b/.test(m)) return conflict('email');
  if (/users\.(username_key|username)\b/.test(m)) return conflict('username');
  return null;
}

/** Kullanıcı adı adayı: Türkçe harfler korunur ("Yılmaz" → "yılmaz"); çakışma denetimi ayrıca anahtarla yapılır */
const clean = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, '.')
    .replace(/[^\p{L}\p{N}_.-]/gu, '')
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');

/** Google adından (yoksa e-postanın yerel kısmından) kullanıcı adı tabanı: "Ayşe Yılmaz" → "ayşe.yılmaz" */
export function usernameBase(name, email) {
  for (const candidate of [name, String(email ?? '').split('@')[0]]) {
    const c = clean(candidate).slice(0, 24).replace(/[._-]+$/, '');
    if (c.length >= 3) return c;
  }
  return 'kullanici';
}

/** Çakışmayan kullanıcı adı: taban, alınmışsa sonuna rastgele rakam (gerekirse onaltılık ek) */
export async function uniqueUsername(db, base) {
  const free = async (u) => USERNAME_RE.test(u) && !(await db.get('SELECT 1 FROM users WHERE username_key = ?', [usernameKey(u)]));
  if (await free(base)) return base;
  for (let i = 0; i < 12; i++) {
    const digits = i < 4 ? 2 : i < 8 ? 3 : 4;
    const u = `${base.slice(0, 30 - digits - 1)}.${randomInt(10 ** (digits - 1), 10 ** digits)}`;
    if (await free(u)) return u;
  }
  return `${base.slice(0, 21)}.${randomBytes(4).toString('hex')}`;
}
