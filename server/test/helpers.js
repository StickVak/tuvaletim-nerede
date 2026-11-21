import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';
import { signToken } from '../auth.js';
import { createDeviceStore } from '../devices.js';

export const SECRET = 'test-secret';
export const ADMIN_KEY = 'test-admin-key-1234567890';

/** Geçici veritabanıyla uygulamayı rastgele portta başlatır. */
/** mailer: gerçek bir createMailer() örneği verilebilir (ör. sahte fetch'li Brevo); verilmezse sahte posta kutusu */
export async function startServer({ seed = [], limits = false, adminKey = ADMIN_KEY, cloudinary = null, mailer: customMailer = null, google = null, contactEmail = null, ...appOptions } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tn-test-'));
  const seedFile = join(dir, 'seed.json');
  writeFileSync(seedFile, JSON.stringify(seed));
  /** Sahte posta kutusu: gönderilen doğrulama kodları */
  const outbox = [];
  /** Gönderilen şifre sıfırlama kodları */
  const resetOutbox = [];
  /** failMail(hata): sıradaki gönderim bu hatayla başarısız olur (kod yine de 'gönderilmiş' sayılabilir: deliveredAnyway) */
  const failures = [];
  const mailer = {
    kind: 'test',
    sendPasswordResetCode: async (to, code) => {
      const f = failures.shift();
      if (f) throw f.error;
      resetOutbox.push({ to, code });
    },
    sendVerificationCode: async (to, code) => {
      const f = failures.shift();
      if (f) {
        if (f.deliveredAnyway) outbox.push({ to, code }); // zaman aşımı oldu ama e-posta aslında ulaştı
        throw f.error;
      }
      outbox.push({ to, code });
    },
  };
  const app = await createApp({
    mailer: customMailer ?? mailer,
    google,
    contactEmail,
    ...appOptions,
    cloudinary,
    dbPath: join(dir, 'test.db'),
    secret: SECRET,
    seedFile,
    adminKey,
    limits,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  async function req(method, path, body, token, headers = {}) {
    const res = await fetch(url + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  }

  /** Son gönderilen doğrulama kodu */
  const lastCode = (email) => [...outbox].reverse().find((m) => m.to === email.toLowerCase())?.code;

  /** Kod iste + kodla kayıt ol (OTP akışı) */
  /** Varsayılan e-posta: kullanıcı adından ASCII (Türkçe harfli adlarda ayırt edici onaltılık ek) */
  const defaultEmail = (username) => {
    const ascii = username.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    return ascii === username.toLowerCase() ? `${ascii}@test.local` : `${ascii}-${Buffer.from(username).toString('hex').slice(0, 24)}@test.local`;
  };

  async function registerFull(username, password = 'secret1', email = defaultEmail(username)) {
    const sent = await req('POST', '/api/auth/send-code', { email, username });
    if (sent.status !== 200) throw new Error(`send-code ${sent.status}: ${sent.body?.error}`);
    const r = await req('POST', '/api/auth/register', { username, email, password, code: lastCode(email), acceptTerms: true });
    if (r.status !== 201) throw new Error(`register ${r.status}: ${r.body?.error}`);
    return { token: r.body.token, user: r.body.user };
  }

  async function register(username, password = 'secret1') {
    return (await registerFull(username, password)).token;
  }

  /** Yönetim API'si: X-Admin-Key başlığıyla (key verilmezse sunucunun anahtarı) */
  const admin = (method, path, body, key = adminKey) => req(method, path, body, null, key ? { 'X-Admin-Key': key } : {});

  /** Oturum kaydı açıp erişim belirteci üretir (API'den geçmeden; hız sınırı testleri için) */
  async function tokenFor(userId) {
    const { id } = await createDeviceStore(app.locals.db, SECRET).issue(userId, 'test');
    return signToken({ id: userId, role: 'user', did: id }, SECRET);
  }

  return {
    url,
    tokenFor,
    req,
    register,
    outbox,
    resetOutbox,
    /** Son şifre sıfırlama kodu (gönderim yanıttan sonra yapıldığı için kısa süre beklenir) */
    lastResetCode: async (email) => {
      for (let i = 0; i < 50; i++) {
        const m = [...resetOutbox].reverse().find((x) => x.to.toLowerCase() === email.toLowerCase());
        if (m) return m.code;
        await new Promise((r) => setTimeout(r, 10));
      }
      return undefined;
    },
    lastCode,
    failMail: (error, { deliveredAnyway = false } = {}) => failures.push({ error, deliveredAnyway }),
    registerFull,
    admin,
    db: app.locals.db,
    dir,
    close: () => {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
