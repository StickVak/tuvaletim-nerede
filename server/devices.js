/**
 * Güvenilir cihazlar (kalıcı oturum).
 *
 * Başarılı OTP'li kayıt ya da şifreli girişten sonra cihaza 256 bit rastgele bir token verilir. Ham token yalnızca
 * HttpOnly çerezde (tn_device, Path=/api/auth) durur; veritabanında sunucu sırrıyla HMAC özeti tutulur.
 * Erişim belirteci (localStorage) süresi dolunca ya da uygulama yeniden açılınca istemci /api/auth/refresh ile
 * bu çerezi kullanarak sessizce yeni belirteç alır. İptal edilmiş, süresi dolmuş ya da bilinmeyen token → standart giriş.
 */
import { createHmac, randomBytes } from 'node:crypto';

export const DEVICE_COOKIE = 'tn_device';
/** Kayan süre: her kullanımda bu kadar uzar */
export const DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/**
 * "Bu cihazı hatırla" kapalıyken de oturum sunucuda kayıtlıdır (çıkışta iptal edilebilsin) ama çerez tarayıcı
 * kapanınca silinir (Max-Age yok) ve kayıt 1 gün kullanılmazsa düşer.
 */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ttl = (persistent) => (persistent ? DEVICE_TTL_MS : SESSION_TTL_MS);
/** Token biçimi: 32 bayt base64url (bozuk/uzun çerez veritabanına hiç gitmez) */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_PATH = '/api/auth';

/** "Chrome · Android", "Safari · iPhone" gibi okunabilir cihaz adı */
export function deviceLabel(ua = '') {
  const s = String(ua);
  const browser = /Edg(e|A|iOS)?\//.test(s)
    ? 'Edge'
    : /SamsungBrowser\//.test(s)
      ? 'Samsung Internet'
      : /OPR\/|Opera/.test(s)
        ? 'Opera'
        : /Firefox\/|FxiOS\//.test(s)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(s)
            ? 'Chrome'
            : /Safari\//.test(s)
              ? 'Safari'
              : 'Tarayıcı';
  const os = /Android/.test(s)
    ? 'Android'
    : /iPhone/.test(s)
      ? 'iPhone'
      : /iPad/.test(s)
        ? 'iPad'
        : /Windows/.test(s)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(s)
            ? 'macOS'
            : /Linux/.test(s)
              ? 'Linux'
              : 'Bilinmeyen cihaz';
  return `${browser} · ${os}`;
}

export function parseCookies(header = '') {
  const out = Object.create(null);
  if (typeof header !== 'string' || header.length > 8192) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* bozuk çerez yok sayılır */
      }
    }
  }
  return out;
}

/**
 * Secure: üretimde (app.locals.secureCookies) her zaman; aksi halde istek HTTPS ise (req.secure, TRUST_PROXY ile).
 * Yerel http geliştirmede Secure olmaz (tarayıcı çerezi kaydetmezdi).
 */
export const isSecure = (req) => Boolean(req.secure || req.app?.locals?.secureCookies);

/**
 * HttpOnly: JavaScript (XSS) okuyamaz. SameSite=Lax: başka sitelerden gelen POST/fetch isteklerine eklenmez
 * (Google dönüşü gibi üst düzey GET yönlendirmelerinde gönderilir). Path=/api/auth: yalnızca oturum uçlarına gider.
 * maxAgeS null → oturum çerezi (tarayıcı kapanınca silinir).
 */
const cookieAttrs = (req, maxAgeS) =>
  `Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax${maxAgeS === null ? '' : `; Max-Age=${maxAgeS}`}${isSecure(req) ? '; Secure' : ''}`;

export function setDeviceCookie(req, res, token, { persistent = true } = {}) {
  res.append('Set-Cookie', `${DEVICE_COOKIE}=${token}; ${cookieAttrs(req, persistent ? Math.floor(DEVICE_TTL_MS / 1000) : null)}`);
}

export function clearDeviceCookie(req, res) {
  res.append('Set-Cookie', `${DEVICE_COOKIE}=; ${cookieAttrs(req, 0)}`);
}

/** Çerezdeki token; yoksa ya da biçimi bozuksa null (hata fırlatmaz) */
export function readDeviceToken(req) {
  const v = parseCookies(req.headers.cookie)[DEVICE_COOKIE];
  return typeof v === 'string' && TOKEN_RE.test(v) ? v : null;
}

export function createDeviceStore(db, secret) {
  const hash = (token) => createHmac('sha256', secret).update(`device:${token}`).digest('hex');
  const now = () => new Date().toISOString();
  const activeSql = 'revoked_at IS NULL AND expires_at > ?';

  return {
    /**
     * Yeni oturum kaydı: { id, token, persistent } (ham token yalnızca çereze yazılır, veritabanında HMAC-SHA256 özeti).
     * persistent=false: "Bu cihazı hatırla" kapalı — kısa ömürlü, tarayıcı oturumu boyunca.
     */
    async issue(userId, userAgent, { persistent = true } = {}) {
      const token = randomBytes(32).toString('base64url');
      const t = Date.now();
      const { lastId } = await db.run(
        `INSERT INTO trusted_devices (user_id, device_token_hash, device_label, user_agent, created_at, last_used_at, expires_at, persistent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, hash(token), deviceLabel(userAgent), String(userAgent ?? '').slice(0, 300), new Date(t).toISOString(), new Date(t).toISOString(),
          new Date(t + ttl(persistent)).toISOString(), persistent ? 1 : 0],
      );
      return { id: lastId, token, persistent };
    },

    /** Aktif (iptal edilmemiş, süresi dolmamış) kayıt; yoksa null */
    async find(token) {
      if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
      return (await db.get(`SELECT * FROM trusted_devices WHERE device_token_hash = ? AND ${activeSql}`, [hash(token), now()])) ?? null;
    },

    /** Kullanım: last_used_at güncellenir, süre ileri kayar (kalıcı 90 gün, oturumluk 1 gün) */
    async touch(device) {
      const t = Date.now();
      await db.run('UPDATE trusted_devices SET last_used_at = ?, expires_at = ? WHERE id = ?', [new Date(t).toISOString(), new Date(t + ttl(device.persistent !== 0)).toISOString(), device.id]);
    },

    /** Tek cihazı iptal (userId verilirse yalnızca o kullanıcınınkini); iptal edilen satır sayısı */
    async revoke(id, userId = null) {
      const { changes } = await db.run(
        `UPDATE trusted_devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL ${userId === null ? '' : 'AND user_id = ?'}`,
        userId === null ? [now(), id] : [now(), id, userId],
      );
      return changes;
    },

    /** Kullanıcının tüm cihazları (exceptId hariç) için iptal ifadesi — batch içinde kullanılır */
    revokeAllStmt(userId, exceptId = null) {
      return ['UPDATE trusted_devices SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?', [now(), userId, exceptId ?? -1]];
    },

    async list(userId) {
      return db.all(`SELECT id, device_label, created_at, last_used_at, expires_at, persistent FROM trusted_devices WHERE user_id = ? AND ${activeSql} ORDER BY last_used_at DESC`, [userId, now()]);
    },

    /** Süresi 30 günden uzun zamandır dolmuş ya da iptal edilmiş kayıtları temizler */
    async prune() {
      const cutoff = new Date(Date.now() - 30 * 86400e3).toISOString();
      await db.run('DELETE FROM trusted_devices WHERE expires_at < ? OR revoked_at < ?', [cutoff, cutoff]);
    },
  };
}
