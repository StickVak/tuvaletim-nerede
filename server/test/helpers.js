import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';

export const SECRET = 'test-secret';
export const ADMIN_KEY = 'test-admin-key-1234567890';

/** Geçici veritabanıyla uygulamayı rastgele portta başlatır. */
export async function startServer({ seed = [], limits = false, adminKey = ADMIN_KEY } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tn-test-'));
  const seedFile = join(dir, 'seed.json');
  writeFileSync(seedFile, JSON.stringify(seed));
  /** Sahte posta kutusu: gönderilen doğrulama kodları */
  const outbox = [];
  const mailer = { kind: 'test', sendVerificationCode: async (to, code) => void outbox.push({ to, code }) };
  const app = await createApp({
    mailer,
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
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  /** Son gönderilen doğrulama kodu */
  const lastCode = (email) => [...outbox].reverse().find((m) => m.to === email.toLowerCase())?.code;

  /** Kod iste + kodla kayıt ol (OTP akışı) */
  async function registerFull(username, password = 'secret1', email = `${username.toLowerCase()}@test.local`) {
    const sent = await req('POST', '/api/auth/send-code', { email, username });
    if (sent.status !== 200) throw new Error(`send-code ${sent.status}: ${sent.body?.error}`);
    const r = await req('POST', '/api/auth/register', { username, email, password, code: lastCode(email) });
    if (r.status !== 201) throw new Error(`register ${r.status}: ${r.body?.error}`);
    return { token: r.body.token, user: r.body.user };
  }

  async function register(username, password = 'secret1') {
    return (await registerFull(username, password)).token;
  }

  /** Yönetim API'si: X-Admin-Key başlığıyla (key verilmezse sunucunun anahtarı) */
  const admin = (method, path, body, key = adminKey) => req(method, path, body, null, key ? { 'X-Admin-Key': key } : {});

  return {
    url,
    req,
    register,
    outbox,
    lastCode,
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
