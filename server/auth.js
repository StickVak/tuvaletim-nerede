import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_S = 7 * 24 * 60 * 60;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(String(password), salt, expected.length);
  return timingSafeEqual(expected, actual);
}

const sign = (data, secret) => createHmac('sha256', secret).update(data).digest();

/** base64url(JSON payload) + "." + base64url(HMAC-SHA256) */
export function signToken(payload, secret) {
  const body = { ...payload, exp: payload.exp ?? Math.floor(Date.now() / 1000) + TOKEN_TTL_S };
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${data}.${sign(data, secret).toString('base64url')}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const given = Buffer.from(sig, 'base64url');
  const expected = sign(data, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return typeof body.exp === 'number' && body.exp > Date.now() / 1000 ? body : null;
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

/** Geçerli belirteç varsa req.user'ı veritabanındaki güncel kullanıcıyla doldurur. */
export function optionalUser(db, secret) {
  return (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const payload = header.startsWith('Bearer ') ? verifyToken(header.slice(7), secret) : null;
    const user = payload && db.get('SELECT id, username, role, display_name, avatar_url FROM users WHERE id = ?', [payload.id]);
    req.user = user ? publicUser(user) : null;
    next();
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
