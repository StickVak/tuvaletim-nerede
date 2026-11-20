import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { resolveAdminKey, resolveSecret } from './secret.js';
import { createMailer } from './mailer.js';
import { cloudinaryConfig } from './photos.js';
import { CALLBACK_PATH, googleConfig } from './google.js';
import { legalContact, PRIVACY_PATH, TERMS_PATH } from './legal.js';

try {
  process.loadEnvFile();
} catch {
  /* .env yoksa varsayılanlar kullanılır */
}

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const { secret, generated } = resolveSecret(process.env.AUTH_SECRET, here('./data'));
if (generated) console.warn('[api] AUTH_SECRET tanımlı değil (ya da örnek değer); rastgele bir anahtar üretilip server/data/.auth-secret dosyasına kaydedildi.');

const { key: adminKey, generated: adminKeyGenerated } = resolveAdminKey(process.env.ADMIN_SECRET_KEY, here('./data'));
if (adminKeyGenerated) console.warn('[api] ADMIN_SECRET_KEY tanımlı değil; yönetici anahtarı üretilip server/data/.admin-key dosyasına kaydedildi (admin paneline bu anahtarla girin).');

// E-posta sağlayıcısı: BREVO_API_KEY → RESEND_API_KEY → SMTP_* → konsol (seçim ve nedeni loglanır)
const mailer = createMailer(process.env);
if (mailer.configError) console.error(`[mail] e-posta servisi: ${mailer.summary} — kayıt kodları gönderilemez: ${mailer.configError}`);
else if (mailer.kind === 'console') console.warn(`[mail] e-posta servisi: ${mailer.summary}`);
else console.log(`[mail] e-posta servisi: ${mailer.summary}`);

// Kalıcı depolama: TURSO_DATABASE_URL varsa Turso, yoksa yerel SQLite; CLOUDINARY_* varsa Cloudinary, yoksa yerel disk
const dbUrl = process.env.TURSO_DATABASE_URL || undefined;
const cloudinary = cloudinaryConfig(process.env);
console.log(`[db] ${dbUrl ? `Turso (${new URL(dbUrl).host})` : 'yerel SQLite: server/data/tuvaletim.db'}`);
console.log(`[foto] ${cloudinary ? `Cloudinary (${cloudinary.cloudName})` : 'yerel disk: server/data/photos'}`);
if (process.env.RENDER && (!dbUrl || !cloudinary)) {
  console.warn('[uyarı] Render ücretsiz planında yerel disk kalıcı değildir: TURSO_* ve CLOUDINARY_* değişkenlerini tanımlayın.');
}

// Google ile giriş: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET; callback GOOGLE_REDIRECT_URI ya da APP_URL'den türetilir
const google = googleConfig(process.env);
console.log(
  google
    ? `[google] Google ile giriş açık — callback: ${google.redirectUri ?? `(istekten türetilir) https://<alan-adı>${CALLBACK_PATH}`}`
    : '[google] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanımlı değil: "Google ile Giriş Yap" butonu gizli',
);

const contactEmail = legalContact(process.env);
console.log(
  contactEmail
    ? `[legal] ${PRIVACY_PATH} ve ${TERMS_PATH} yayında — iletişim: ${contactEmail}`
    : `[legal] UYARI: CONTACT_EMAIL (ya da MAIL_FROM) tanımlı değil; ${PRIVACY_PATH} ve ${TERMS_PATH} sayfalarında iletişim e-postası yok`,
);

const app = await createApp({
  mailer,
  contactEmail,
  google,
  dbPath: here('./data/tuvaletim.db'),
  dbUrl,
  dbAuthToken: process.env.TURSO_AUTH_TOKEN,
  dataDir: here('./data'),
  cloudinary,
  seedFile: here('./seed-places.json'),
  secret,
  adminKey,
});

// Render gibi bir ters vekil arkasında gerçek istemci IP'si (hız sınırı için), ör. TRUST_PROXY=1
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
}

// Üretim: `npm run build` çıktısını (dist/) aynı sunucudan yayınla.
// /api dışındaki her GET isteği index.html'e düşer (React yönlendirmesi). Yönetim paneli ayrı servistir (admin/).
const distDir = here('../dist');
if (existsSync(distDir)) {
  const indexHtml = here('../dist/index.html');
  app.use('/assets', express.static(here('../dist/assets'), { immutable: true, maxAge: '1y' }));
  app.use('/assets', (_req, res) => res.sendStatus(404)); // eksik JS/CSS için HTML döndürme
  app.use(express.static(distDir));
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => res.sendFile(indexHtml));
  console.log('[web] dist/ klasörü sunuluyor');
}

app.listen(PORT, () => console.log(`[api] http://localhost:${PORT}`));
