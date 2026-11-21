/**
 * Şifre sıfırlama / belirleme kodları (password_resets): hem "Şifremi unuttum" (oturumsuz) hem profildeki
 * "kodla şifre değiştir/belirle" (oturumlu) akışı kullanır.
 * Kod: crypto.randomInt ile 6 hane, veritabanında HMAC-SHA256 özeti, 15 dk geçerli, en fazla 5 hatalı deneme,
 * tek kullanımlık (koşullu silme). Aynı kullanıcıya 60 sn dolmadan yeni kod üretilmez.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const RESET_TTL_MS = 15 * 60 * 1000;
export const RESET_RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export function createResetCodes(db, secret) {
  const hash = (userId, code) => createHmac('sha256', secret).update(`password-reset:${userId}:${code}`).digest('hex');
  const drop = (userId) => db.run('DELETE FROM password_resets WHERE user_id = ?', [userId]);

  return {
    /** Yeni kod → { code }; son koddan bu yana 60 sn dolmadıysa { wait: saniye } (kod üretilmez) */
    async issue(userId) {
      const prev = await db.get('SELECT sent_at FROM password_resets WHERE user_id = ?', [userId]);
      const wait = prev ? Date.parse(prev.sent_at) + RESET_RESEND_MS - Date.now() : 0;
      if (wait > 0) return { wait: Math.ceil(wait / 1000) };
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const now = Date.now();
      await db.run(
        `INSERT INTO password_resets (user_id, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
         ON CONFLICT (user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`,
        [userId, hash(userId, code), new Date(now + RESET_TTL_MS).toISOString(), new Date(now).toISOString()],
      );
      return { code };
    },

    /** Gönderilemeyen kodu geçersiz kılar (kullanıcı hemen yeniden isteyebilsin) */
    discard: drop,

    /**
     * Kod doğru ve süresi geçerliyse TÜKETİR → true. Hatalıysa deneme sayılır (5. hatada kod silinir), süresi
     * dolmuşsa silinir → false. Koşullu silme sayesinde aynı kodla eşzamanlı iki istekten yalnızca biri true alır.
     */
    async consume(userId, code) {
      const row = await db.get('SELECT * FROM password_resets WHERE user_id = ?', [userId]);
      if (!row) return false;
      if (!(Date.parse(row.expires_at) > Date.now())) {
        await drop(userId);
        return false;
      }
      const h = hash(userId, code);
      if (!timingSafeEqual(Buffer.from(h), Buffer.from(row.code_hash))) {
        if (row.attempts + 1 >= MAX_ATTEMPTS) await drop(userId);
        else await db.run('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?', [userId]);
        return false;
      }
      const { changes } = await db.run('DELETE FROM password_resets WHERE user_id = ? AND code_hash = ?', [userId, h]);
      return changes === 1;
    },
  };
}
