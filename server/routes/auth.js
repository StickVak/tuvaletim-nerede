import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { asyncRouter } from '../async.js';
import { hashPassword, publicUser, requireUser, signToken, verifyPassword } from '../auth.js';

const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,30}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_AFTER_MS = 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

const normEmail = (v) => String(v ?? '').trim().toLowerCase();

/**
 * Kayıt: önce POST /send-code ile e-postaya 6 haneli kod, sonra POST /register ile kod doğrulanıp hesap açılır.
 * mailer.sendVerificationCode(to, code) — bkz. server/mailer.js
 */
export function authRoutes(db, secret, { loginLimit, registerLimit, sendCodeLimit, mailer }) {
  const r = asyncRouter();
  r.use('/register', registerLimit);
  r.use('/send-code', sendCodeLimit);
  r.use('/login', loginLimit);
  const respond = (res, status, user) => res.status(status).json({ token: signToken({ id: user.id, role: user.role }, secret), user: publicUser(user) });
  // Kod düz metin saklanmaz; e-postaya bağlı HMAC
  const codeHash = (email, code) => createHmac('sha256', secret).update(`email-code:${email}:${code}`).digest('hex');

  const usernameError = async (username) => {
    if (!USERNAME_RE.test(username)) return [400, 'Kullanıcı adı 3-30 karakter olmalı; harf, rakam, _ . - kullanılabilir.'];
    if (await db.get('SELECT 1 FROM users WHERE username = ?', [username])) return [409, 'Bu kullanıcı adı alınmış.'];
    return null;
  };
  const emailError = async (email) => {
    if (!email || !EMAIL_RE.test(email) || email.length > 254) return [400, 'Geçerli bir e-posta adresi girin.'];
    if (await db.get('SELECT 1 FROM users WHERE email = ?', [email])) return [409, 'Bu e-posta ile kayıtlı bir hesap var. Giriş yapmayı deneyin.'];
    return null;
  };

  r.post('/send-code', async (req, res) => {
    const email = normEmail(req.body?.email);
    const username = req.body?.username === undefined ? null : String(req.body.username).trim();
    const err = (await emailError(email)) ?? (username !== null ? await usernameError(username) : null);
    if (err) return res.status(err[0]).json({ error: err[1] });

    const prev = await db.get('SELECT sent_at FROM email_codes WHERE email = ?', [email]);
    const wait = prev ? Date.parse(prev.sent_at) + RESEND_AFTER_MS - Date.now() : 0;
    if (wait > 0) {
      const s = Math.ceil(wait / 1000);
      res.set('Retry-After', String(s));
      return res.status(429).json({ error: `Yeni kod için ${s} saniye bekleyin.`, retryAfter: s });
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = Date.now();
    await db.run(
      `INSERT INTO email_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
       ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`,
      [email, codeHash(email, code), new Date(now + CODE_TTL_MS).toISOString(), new Date(now).toISOString()],
    );
    try {
      await mailer.sendVerificationCode(email, code);
    } catch (e) {
      console.error('[mail] gönderilemedi:', e.message);
      await db.run('DELETE FROM email_codes WHERE email = ?', [email]);
      return res.status(502).json({ error: 'Doğrulama e-postası gönderilemedi. Lütfen biraz sonra tekrar deneyin.' });
    }
    res.json({ ok: true, expiresIn: CODE_TTL_MS / 1000, resendIn: RESEND_AFTER_MS / 1000 });
  });

  r.post('/register', async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password ?? '');
    const code = String(req.body?.code ?? '').trim();
    const err = (await usernameError(username)) ?? (await emailError(email));
    if (err) return res.status(err[0]).json({ error: err[1] });
    if (password.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı.' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'E-postanıza gelen 6 haneli kodu girin.' });

    const row = await db.get('SELECT * FROM email_codes WHERE email = ?', [email]);
    if (!row) return res.status(400).json({ error: 'Bu e-posta için geçerli bir kod yok. Önce kod isteyin.' });
    if (Date.parse(row.expires_at) < Date.now()) {
      await db.run('DELETE FROM email_codes WHERE email = ?', [email]);
      return res.status(400).json({ error: 'Kodun süresi doldu. Yeni kod isteyin.' });
    }
    const ok = timingSafeEqual(Buffer.from(codeHash(email, code)), Buffer.from(row.code_hash));
    if (!ok) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await db.run('DELETE FROM email_codes WHERE email = ?', [email]);
        return res.status(400).json({ error: 'Çok fazla hatalı deneme. Lütfen yeni kod isteyin.' });
      }
      await db.run('UPDATE email_codes SET attempts = ? WHERE email = ?', [attempts, email]);
      return res.status(400).json({ error: `Kod hatalı. Kalan deneme: ${MAX_CODE_ATTEMPTS - attempts}` });
    }

    // Kod tüketimi ve hesap oluşturma tek işlemde
    const [, created] = await db.batch([
      ['DELETE FROM email_codes WHERE email = ?', [email]],
      ['INSERT INTO users (username, display_name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
        username, username, email, hashPassword(password), 'user', new Date().toISOString(),
      ]],
    ]);
    const lastId = created.lastId;
    respond(res, 201, { id: lastId, username, role: 'user', display_name: username, avatar_url: null });
  });

  r.post('/login', async (req, res) => {
    const login = String(req.body?.username ?? '').trim();
    const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [login, login.toLowerCase()]);
    if (!user || !verifyPassword(req.body?.password ?? '', user.password_hash)) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }
    respond(res, 200, user);
  });

  r.get('/me', requireUser, (req, res) => res.json({ user: req.user }));
  return r;
}
