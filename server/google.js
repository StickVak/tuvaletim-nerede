/**
 * Google ile giriş (OAuth 2.0 / OpenID Connect, yetkilendirme kodu akışı).
 *
 * Güvenlik:
 * - CSRF: rastgele `state`; tarayıcıda imzalı (HMAC) HttpOnly `tn_oauth` çerezinde saklanır ve dönüşte eşleşmeli.
 *   Kullanılan state'ler süresi dolana kadar hatırlanır (tek kullanımlık).
 * - PKCE (S256): yetkilendirme kodu ele geçirilse bile code_verifier olmadan belirtece çevrilemez.
 * - `nonce`: id_token'ın bu akış için üretildiğini kanıtlar (yeniden oynatma).
 * - id_token doğrudan Google'ın belirteç ucundan TLS ile alınır (OIDC Core 3.1.3.7: imza yerine TLS doğrulaması);
 *   iss, aud, exp, nonce ve email_verified iddiaları denetlenir.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isSecure, parseCookies } from './devices.js';

export const OAUTH_COOKIE = 'tn_oauth';
export const CALLBACK_PATH = '/api/auth/google/callback';
const COOKIE_PATH = '/api/auth/google';
const FLOW_TTL_MS = 10 * 60 * 1000;
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/** Hata kodu uygulamaya ?auth_error=<code> olarak döner (kullanıcıya Türkçe mesaj istemcide) */
export class OAuthError extends Error {
  constructor(code, detail) {
    super(detail ?? code);
    this.code = code;
  }
}

/** GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET zorunlu; callback: GOOGLE_REDIRECT_URI ya da APP_URL + /api/auth/google/callback (yoksa istekten türetilir) */
export function googleConfig(env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const appUrl = env.APP_URL?.trim().replace(/\/+$/, '');
  return { clientId, clientSecret, redirectUri: env.GOOGLE_REDIRECT_URI?.trim() || (appUrl ? `${appUrl}${CALLBACK_PATH}` : null) };
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** id_token gövdesini çözer (imza TLS ile doğrudan alındığı için ayrıca doğrulanmaz; bkz. üst açıklama) */
function decodeJwt(token) {
  const part = String(token).split('.')[1];
  if (!part) throw new OAuthError('id_token', 'id_token biçimi geçersiz');
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    throw new OAuthError('id_token', 'id_token çözülemedi');
  }
}

export function createGoogleAuth({ clientId, clientSecret, redirectUri = null, fetchImpl = fetch }, secret) {
  const sign = (data) => createHmac('sha256', secret).update(`oauth:${data}`).digest('base64url');
  const usedStates = new Map(); // state → bitiş zamanı (tek kullanımlık)
  const attrs = (req, maxAge) => `Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure(req) ? '; Secure' : ''}`;

  return {
    /** Akışı başlatır: oauth çerezini yazar, Google yetkilendirme adresini döner */
    begin(req, res, { terms = false } = {}) {
      const redirect = redirectUri || `${req.protocol}://${req.get('host')}${CALLBACK_PATH}`;
      const flow = { s: b64url(randomBytes(24)), v: b64url(randomBytes(32)), n: b64url(randomBytes(16)), r: redirect, e: Date.now() + FLOW_TTL_MS, t: terms ? 1 : 0 };
      // t: kullanıcı başlatırken şartları kabul etti (imzalı çerezde taşınır, dönüşte değiştirilemez)
      const payload = b64url(JSON.stringify(flow));
      res.append('Set-Cookie', `${OAUTH_COOKIE}=${payload}.${sign(payload)}; ${attrs(req, FLOW_TTL_MS / 1000)}`);
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: 'code',
        scope: 'openid email profile',
        state: flow.s,
        nonce: flow.n,
        code_challenge: createHash('sha256').update(flow.v).digest('base64url'),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return url.toString();
    },

    /** Dönüşte çerezi doğrular ve state'i tüketir; geçersizse null */
    consume(req, state) {
      for (const [s, exp] of usedStates) if (exp < Date.now()) usedStates.delete(s);
      const raw = parseCookies(req.headers.cookie)[OAUTH_COOKIE];
      if (!raw || !state) return null;
      const [payload, sig] = raw.split('.');
      if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
      let flow;
      try {
        flow = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        return null;
      }
      if (typeof flow?.e !== 'number' || flow.e < Date.now() || !safeEqual(flow.s, state) || usedStates.has(flow.s)) return null;
      usedStates.set(flow.s, flow.e);
      return flow;
    },

    clearCookie(req, res) {
      res.append('Set-Cookie', `${OAUTH_COOKIE}=; ${attrs(req, 0)}`);
    },

    /** Kodu (PKCE ile) belirtece çevirir ve id_token iddialarını denetler → { sub, email, name, picture } */
    async exchange(code, flow) {
      if (!code) throw new OAuthError('token', 'kod yok');
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10_000);
      let data;
      try {
        const res = await fetchImpl('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: flow.r,
            grant_type: 'authorization_code',
            code_verifier: flow.v,
          }).toString(),
          signal: ac.signal,
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new OAuthError('token', `Google belirteç ucu ${res.status}: ${data.error ?? ''} ${data.error_description ?? ''}`.trim());
      } catch (e) {
        if (e instanceof OAuthError) throw e;
        throw new OAuthError('token', `Google belirteç ucuna ulaşılamadı: ${e.message}`);
      } finally {
        clearTimeout(timer);
      }
      const c = decodeJwt(data.id_token);
      const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
      if (!ISSUERS.has(c.iss)) throw new OAuthError('id_token', `iss geçersiz: ${c.iss}`);
      if (!aud.includes(clientId)) throw new OAuthError('id_token', 'aud bu uygulama değil');
      if (typeof c.exp !== 'number' || c.exp * 1000 < Date.now()) throw new OAuthError('id_token', 'id_token süresi dolmuş');
      if (!c.nonce || !safeEqual(c.nonce, flow.n)) throw new OAuthError('id_token', 'nonce uyuşmuyor');
      if (!c.sub || typeof c.email !== 'string' || !c.email.includes('@')) throw new OAuthError('id_token', 'sub/email eksik');
      if (c.email_verified !== true && c.email_verified !== 'true') throw new OAuthError('email_unverified', 'Google e-postası doğrulanmamış');
      return {
        sub: String(c.sub),
        email: c.email,
        name: typeof c.name === 'string' ? c.name : null,
        picture: typeof c.picture === 'string' && c.picture.startsWith('https://') ? c.picture : null,
      };
    },
  };
}
