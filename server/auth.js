import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Erişim belirteci ömrü. Kısa tutulur (localStorage'dan çalınırsa sınırlı süre işe yarar); süresi dolunca istemci
 * HttpOnly oturum çereziyle /api/auth/refresh üzerinden sessizce yenisini alır.
 */
export const TOKEN_TTL_S = 12 * 60 * 60;
const MAX_TOKEN_LENGTH = 1024;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string') return false;
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(String(password), salt, expected.length);
  return timingSafeEqual(expected, actual);
}

const sign = (data, secret) => createHmac('sha256', secret).update(data).digest();

/** base64url(JSON payload) + "." + base64url(HMAC-SHA256) */
export function signToken(payload, secret) {
  // iat: milisaniye (tokens_valid_after ile aynı saniye içindeki girişler doğru ayrılsın)
  const body = { ...payload, iat: payload.iat ?? Date.now(), exp: payload.exp ?? Math.floor(Date.now() / 1000) + TOKEN_TTL_S };
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${data}.${sign(data, secret).toString('base64url')}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
  const [data, sig, extra] = token.split('.');
  if (!data || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, 'base64url');
  const expected = sign(data, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return body && typeof body === 'object' && typeof body.exp === 'number' && body.exp > Date.now() / 1000 ? body : null;
  } catch {
    return null;
  }
}

export const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  role: u.role,
  displayName: u.display_name || u.username,
  avatarUrl: u.avatar_url ?? null,
});

/**
 * Geçerli belirteç varsa req.user'ı veritabanındaki güncel kullanıcıyla doldurur; req.auth.deviceId = belirtecin cihazı.
 * Bozuk/eksik başlık hata fırlatmaz, istek oturumsuz devam eder. Belirteç reddedilir: oturum kaydına (did) bağlı değilse
 * (eski biçim; çıkışta sunucuda iptal edilemezdi), kullanıcı yoksa, "tüm cihazlardan çıkış"/şifre değişikliğinden önce verilmişse
 * (users.tokens_valid_after) ya da bağlı olduğu güvenilir cihaz iptal edilmiş / süresi dolmuşsa.
 */
export function optionalUser(db, secret) {
  return (req, _res, next) => {
    req.user = null;
    req.auth = { deviceId: null };
    const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const payload = header.startsWith('Bearer ') ? verifyToken(header.slice(7).trim(), secret) : null;
    if (!payload || !Number.isInteger(payload.id) || !Number.isInteger(payload.did)) return next();
    db.get(
      `SELECT u.id, u.username, u.role, u.display_name, u.avatar_url, u.tokens_valid_after,
              d.user_id AS d_user, d.revoked_at AS d_revoked, d.expires_at AS d_expires
       FROM users u LEFT JOIN trusted_devices d ON d.id = ? WHERE u.id = ?`,
      [payload.did, payload.id],
    ).then((row) => {
      if (!row) return next();
      if (row.tokens_valid_after && (payload.iat ?? 0) < Date.parse(row.tokens_valid_after)) return next();
      if (row.d_user !== row.id || row.d_revoked || !(Date.parse(row.d_expires) > Date.now())) return next();
      req.user = publicUser(row);
      req.auth = { deviceId: payload.did };
      next();
    }, next);
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Bu işlem için giriş yapmalısınız.' });
  next();
}

export const MIN_ADMIN_KEY_LENGTH = 16;
const digest = (s) => createHash('sha256').update(String(s)).digest();

/**
 * Yönetim API'si yalnızca X-Admin-Key başlığındaki ADMIN_SECRET_KEY ile açılır (kullanıcı hesapları yetkisizdir).
 * Anahtar tanımlı değilse API tamamen kapalıdır (503). Karşılaştırma sabit sürelidir.
 */
export function requireAdminKey(key) {
  const expected = key ? digest(key) : null;
  return (req, res, next) => {
    if (!expected) return res.status(503).json({ error: "Yönetim API'si kapalı: sunucuda ADMIN_SECRET_KEY tanımlı değil." });
    const given = req.get('x-admin-key');
    if (!given || !timingSafeEqual(digest(given), expected)) return res.status(401).json({ error: 'Geçersiz yönetici anahtarı.' });
    next();
  };
}
