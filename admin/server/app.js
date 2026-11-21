/**
 * Tuvaletim Nerede? — bağımsız yönetim paneli sunucusu.
 *
 * - Giriş: yalnızca ADMIN_SECRET_KEY (kullanıcı hesabı yok). Başarılı girişte imzalı, httpOnly,
 *   SameSite=Strict bir oturum çerezi verilir; anahtar tarayıcıda saklanmaz.
 * - /api/admin/* istekleri ana sunucuya (MAIN_API_URL) X-Admin-Key başlığıyla iletilir.
 *   Ana sunucunun veritabanına başka bir yoldan erişim yoktur (iki Render servisi disk paylaşamaz).
 * - admin/dist (vite build) statik olarak sunulur.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { clientIp, rateLimit } from '../../server/ratelimit.js';

export const COOKIE = 'tn_admin';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_KEY = 16;
const UPSTREAM_TIMEOUT_MS = 90_000; // Render ücretsiz planında ana servis uykudan ~1 dk'da uyanır

const digest = (s) => createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * getKey: ADMIN_SECRET_KEY'i döner (her istekte çağrılır; yerelde anahtar dosyası sonradan oluşabilir).
 * mainApiUrl: ana sunucu kökü, ör. https://tuvaletim.onrender.com
 * production: oturum çerezi her zaman Secure + HSTS. clientIpHeader: gerçek istemci IP başlığı (Render: cf-connecting-ip).
 */
export function createAdminServer({ getKey, mainApiUrl, distDir, appUrl = mainApiUrl, limits = {}, production = false, clientIpHeader = null }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(clientIp({ header: clientIpHeader }));
  const revoked = new Map(); // çıkış yapılan oturumlar → bitiş zamanı

  // Oturum imzalama anahtarı yönetici anahtarından türetilir: anahtar değişince tüm oturumlar düşer
  const sessionKey = () => createHmac('sha256', getKey()).update('tn-admin-session-v1').digest();
  const sign = (data) => createHmac('sha256', sessionKey()).update(data).digest('base64url');

  function issue() {
    const body = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS, n: randomBytes(12).toString('base64url') })).toString('base64url');
    return `${body}.${sign(body)}`;
  }

  function verify(token) {
    if (!token || !getKey()) return null;
    const [body, sig] = String(token).split('.');
    if (!body || !sig || !safeEqual(sig, sign(body))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (typeof p.exp !== 'number' || p.exp < Date.now() || revoked.has(p.n)) return null;
      return p;
    } catch {
      return null;
    }
  }

  const cookieAttrs = (req, maxAgeS) =>
    `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeS}${req.secure || production ? '; Secure' : ''}`;

  // Güvenlik başlıkları: çerçeveye alınamaz, arama motorlarına kapalı, yalnızca kendi kaynakları
  app.use((_req, res, next) => {
    if (production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.set({
      'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        // Cloudinary: kalıcı mekan/profil fotoğrafları (ana sunucu oraya yönlendirir)
        "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://res.cloudinary.com",
        "connect-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join('; '),
    });
    next();
  });

  app.get('/healthz', (_req, res) => res.type('text').send('ok'));

  const L = limits === false ? null : { login: { windowMs: 15 * 60 * 1000, max: 10 }, ...limits };
  const loginLimit = L
    ? rateLimit(L.login, { name: 'adminLogin', message: 'Çok fazla hatalı anahtar denemesi.', countIf: (s) => s === 401 })
    : (_req, _res, next) => next();

  app.post('/auth/login', loginLimit, express.json({ limit: '2kb' }), (req, res) => {
    const key = getKey();
    if (!key || key.length < MIN_KEY) return res.status(503).json({ error: 'Panel yapılandırılmamış: sunucuda ADMIN_SECRET_KEY tanımlı değil.' });
    const given = req.body?.key;
    if (typeof given !== 'string' || !given || !safeEqual(given, key)) return res.status(401).json({ error: 'Yönetici anahtarı hatalı.' });
    res.set('Set-Cookie', `${COOKIE}=${issue()}; ${cookieAttrs(req, SESSION_TTL_MS / 1000)}`);
    res.json({ ok: true, appUrl });
  });

  const session = (req) => verify(parseCookies(req.headers.cookie)[COOKIE]);

  app.get('/auth/me', (req, res) => {
    const s = session(req);
    if (!s) return res.status(401).json({ error: 'Oturum yok.' });
    res.json({ ok: true, expiresAt: new Date(s.exp).toISOString(), appUrl });
  });

  app.post('/auth/logout', (req, res) => {
    const s = session(req);
    if (s) revoked.set(s.n, s.exp);
    for (const [n, exp] of revoked) if (exp < Date.now()) revoked.delete(n);
    res.set('Set-Cookie', `${COOKIE}=; ${cookieAttrs(req, 0)}`);
    res.status(204).end();
  });

  /**
   * Oturum + CSRF: değiştiren istekler özel başlık taşımalı (başka siteden form/fetch bu başlığı koyamaz;
   * SameSite=Strict çerezle birlikte iki katmanlı koruma).
   */
  function requireSession(req, res, next) {
    if (!session(req)) return res.status(401).json({ error: 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.' });
    if (!['GET', 'HEAD'].includes(req.method) && req.get('x-tn-admin') !== '1') return res.status(403).json({ error: 'Geçersiz istek.' });
    next();
  }

  async function forward(req, res, upstreamPath, { withKey }) {
    const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body?.length;
    let upstream;
    try {
      upstream = await fetch(new URL(upstreamPath, mainApiUrl), {
        method: req.method,
        headers: {
          ...(hasBody ? { 'Content-Type': req.get('content-type') || 'application/json' } : {}),
          ...(withKey ? { 'X-Admin-Key': getKey() } : {}),
        },
        body: hasBody ? req.body : undefined,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        redirect: 'manual',
      });
    } catch {
      return res.status(502).json({ error: 'Ana sunucuya ulaşılamadı. Birkaç saniye sonra tekrar deneyin.' });
    }
    if (upstream.status === 401 && withKey) {
      // Ana sunucu anahtarı reddetti: iki serviste ADMIN_SECRET_KEY farklı
      return res.status(502).json({ error: 'Ana sunucu yönetici anahtarını reddetti: iki serviste ADMIN_SECRET_KEY aynı olmalı.' });
    }
    // Fotoğraf Cloudinary'deyse ana sunucu oraya yönlendirir: yalnızca Cloudinary adresleri tarayıcıya iletilir
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location') ?? '';
      if (!/^https:\/\/res\.cloudinary\.com\//.test(location)) return res.status(502).json({ error: 'Beklenmeyen yönlendirme.' });
      if (upstream.headers.get('cache-control')) res.set('Cache-Control', upstream.headers.get('cache-control'));
      return res.redirect(upstream.status, location);
    }
    res.status(upstream.status);
    for (const h of ['content-type', 'cache-control']) if (upstream.headers.get(h)) res.set(h, upstream.headers.get(h));
    res.send(Buffer.from(await upstream.arrayBuffer()));
  }

  const rawBody = express.raw({ type: () => true, limit: '8mb' });
  /**
   * Yol kaçışı engeli: "..", kodlanmış nokta/eğik çizgi ya da ters bölü içeren yollar reddedilir
   * (URL çözümlenirken /api/admin dışına çıkıp ana sunucunun başka uçlarına anahtarla ulaşmasın).
   */
  const safeAdminPath = (req, res, next) => {
    const path = req.url.split('?')[0];
    const resolved = new URL(`/api/admin${req.url}`, 'http://x').pathname;
    if (/\.\.|%2e|%2f|%5c|\\/i.test(path) || !resolved.startsWith('/api/admin/')) return res.status(400).json({ error: 'Geçersiz yol.' });
    next();
  };
  app.use('/api/admin', safeAdminPath, requireSession, rawBody, (req, res) => forward(req, res, `/api/admin${req.url}`, { withKey: true }));
  // Mekan fotoğrafları (küçük resimler) ana sunucunun herkese açık ucundan
  app.get('/api/places/:id/photo', requireSession, (req, res) =>
    forward(req, res, `/api/places/${encodeURIComponent(req.params.id)}/photo`, { withKey: false }),
  );
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Bulunamadı.' }));

  if (distDir && existsSync(distDir)) {
    app.use('/assets', express.static(join(distDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use('/assets', (_req, res) => res.sendStatus(404));
    app.use(express.static(distDir, { index: false }));
    app.get(/^\/(?!api|auth)/, (_req, res) => res.set('Cache-Control', 'no-store').sendFile(join(distDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Gönderilen veri çok büyük.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz istek.' });
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  });
  return app;
}
