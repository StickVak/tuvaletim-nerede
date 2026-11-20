import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { LEGAL_VERSION, legalContact } from '../legal.js';
import { TERMS_REQUIRED } from '../routes/auth.js';

test('iletişim adresi: CONTACT_EMAIL, yoksa MAIL_FROM gönderen adresi, ikisi de yoksa null', () => {
  assert.equal(legalContact({ CONTACT_EMAIL: 'destek@ornek.com', MAIL_FROM: 'X <no@ornek.com>' }), 'destek@ornek.com');
  assert.equal(legalContact({ MAIL_FROM: 'Tuvaletim Nerede <bildirim@ornek.com>' }), 'bildirim@ornek.com');
  assert.equal(legalContact({ CONTACT_EMAIL: 'geçersiz' }), null);
  assert.equal(legalContact({}), null);
});

test('Gizlilik Politikası ve Hizmet Şartları: herkese açık düz HTML (JS gerekmez), iletişim adresi kaçışlı, kısa adresler yönlendirir', async () => {
  const srv = await startServer({ contactEmail: 'destek@ornek.com' });
  try {
    for (const [path, title, must] of [
      ['/gizlilik-politikasi', 'Gizlilik Politikası', ['KVKK', 'Sınırlı Kullanım', 'openid', 'Cloudinary', 'tn_device', 'Hizmet Şartları']],
      ['/hizmet-sartlari', 'Hizmet Şartları', ['olduğu gibi', 'Gizlilik Politikası', 'Türkiye Cumhuriyeti', 'dış cephesini']],
    ]) {
      const res = await fetch(srv.url + path);
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get('content-type'), /text\/html/);
      const html = await res.text();
      assert.match(html, new RegExp(`<title>${title} · `));
      assert.match(html, /<html lang="tr">/);
      assert.ok(!/<script/i.test(html), 'betik yok');
      assert.ok(html.includes('mailto:destek@ornek.com'), 'iletişim adresi');
      for (const m of must) assert.ok(html.includes(m), `${path}: "${m}"`);
    }
    for (const [from, to] of [['/privacy', '/gizlilik-politikasi'], ['/terms', '/hizmet-sartlari']]) {
      const res = await fetch(srv.url + from, { redirect: 'manual' });
      assert.equal(res.status, 301);
      assert.equal(res.headers.get('location'), to);
    }
  } finally {
    srv.close();
  }
});

test('iletişim adresi HTML kaçışlıdır; tanımlı değilse sayfa yine açılır', async () => {
  const srv = await startServer({ contactEmail: null });
  try {
    const html = await (await fetch(srv.url + '/gizlilik-politikasi')).text();
    assert.ok(!html.includes('mailto:'));
    assert.match(html, /Gizlilik Politikası/);
  } finally {
    srv.close();
  }
});

test('kayıt: şartlar kabul edilmeden hesap açılmaz (kod tüketilmez); kabul edilince anı ve sürümü kaydedilir', async () => {
  const srv = await startServer();
  try {
    const email = 'sartlar@example.com';
    assert.equal((await srv.req('POST', '/api/auth/send-code', { email, username: 'sartci' })).status, 200);
    const code = srv.lastCode(email);
    for (const acceptTerms of [undefined, false, 'true', 1]) {
      const r = await srv.req('POST', '/api/auth/register', { username: 'sartci', email, password: 'secret1', code, acceptTerms });
      assert.equal(r.status, 400, String(acceptTerms));
      assert.equal(r.body.error, TERMS_REQUIRED);
      assert.equal(r.body.field, 'terms');
    }
    assert.equal((await srv.db.get('SELECT COUNT(*) AS n FROM users')).n, 0);
    const ok = await srv.req('POST', '/api/auth/register', { username: 'sartci', email, password: 'secret1', code, acceptTerms: true });
    assert.equal(ok.status, 201, 'aynı kod hâlâ geçerli');
    const u = await srv.db.get("SELECT terms_accepted_at, terms_version FROM users WHERE username = 'sartci'");
    assert.ok(Math.abs(Date.parse(u.terms_accepted_at) - Date.now()) < 60_000);
    assert.equal(u.terms_version, LEGAL_VERSION);
  } finally {
    srv.close();
  }
});
