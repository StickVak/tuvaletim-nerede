import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { asyncRouter } from '../async.js';
import { hashPassword, publicUser, requireUser, signToken, verifyPassword } from '../auth.js';
import { MailError, maskEmail } from '../mailer.js';
import { DEVICE_COOKIE, clearDeviceCookie, createDeviceStore, parseCookies, readDeviceToken, setDeviceCookie } from '../devices.js';
import { PASSWORD_LENGTH, PASSWORD_MAX, cleanText, intIdParam, isEmail, validPassword } from '../validate.js';
import { USERNAME_INVALID, USERNAME_RE, conflictFromDbError, emailKey, identityConflict, uniqueUsername, usernameBase, usernameKey } from '../identity.js';
import { OAuthError, createGoogleAuth } from '../google.js';
import { LEGAL_VERSION } from '../legal.js';
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_AFTER_MS = 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
/** Belirsiz teslim (zaman aşımı) sonrası yeni kod istemeden önceki kısa bekleme */
export const UNCERTAIN_RESEND_MS = 15 * 1000;
/** Olmayan hesaplar için sabit maliyetli karşılaştırma (zamanlama ile kullanıcı adı yoklamasına karşı) */
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));
export const TERMS_REQUIRED = "Devam etmek için Hizmet Şartları'nı ve Gizlilik Politikası'nı kabul etmelisiniz.";

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

/** E-posta: yalnızca string kabul edilir; kırpılır ve küçültülür (string değilse boş → biçim hatası) */
const normEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/**
 * Kayıt: önce POST /send-code ile e-postaya 6 haneli kod, sonra POST /register ile kod doğrulanıp hesap açılır.
 * mailer.sendVerificationCode(to, code) — bkz. server/mailer.js
 */
/**
 * limits: app.js'te kurulan hız sınırlayıcıları { login, register, sendCode, session, oauth } (testlerde boş geçiş).
 * writeLimit: hesap/cihaz değiştiren uçlar (çıkış, cihaz iptali) için.
 */
const pass = (_req, _res, next) => next();
export function authRoutes(db, secret, { limits = {}, writeLimit = pass, mailer, google = null }) {
  const r = asyncRouter();
  const L = { login: pass, register: pass, sendCode: pass, session: pass, oauth: pass, ...limits };
  r.use('/register', L.register);
  r.use('/send-code', L.sendCode);
  r.use('/login', L.login);
  r.use(['/refresh', '/logout', '/logout-all', '/devices'], L.session);
  r.use('/google', L.oauth);
  r.param('id', intIdParam);
  const devices = createDeviceStore(db, secret);
  /** Erişim belirteci her zaman bir oturum kaydına (did) bağlıdır: kayıt iptal edilince belirteç de geçersiz olur */
  const respond = (res, status, user, deviceId) =>
    res.status(status).json({ token: signToken({ id: user.id, role: user.role, did: deviceId }, secret), user: publicUser(user) });

  /**
   * Başarılı OTP'li kayıt / girişten sonra sunucu tarafı oturum kaydı + HttpOnly çerez.
   * "Bu cihazı hatırla" açıksa (varsayılan) 90 günlük kalıcı çerez; kapalıysa tarayıcı kapanınca silinen oturum çerezi
   * ve 1 günlük kayıt. Her iki durumda da çıkış yapınca kayıt sunucuda iptal edilir.
   */
  async function startSession(req, res, status, user) {
    const persistent = req.body?.remember !== false;
    const device = await devices.issue(user.id, req.get('user-agent'), { persistent });
    setDeviceCookie(req, res, device.token, { persistent });
    return respond(res, status, user, device.id);
  }

  /** Bu isteğin cihazı: önce erişim belirtecindeki did, yoksa çerezdeki token */
  async function currentDeviceId(req) {
    if (req.auth?.deviceId) return req.auth.deviceId;
    return (await devices.find(readDeviceToken(req)))?.id ?? null;
  }
  // Kod düz metin saklanmaz; e-postaya bağlı HMAC
  const codeHash = (email, code) => createHmac('sha256', secret).update(`email-code:${email}:${code}`).digest('hex');

  /** Biçim (400) ve benzersizlik (409, büyük/küçük harf duyarsız) kontrolleri: [durum, mesaj, alan] ya da null */
  const usernameError = async (username) => {
    if (!USERNAME_RE.test(username)) return [400, USERNAME_INVALID, 'username'];
    const c = await identityConflict(db, { username });
    return c && [c.status, c.error, c.field];
  };
  const emailError = async (email) => {
    if (!isEmail(email)) return [400, 'Geçerli bir e-posta adresi girin.', 'email'];
    const c = await identityConflict(db, { email });
    return c && [c.status, c.error, c.field];
  };
  const fail = (res, err) => res.status(err[0]).json({ error: err[1], ...(err[2] ? { field: err[2] } : {}) });

  r.post('/send-code', async (req, res) => {
    const email = normEmail(req.body?.email);
    const username = req.body?.username === undefined ? null : (cleanText(req.body.username) ?? '');
    const err = (await emailError(email)) ?? (username !== null ? await usernameError(username) : null);
    if (err) return fail(res, err);

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
    const username = cleanText(req.body?.username) ?? '';
    const email = normEmail(req.body?.email);
    const password = req.body?.password;
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const err = (await emailError(email)) ?? (await usernameError(username));
    if (err) return fail(res, err);
    // Hizmet Şartları + Gizlilik Politikası onayı zorunlu (kod tüketilmeden önce denetlenir)
    if (req.body?.acceptTerms !== true) return res.status(400).json({ error: TERMS_REQUIRED, field: 'terms' });
    if (!validPassword(password)) return res.status(400).json({ error: PASSWORD_LENGTH, field: 'password' });
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

    const now = new Date().toISOString();
    // Kod tüketimi ve hesap oluşturma tek işlemde; aynı anda başkası aynı adı/e-postayı aldıysa UNIQUE indeks yakalar
    let created;
    try {
      [, created] = await db.batch([
        ['DELETE FROM email_codes WHERE email = ?', [email]],
        [`INSERT INTO users (username, username_key, display_name, email, email_key, email_verified, password_hash, role, created_at,
            terms_accepted_at, terms_version)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`, [
          username, usernameKey(username), username, email, emailKey(email), hashPassword(password), 'user', now, now, LEGAL_VERSION,
        ]],
      ]);
    } catch (e) {
      const c = conflictFromDbError(e);
      if (c) return res.status(c.status).json({ error: c.error, field: c.field });
      throw e;
    }
    const lastId = created.lastId;
    // OTP doğrulandı: bu cihaz güvenilir olur (sonraki açılışlarda giriş ekranı gelmez)
    await startSession(req, res, 201, { id: lastId, username, role: 'user', display_name: username, avatar_url: null });
  });

  r.post('/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || !username.trim() || username.length > 254 || typeof password !== 'string' || !password || password.length > PASSWORD_MAX) {
      return res.status(400).json({ error: 'Kullanıcı adı (ya da e-posta) ve şifrenizi girin.' });
    }
    const login = username.trim();
    const user = await db.get('SELECT * FROM users WHERE username_key = ? OR email_key = ?', [usernameKey(login), emailKey(login)]);
    // Hesap yoksa da aynı süre harcanır: yanıt süresinden kayıtlı kullanıcı adı/e-posta çıkarılamaz
    const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    await startSession(req, res, 200, user);
  });

  r.get('/me', requireUser, (req, res) => res.json({ user: req.user }));

  // ---------------------------------------------------------------- Google ile giriş
  const googleAuth = google ? createGoogleAuth(google, secret) : null;
  /** Arayüz Google butonunu yalnızca yapılandırılmışsa gösterir */
  r.get('/providers', (_req, res) => res.json({ google: Boolean(googleAuth) }));

  r.get('/google', (req, res) => {
    if (!googleAuth) return res.redirect(302, '/?auth_error=google_disabled');
    // terms=1: kullanıcı arayüzde Hizmet Şartları/Gizlilik Politikası'nı kabul etti (yeni hesap için zorunlu)
    res.redirect(302, googleAuth.begin(req, res, { terms: req.query.terms === '1' }));
  });

  /**
   * Google hesabı → kullanıcı: önce google_id, sonra doğrulanmış e-posta ile mevcut hesaba bağlanır; yoksa yeni hesap
   * (Google adından çakışmayan kullanıcı adı). E-postası doğrulanmamış eski bir hesaba bağlanırken, o adresle daha önce
   * başkasının açmış olabileceği hesaba karşı (ön ele geçirme) önceki şifre ve tüm oturumlar iptal edilir.
   */
  async function googleUser(p, { termsAccepted = false } = {}) {
    const now = new Date().toISOString();
    // Mevcut hesap şartları bu girişte kabul ettiyse (henüz kaydı yoksa) kabul anı yazılır
    const recordTerms = (u) => (termsAccepted && !u.terms_accepted_at
      ? [['UPDATE users SET terms_accepted_at = ?, terms_version = ? WHERE id = ?', [now, LEGAL_VERSION, u.id]]] : []);
    const bySub = await db.get('SELECT * FROM users WHERE google_id = ?', [p.sub]);
    if (bySub) {
      const stmts = recordTerms(bySub);
      if (stmts.length) await db.batch(stmts);
      return { user: bySub, created: false };
    }
    const byEmail = await db.get('SELECT * FROM users WHERE email_key = ?', [emailKey(p.email)]);
    if (byEmail) {
      if (byEmail.google_id) throw new OAuthError('account_conflict', 'e-posta başka bir Google hesabına bağlı');
      const stmts = [['UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?', [p.sub, byEmail.id]], ...recordTerms(byEmail)];
      if (!byEmail.email_verified) {
        console.warn(`[google] doğrulanmamış e-postalı hesap (id=${byEmail.id}) Google'a bağlandı: önceki şifre ve oturumlar iptal edildi`);
        stmts.push(
          ['UPDATE users SET password_hash = ?, tokens_valid_after = ? WHERE id = ?', [`oauth$${randomBytes(16).toString('hex')}`, now, byEmail.id]],
          devices.revokeAllStmt(byEmail.id),
        );
      }
      await db.batch(stmts);
      return { user: byEmail, created: false };
    }
    // Yeni hesap: şartların kabulü zorunlu (arayüz terms=1 ile başlatır; kabul edilmemişse hesap açılmaz)
    if (!termsAccepted) throw new OAuthError('terms_required', 'yeni hesap için şartlar kabul edilmedi');
    for (let attempt = 0; ; attempt++) {
      const username = await uniqueUsername(db, usernameBase(p.name, p.email));
      try {
        const { lastId } = await db.run(
          `INSERT INTO users (username, username_key, display_name, email, email_key, email_verified, google_id, avatar_url, password_hash, role,
             created_at, terms_accepted_at, terms_version)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'user', ?, ?, ?)`,
          [username, usernameKey(username), (p.name ?? username).slice(0, 40), emailKey(p.email), emailKey(p.email), p.sub, p.picture,
            `oauth$${randomBytes(16).toString('hex')}`, now, now, LEGAL_VERSION], // şifreyle giriş yok (yalnızca Google)
        );
        return { user: await db.get('SELECT * FROM users WHERE id = ?', [lastId]), created: true };
      } catch (e) {
        // Aynı anda aynı adı başkası aldıysa yeni adla bir kez daha dene
        if (attempt === 0 && conflictFromDbError(e)?.field === 'username') continue;
        if (conflictFromDbError(e)) throw new OAuthError('account_conflict', e.message);
        throw e;
      }
    }
  }

  r.get('/google/callback', async (req, res) => {
    const back = (code) => res.redirect(302, `/?auth_error=${code}`);
    if (!googleAuth) return back('google_disabled');
    const q = (k) => (typeof req.query[k] === 'string' && req.query[k].length <= 2048 ? req.query[k] : '');
    const flow = googleAuth.consume(req, q('state'));
    googleAuth.clearCookie(req, res);
    if (!flow) return back('state');
    if (req.query.error) return back(req.query.error === 'access_denied' ? 'cancelled' : 'google');
    try {
      const profile = await googleAuth.exchange(q('code'), flow);
      const { user, created } = await googleUser(profile, { termsAccepted: flow.t === 1 });
      // Mevcut güvenilir cihaz mekanizması: uygulama bu çerezle sessizce oturum açar (belirteç URL'de taşınmaz)
      const device = await devices.issue(user.id, req.get('user-agent'));
      setDeviceCookie(req, res, device.token);
      res.redirect(302, `/?auth=google${created ? '&new=1' : ''}`);
    } catch (e) {
      if (!(e instanceof OAuthError)) throw e;
      console.warn(`[google] giriş başarısız kod=${e.code}: ${e.message}`);
      back(e.code);
    }
  });

  /**
   * Sessiz oturum tazeleme: güvenilir cihaz çereziyle yeni erişim belirteci. Uygulama açılışında ya da belirteç
   * süresi dolunca istemci çağırır. Çerez yok/geçersiz/iptal/süresi dolmuş → 401 (istemci standart girişe düşer).
   */
  r.post('/refresh', async (req, res) => {
    const token = readDeviceToken(req);
    const device = await devices.find(token);
    const user = device && (await db.get('SELECT * FROM users WHERE id = ?', [device.user_id]));
    if (!device || !user) {
      // Geçersiz, bozuk ya da süresi dolmuş çerez temizlenir (istemci standart girişe düşer)
      if (token || parseCookies(req.headers.cookie)[DEVICE_COOKIE] !== undefined) clearDeviceCookie(req, res);
      return res.status(401).json({ error: 'Oturum yenilenemedi. Lütfen giriş yapın.' });
    }
    await devices.touch(device);
    setDeviceCookie(req, res, token, { persistent: device.persistent !== 0 }); // çerez süresi de kayar
    respond(res, 200, user, device.id);
  });

  /** Bu cihazdan çıkış: yalnızca bu cihazın güvenilir kaydı iptal edilir (diğer cihazlar etkilenmez) */
  r.post('/logout', writeLimit, async (req, res) => {
    const id = await currentDeviceId(req);
    if (id) await devices.revoke(id);
    clearDeviceCookie(req, res);
    res.status(204).end();
  });

  /** Tüm cihazlardan çıkış: tüm güvenilir cihazlar iptal + daha önce verilmiş tüm erişim belirteçleri geçersiz */
  r.post('/logout-all', writeLimit, requireUser, async (req, res) => {
    await db.batch([devices.revokeAllStmt(req.user.id), ['UPDATE users SET tokens_valid_after = ? WHERE id = ?', [new Date().toISOString(), req.user.id]]]);
    clearDeviceCookie(req, res);
    res.status(204).end();
  });

  /** Güvenilir cihazlarım (bu cihaz işaretli); token özeti ve ham user-agent dönmez */
  r.get('/devices', requireUser, async (req, res) => {
    const current = await currentDeviceId(req);
    const rows = await devices.list(req.user.id);
    res.json(rows.map((d) => ({
      id: d.id, label: d.device_label, createdAt: d.created_at, lastUsedAt: d.last_used_at, expiresAt: d.expires_at,
      remembered: d.persistent !== 0, current: d.id === current,
    })));
  });

  /** Tek cihazı iptal (yalnızca kendi cihazları); o cihazın erişim belirteci de hemen geçersizleşir */
  r.delete('/devices/:id', writeLimit, requireUser, async (req, res) => {
    const changes = await devices.revoke(Number(req.params.id), req.user.id);
    res.status(changes ? 204 : 404).end();
  });
  return r;
}
