import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { asyncRouter } from '../async.js';
import { hashPassword, publicUser, requireUser, signToken, verifyPassword } from '../auth.js';
import { MailError, maskEmail } from '../mailer.js';
import { clearDeviceCookie, createDeviceStore, readDeviceToken, setDeviceCookie } from '../devices.js';

const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,30}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_AFTER_MS = 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
/** Belirsiz teslim (zaman aşımı) sonrası yeni kod istemeden önceki kısa bekleme */
export const UNCERTAIN_RESEND_MS = 15 * 1000;

/**
 * Kesin gönderim hatasında kullanıcıya gösterilecek güvenli mesaj ve bekleme (sn). Sağlayıcı ayrıntısı içermez.
 * reason: rate_limit | network | unavailable (istemci için kararlı değerler)
 */
function deliveryFailure(e) {
  const kind = e instanceof MailError ? e.kind : 'provider';
  if (kind === 'rate_limit') {
    const s = Math.min(Math.max(e.retryAfter ?? 30, 5), 3600);
    return { reason: 'rate_limit', retryAfter: s, error: `E-posta servisi şu an yoğun. ${s} saniye sonra tekrar deneyin.` };
  }
  if (kind === 'network' || kind === 'timeout' || (kind === 'provider' && e.retryable)) {
    return { reason: 'network', retryAfter: 15, error: 'Doğrulama e-postası şu an gönderilemedi. 15 saniye sonra tekrar deneyin.' };
  }
  // config (anahtar/alan adı) ya da sağlayıcının kalıcı reddi: kullanıcı düzeltemez, ayrıntı loglarda
  return { reason: 'unavailable', retryAfter: 60, error: 'E-posta servisi geçici olarak kullanılamıyor. 1 dakika sonra tekrar deneyin.' };
}

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
  const devices = createDeviceStore(db, secret);
  /** Erişim belirteci (cihaza bağlıysa did ile: cihaz iptal edilince belirteç de geçersiz olur) */
  const respond = (res, status, user, deviceId = null) =>
    res.status(status).json({ token: signToken({ id: user.id, role: user.role, ...(deviceId ? { did: deviceId } : {}) }, secret), user: publicUser(user) });

  /** Başarılı OTP'li kayıt / girişten sonra: "Bu cihazı hatırla" açıksa (varsayılan) güvenilir cihaz + çerez */
  async function startSession(req, res, status, user) {
    if (req.body?.remember === false) return respond(res, status, user);
    const device = await devices.issue(user.id, req.get('user-agent'));
    setDeviceCookie(req, res, device.token);
    return respond(res, status, user, device.id);
  }

  /** Bu isteğin cihazı: önce erişim belirtecindeki did, yoksa çerezdeki token */
  async function currentDeviceId(req) {
    if (req.auth?.deviceId) return req.auth.deviceId;
    return (await devices.find(readDeviceToken(req)))?.id ?? null;
  }
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

    const prev = await db.get('SELECT sent_at, next_send_at FROM email_codes WHERE email = ?', [email]);
    const nextAt = prev ? Date.parse(prev.next_send_at ?? '') || Date.parse(prev.sent_at) + RESEND_AFTER_MS : 0;
    const wait = nextAt - Date.now();
    if (wait > 0) {
      const s = Math.ceil(wait / 1000);
      res.set('Retry-After', String(s));
      return res.status(429).json({ error: `Yeni kod için ${s} saniye bekleyin.`, retryAfter: s });
    }

    // Kod gönderimden ÖNCE kaydedilir; aynı istek içindeki yeniden deneme (mailer) aynı kodu gönderir
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = Date.now();
    await db.run(
      `INSERT INTO email_codes (email, code_hash, expires_at, attempts, sent_at, next_send_at) VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0,
         sent_at = excluded.sent_at, next_send_at = excluded.next_send_at`,
      [email, codeHash(email, code), new Date(now + CODE_TTL_MS).toISOString(), new Date(now).toISOString(), new Date(now + RESEND_AFTER_MS).toISOString()],
    );
    try {
      await mailer.sendVerificationCode(email, code);
    } catch (e) {
      const kind = e instanceof MailError ? e.kind : 'bilinmeyen';
      console.error(`[mail] doğrulama kodu teslim edilemedi tür=${kind} alıcı=${maskEmail(email)} deneme=${e?.attempts ?? 1}: ${e?.message}`);

      if (kind === 'timeout') {
        // Belirsiz teslim: sağlayıcı yanıt vermedi ama e-posta ulaşmış olabilir. Kod geçerli kalır (geç gelen e-posta
        // çalışsın) ve kullanıcı kısa süre sonra yeni kod isteyebilir; yeni kod eskisinin yerini alır.
        await db.run('UPDATE email_codes SET next_send_at = ? WHERE email = ?', [new Date(Date.now() + UNCERTAIN_RESEND_MS).toISOString(), email]);
        return res.status(202).json({
          ok: true,
          delivery: 'uncertain',
          expiresIn: CODE_TTL_MS / 1000,
          resendIn: UNCERTAIN_RESEND_MS / 1000,
          message: 'E-posta gönderimi gecikiyor; kod birkaç dakika içinde gelebilir. Gelmezse kısa süre sonra yeni kod isteyin.',
        });
      }

      // Kesin hata: e-posta gitmedi → kod silinir (geçersiz bir kod kalmasın), kullanıcı belirtilen süre sonra yeniden dener
      await db.run('DELETE FROM email_codes WHERE email = ?', [email]);
      const f = deliveryFailure(e);
      res.set('Retry-After', String(f.retryAfter));
      return res.status(503).json(f);
    }
    res.json({ ok: true, delivery: 'sent', expiresIn: CODE_TTL_MS / 1000, resendIn: RESEND_AFTER_MS / 1000 });
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
    // OTP doğrulandı: bu cihaz güvenilir olur (sonraki açılışlarda giriş ekranı gelmez)
    await startSession(req, res, 201, { id: lastId, username, role: 'user', display_name: username, avatar_url: null });
  });

  r.post('/login', async (req, res) => {
    const login = String(req.body?.username ?? '').trim();
    const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [login, login.toLowerCase()]);
    if (!user || !verifyPassword(req.body?.password ?? '', user.password_hash)) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }
    await startSession(req, res, 200, user);
  });

  r.get('/me', requireUser, (req, res) => res.json({ user: req.user }));

  /**
   * Sessiz oturum tazeleme: güvenilir cihaz çereziyle yeni erişim belirteci. Uygulama açılışında ya da belirteç
   * süresi dolunca istemci çağırır. Çerez yok/geçersiz/iptal/süresi dolmuş → 401 (istemci standart girişe düşer).
   */
  r.post('/refresh', async (req, res) => {
    const token = readDeviceToken(req);
    const device = await devices.find(token);
    const user = device && (await db.get('SELECT * FROM users WHERE id = ?', [device.user_id]));
    if (!device || !user) {
      if (token) clearDeviceCookie(req, res);
      return res.status(401).json({ error: 'Oturum yenilenemedi. Lütfen giriş yapın.' });
    }
    await devices.touch(device.id);
    setDeviceCookie(req, res, token); // çerez süresi de kayar
    respond(res, 200, user, device.id);
  });

  /** Bu cihazdan çıkış: yalnızca bu cihazın güvenilir kaydı iptal edilir (diğer cihazlar etkilenmez) */
  r.post('/logout', async (req, res) => {
    const id = await currentDeviceId(req);
    if (id) await devices.revoke(id);
    clearDeviceCookie(req, res);
    res.status(204).end();
  });

  /** Tüm cihazlardan çıkış: tüm güvenilir cihazlar iptal + daha önce verilmiş tüm erişim belirteçleri geçersiz */
  r.post('/logout-all', requireUser, async (req, res) => {
    await db.batch([devices.revokeAllStmt(req.user.id), ['UPDATE users SET tokens_valid_after = ? WHERE id = ?', [new Date().toISOString(), req.user.id]]]);
    clearDeviceCookie(req, res);
    res.status(204).end();
  });

  /** Güvenilir cihazlarım (bu cihaz işaretli); token özeti ve ham user-agent dönmez */
  r.get('/devices', requireUser, async (req, res) => {
    const current = await currentDeviceId(req);
    const rows = await devices.list(req.user.id);
    res.json(rows.map((d) => ({ id: d.id, label: d.device_label, createdAt: d.created_at, lastUsedAt: d.last_used_at, expiresAt: d.expires_at, current: d.id === current })));
  });

  /** Tek cihazı iptal (yalnızca kendi cihazları); o cihazın erişim belirteci de hemen geçersizleşir */
  r.delete('/devices/:id', requireUser, async (req, res) => {
    const changes = await devices.revoke(Number(req.params.id), req.user.id);
    res.status(changes ? 204 : 404).end();
  });
  return r;
}
