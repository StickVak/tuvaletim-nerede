/**
 * HTTP güvenlik başlıkları, istek gövdesi denetimi ve hata yanıtları.
 *
 * Content-Security-Policy, uygulamanın gerçekten kullandığı dış kaynaklara göre dar tutulur:
 * - Google Fonts (stil + yazı tipi dosyaları)
 * - Harita karoları: Esri / OpenStreetMap France (görsel; servis çalışanı önbelleğe alırken fetch → connect-src)
 * - Cloudinary (kalıcı mekan/profil fotoğrafları; /api/... uçları oraya yönlendirir)
 * - Google profil fotoğrafları (Google ile girişte avatar_url = *.googleusercontent.com)
 * - Yaya rota servisleri (routing.openstreetmap.de, router.project-osrm.org)
 * Google ile giriş tam sayfa yönlendirmeyle yapılır (açılır pencere/iframe yok), CSP'de ayrıca izin gerekmez.
 * index.html'deki satır içi tema betiği hash'iyle izinlidir (unsafe-inline yok).
 */
import { createHash } from 'node:crypto';

// Harita karoları: Esri (birincil) ve OpenStreetMap France (yedek) — src/lib/tiles.ts
const TILE_HOSTS = ['https://server.arcgisonline.com', 'https://*.tile.openstreetmap.fr'];
const ROUTE_HOSTS = ['https://routing.openstreetmap.de', 'https://router.project-osrm.org'];
const IMAGE_HOSTS = ['https://res.cloudinary.com', 'https://*.googleusercontent.com'];

/** Satır içi <script> içerikleri için CSP hash kaynakları ('sha256-…') */
export function inlineScriptHashes(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (m[1].trim()) out.push(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  return out;
}

/** Uygulama sayfaları (SPA, hukuki sayfalar) için CSP */
export function appCsp({ scriptHashes = [], upgrade = false } = {}) {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    // React/Leaflet style özniteliklerini kullanır; stil enjeksiyonu betik çalıştıramaz
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: ${[...TILE_HOSTS, ...IMAGE_HOSTS].join(' ')}`,
    `connect-src 'self' ${[...TILE_HOSTS, ...ROUTE_HOSTS].join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(upgrade ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/** JSON API yanıtları belge olarak hiçbir şey yükleyemez */
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * Tüm yanıtlara güvenlik başlıkları.
 * production: HTTPS'e zorlayan HSTS + upgrade-insecure-requests (yalnızca HTTPS'te yayındaysa).
 */
export function securityHeaders({ scriptHashes = [], production = false } = {}) {
  const csp = appCsp({ scriptHashes, upgrade: production });
  return (req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      // Başka sitelere yalnızca köken gönderilir (tam adres/sorgu sızmaz)
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=(), interest-cohort=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-DNS-Prefetch-Control': 'off',
      'Content-Security-Policy': req.path.startsWith('/api/') ? API_CSP : csp,
    });
    if (production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

/** Yazma isteklerinin JSON gövdesi nesne olmalı (dizi/sayı/metin gövdeleri reddedilir) */
export function requireObjectBody(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body !== undefined) {
    const b = req.body;
    if (b === null || typeof b !== 'object' || Array.isArray(b) || Buffer.isBuffer(b)) return res.status(400).json({ error: 'Geçersiz istek.' });
  }
  next();
}

/**
 * Son hata işleyicisi: istemciye yalnızca genel bir mesaj; ayrıntı (yığın izi, SQL, sağlayıcı yanıtı) sunucu loguna.
 * body-parser hataları (bozuk JSON, büyük gövde, desteklenmeyen kodlama) 4xx olarak eşlenir.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) return req.socket?.destroy();
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Gönderilen veri çok büyük.' });
  const status = Number(err?.status ?? err?.statusCode);
  // Bozuk JSON, desteklenmeyen kodlama, çözülemeyen URL parametresi (%E0 vb.) gibi istemci hataları
  if (err?.type === 'entity.parse.failed' || (status >= 400 && status < 500)) {
    return res.status(status === 415 ? 415 : 400).json({ error: status === 415 ? 'Desteklenmeyen içerik türü.' : 'Geçersiz istek.' });
  }
  const id = Math.random().toString(36).slice(2, 10);
  console.error(`[hata] ${id} ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Sunucu hatası. Lütfen biraz sonra tekrar deneyin.', ref: id });
}
