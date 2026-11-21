/**
 * Bellek içi, sabit pencereli hız sınırlayıcı (tek süreçli sunucu için yeterli).
 *
 * Her sınırlayıcı bir anahtar üzerinden sayar: varsayılan anahtar istemci IP'si (req.clientIp, bkz. clientIp()),
 * ama hedef e-posta, hesap ya da oturumdaki kullanıcı da olabilir. Aşımda 429 + Retry-After başlığı +
 * { error, retryAfter } gövdesi döner (istemci kalan süreyi gösterir).
 */
import { isIP } from 'node:net';

const MAX_KEYS = 50_000; // bellek tavanı: dolarsa en eski pencereler atılır

/** Saniyeyi kullanıcıya okunur süreye çevirir: "45 saniye", "3 dakika", "1 saat" */
export function humanWait(s) {
  if (s < 60) return `${s} saniye`;
  if (s < 3600) return `${Math.ceil(s / 60)} dakika`;
  return `${Math.ceil(s / 3600)} saat`;
}

/**
 * @param {{ windowMs: number, max: number }} limit
 * @param {object} o
 * @param {string} [o.message]  Türkçe uyarı (sonuna "X dakika sonra tekrar deneyin." eklenir)
 * @param {(req) => string | null | undefined} [o.key]  sayım anahtarı; boş dönerse istek sınırlanmaz
 * @param {(status: number) => boolean} [o.countIf]  yalnızca bu durum kodlarıyla biten istekler sayılır
 * @param {string} [o.name]  anahtar ön eki (aynı anahtar uzayını paylaşan sınırlayıcılar ayrışsın)
 */
export function rateLimit({ windowMs, max }, { message = 'Çok fazla istek gönderildi.', key = ipKey, countIf, name = '' } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, h] of hits) if (h.reset <= now) hits.delete(k);
  }, 60 * 1000).unref();

  return (req, res, next) => {
    const raw = key(req);
    if (!raw) return next();
    const k = `${name}:${raw}`;
    const now = Date.now();
    let h = hits.get(k);
    if (!h || h.reset <= now) {
      if (!h && hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value);
      h = { count: 0, reset: now + windowMs };
      hits.set(k, h);
    }
    if (h.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((h.reset - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `${message} Lütfen ${humanWait(retryAfter)} sonra tekrar deneyin.`, retryAfter, reason: 'rate_limit' });
    }
    if (countIf) res.on('finish', () => countIf(res.statusCode) && h.count++);
    else h.count++;
    next();
  };
}

/** Birden çok sınırlayıcıyı sırayla uygular (ilk aşımda durur) */
export function chain(...mws) {
  const list = mws.filter(Boolean);
  return (req, res, next) => {
    let i = 0;
    const step = (err) => {
      if (err || i >= list.length || res.headersSent) return next(err);
      list[i++](req, res, step);
    };
    step();
  };
}

export const ipKey = (req) => req.clientIp ?? req.ip ?? 'unknown';
/** Oturum açıksa kullanıcı kimliği (aynı kullanıcı farklı IP'lerden de sınırlanır) */
export const userKey = (req) => (req.user ? `u${req.user.id}` : null);

/**
 * Gerçek istemci IP'si → req.clientIp.
 * header verilmişse (ör. Render/Cloudflare: "cf-connecting-ip") ve geçerli bir IP içeriyorsa o kullanılır: Cloudflare bu
 * başlığı her istekte kendisi yazar, istemcinin gönderdiği değer korunmaz. Yoksa Express'in `trust proxy` ayarına göre
 * çözülen req.ip (X-Forwarded-For'un sondan güvenilen kadar atlanmış hali; istemci başa sahte IP ekleyemez).
 */
export function clientIp({ header = null } = {}) {
  const h = header ? header.toLowerCase() : null;
  return (req, _res, next) => {
    const v = h ? String(req.headers[h] ?? '').split(',')[0].trim() : '';
    req.clientIp = v && isIP(v) ? v : req.ip;
    next();
  };
}

/**
 * Varsayılan sınırlar. Hepsi pencere başına; aşımda 429.
 * IP sınırları NAT arkasındaki (okul, kafe, mobil operatör) kullanıcıları kilitlememek için cömert, hedef/hesap
 * sınırları ise kaba kuvvet ve e-posta bombardımanını durduracak kadar sıkıdır.
 */
export const DEFAULT_LIMITS = {
  /** tüm /api istekleri: IP başına dakikada 300 (fotoğraf GET'leri hariç) — kaba DoS tamponu */
  api: { windowMs: 60 * 1000, max: 300 },
  /** giriş: IP başına 15 dakikada 10 BAŞARISIZ deneme (başarılı girişler sayılmaz) */
  login: { windowMs: 15 * 60 * 1000, max: 10 },
  /** giriş: HESAP başına 15 dakikada 5 başarısız deneme (dağıtık şifre denemesine karşı) */
  loginAccount: { windowMs: 15 * 60 * 1000, max: 5 },
  /** yönetim anahtarı: IP başına 15 dakikada 10 BAŞARISIZ deneme */
  adminAuth: { windowMs: 15 * 60 * 1000, max: 10 },
  /** doğrulama kodu gönderimi: IP başına 15 dakikada 10 (farklı adreslere toplu gönderim) */
  sendCode: { windowMs: 15 * 60 * 1000, max: 10 },
  /** doğrulama kodu gönderimi: HEDEF E-POSTA başına saatte 5 (bir kişinin kutusunu doldurma) */
  sendCodeEmail: { windowMs: 60 * 60 * 1000, max: 5 },
  /** kayıt (kod doğrulama): IP başına saatte 10 */
  register: { windowMs: 60 * 60 * 1000, max: 10 },
  /** kod doğrulama: E-POSTA başına saatte 10 başarısız deneme (kod başına 5 deneme sınırına ek) */
  verifyEmail: { windowMs: 60 * 60 * 1000, max: 10 },
  /** şifre sıfırlama kodu isteme: IP başına 15 dakikada 10 · e-posta başına saatte 5 */
  resetRequest: { windowMs: 15 * 60 * 1000, max: 10 },
  resetRequestEmail: { windowMs: 60 * 60 * 1000, max: 5 },
  /** şifre sıfırlama kodu doğrulama: IP başına 15 dakikada 20 · e-posta başına saatte 10 hatalı */
  resetConfirm: { windowMs: 15 * 60 * 1000, max: 20 },
  resetConfirmEmail: { windowMs: 60 * 60 * 1000, max: 10 },
  /** oturum tazeleme / çıkış / cihaz yönetimi: IP başına 5 dakikada 60 */
  session: { windowMs: 5 * 60 * 1000, max: 60 },
  /** Google ile giriş başlatma + dönüş: IP başına 10 dakikada 20 */
  oauth: { windowMs: 10 * 60 * 1000, max: 20 },
  /** oy, bildirim, favori, profil yazma: IP başına dakikada 60 */
  write: { windowMs: 60 * 1000, max: 60 },
  /** aynı yazmalar KULLANICI başına dakikada 30 (IP değiştirse de) */
  writeUser: { windowMs: 60 * 1000, max: 30 },
  /** fotoğraf yükleme (yeni mekan başvurusu, profil fotoğrafı): kullanıcı ya da IP başına saatte 20 */
  upload: { windowMs: 60 * 60 * 1000, max: 20 },
};
