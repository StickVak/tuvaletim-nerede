import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './helpers.js';
import { openDb } from '../db.js';
import { emailKey, usernameKey } from '../identity.js';

const EMAIL_TAKEN = 'Bu e-posta adresiyle zaten bir hesap mevcut. Lütfen giriş yapın.';
const USERNAME_TAKEN = 'Bu kullanıcı adı daha önce alınmış. Lütfen farklı bir kullanıcı adı seçin.';

let srv;
before(async () => {
  srv = await startServer();
});
after(() => srv.close());

const send = (email, username) => srv.req('POST', '/api/auth/send-code', { email, ...(username !== undefined ? { username } : {}) });

test('anahtarlar: kırpılmış, Türkçe harflerde de büyük/küçük duyarsız; I/İ/ı/i tek harf (taklit adlar engellenir)', () => {
  assert.equal(usernameKey('  Mehmet '), 'mehmet');
  assert.equal(usernameKey('ÇAĞRI'), usernameKey('çağrı'));
  assert.equal(usernameKey('İrem'), 'irem');
  assert.equal(usernameKey('IREM'), 'irem', 'ASCII büyük I ile yazan da aynı hesaba ulaşır');
  assert.equal(usernameKey('IŞIK'), usernameKey('ışık'));
  assert.equal(usernameKey('alı'), usernameKey('ali'), 'benzer görünen adlar aynı anahtar');
  assert.equal(emailKey('  Ali.Veli@Example.COM '), 'ali.veli@example.com');
  assert.equal(emailKey(''), null);
});

test('aynı e-posta (büyük/küçük harf, boşluk farkıyla) → 409 ve istenen mesaj; kod gönderilmez', async () => {
  await srv.registerFull('ilkkullanici', 'secret1', 'Ilk.Kullanici@Example.com');
  const before = srv.outbox.length;
  for (const email of ['ilk.kullanici@example.com', '  ILK.KULLANICI@EXAMPLE.COM  ']) {
    const r = await send(email, 'baskaadi');
    assert.equal(r.status, 409);
    assert.equal(r.body.error, EMAIL_TAKEN);
    assert.equal(r.body.field, 'email');
  }
  assert.equal(srv.outbox.length, before);
});

test('aynı kullanıcı adı (ASCII ve Türkçe harflerde büyük/küçük farkı, boşluk) → 409 ve istenen mesaj', async () => {
  await srv.registerFull('Çağrı');
  for (const username of ['çağrı', 'ÇAĞRI', '  Çağrı  ']) {
    const r = await send(`yeni${Math.random().toString(36).slice(2, 7)}@example.com`, username);
    assert.equal(r.status, 409, username);
    assert.equal(r.body.error, USERNAME_TAKEN);
    assert.equal(r.body.field, 'username');
  }
  await srv.registerFull('mehmet');
  assert.equal((await send('mehmet2@example.com', 'MEHMET')).body.error, USERNAME_TAKEN);
});

test('kayıt adımında da (kod doğrulanırken) çakışma engellenir: arada başkası almışsa hesap açılmaz', async () => {
  await send('yaris@example.com', 'yarisci');
  const code = srv.lastCode('yaris@example.com');
  await srv.registerFull('Yarisci'); // bu arada başka biri aynı adı aldı
  const r = await srv.req('POST', '/api/auth/register', { username: 'yarisci', email: 'yaris@example.com', password: 'secret1', code, acceptTerms: true });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, USERNAME_TAKEN);
  assert.equal(await srv.db.get("SELECT 1 FROM users WHERE email_key = 'yaris@example.com'"), undefined);
});

test('veritabanı düzeyinde UNIQUE: anahtarı aynı ikinci kayıt reddedilir', async () => {
  const now = new Date().toISOString();
  await assert.rejects(() =>
    srv.db.run("INSERT INTO users (username, username_key, password_hash, role, created_at) VALUES ('MEHMET_', 'mehmet', 'x', 'user', ?)", [now]),
  );
  await assert.rejects(() =>
    srv.db.run("INSERT INTO users (username, username_key, email, email_key, password_hash, role, created_at) VALUES ('farkli', 'farkli', 'X@Y.co', 'ilk.kullanici@example.com', 'x', 'user', ?)", [now]),
  );
});

test('giriş: kullanıcı adı ve e-posta büyük/küçük harf duyarsız', async () => {
  assert.equal((await srv.req('POST', '/api/auth/login', { username: 'ÇAĞRI', password: 'secret1' })).status, 200);
  assert.equal((await srv.req('POST', '/api/auth/login', { username: 'ILK.KULLANICI@EXAMPLE.COM', password: 'secret1' })).status, 200);
});

test('profil: kullanıcı adı güncelleme — alınmışsa 409 ve istenen mesaj; kendi adının harf değişimi serbest; geçersizse 400', async () => {
  const { token } = await srv.registerFull('degistiren');
  const taken = await srv.req('PATCH', '/api/profile', { username: 'MEHMET' }, token);
  assert.equal(taken.status, 409);
  assert.equal(taken.body.error, USERNAME_TAKEN);
  assert.equal(taken.body.field, 'username');
  const self = await srv.req('PATCH', '/api/profile', { username: 'Degistiren' }, token);
  assert.equal(self.status, 200);
  assert.equal(self.body.user.username, 'Degistiren');
  assert.equal((await srv.req('PATCH', '/api/profile', { username: 'a b' }, token)).status, 400);
  const ok = await srv.req('PATCH', '/api/profile', { username: 'yeni.ad' }, token);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.username, 'yeni.ad');
  assert.equal((await srv.req('POST', '/api/auth/login', { username: 'YENI.AD', password: 'secret1' })).status, 200);
  assert.equal((await send('x1@example.com', 'degistiren')).status, 200, 'eski ad serbest kaldı');
});

test('eski veritabanı: anahtarlar açılışta doldurulur; çakışan eski kayıtlar sunucuyu düşürmez', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tn-uniq-'));
  const db = await openDb(join(dir, 'x.db'));
  // Eski sürüm: anahtar sütunları boş; ASCII NOCASE'in kaçırdığı Türkçe çakışma
  await db.run("INSERT INTO users (username, email, password_hash, role, created_at) VALUES ('Çağrı', 'A@B.co', 'x', 'user', '2026-01-01')");
  await db.run("INSERT INTO users (username, email, password_hash, role, created_at) VALUES ('çağrı', NULL, 'x', 'user', '2026-01-02')");
  await db.run('UPDATE users SET username_key = NULL, email_key = NULL');
  db.close();
  const db2 = await openDb(join(dir, 'x.db'));
  const rows = await db2.all('SELECT username, username_key, email_key FROM users ORDER BY id');
  assert.equal(rows[0].username_key, usernameKey('Çağrı'));
  assert.equal(rows[0].email_key, 'a@b.co');
  assert.notEqual(rows[1].username_key, usernameKey('Çağrı'), 'çakışan ikinci kayıt ayrı anahtar alır');
});
