import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer } from '../mailer.js';

test('RESEND_API_KEY varsa Resend API kullanılır', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  };
  const m = createMailer({ RESEND_API_KEY: 're_test', MAIL_FROM: 'Tuvaletim <noreply@ornek.com>', SMTP_HOST: 'smtp.x' }, { fetchImpl });
  assert.equal(m.kind, 'resend');
  await m.sendVerificationCode('ali@example.com', '123456');
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ['ali@example.com']);
  assert.equal(body.from, 'Tuvaletim <noreply@ornek.com>');
  assert.match(body.text, /123456/);
  assert.match(body.html, /123456/);
});

test('Resend hata dönerse gönderim hata fırlatır', async () => {
  const m = createMailer({ RESEND_API_KEY: 're_test' }, { fetchImpl: async () => new Response('{"message":"bad"}', { status: 422 }) });
  await assert.rejects(() => m.sendVerificationCode('ali@example.com', '123456'), /Resend/);
});

test('SMTP_HOST/USER/PASS varsa Nodemailer kullanılır', async () => {
  const sent = [];
  const createTransport = (opts) => {
    assert.equal(opts.host, 'smtp.ornek.com');
    assert.equal(opts.port, 465);
    assert.equal(opts.secure, true);
    assert.deepEqual(opts.auth, { user: 'u@ornek.com', pass: 'p' });
    return { sendMail: async (msg) => void sent.push(msg) };
  };
  const m = createMailer({ SMTP_HOST: 'smtp.ornek.com', SMTP_PORT: '465', SMTP_USER: 'u@ornek.com', SMTP_PASS: 'p' }, { createTransport });
  assert.equal(m.kind, 'smtp');
  await m.sendVerificationCode('ali@example.com', '654321');
  assert.equal(sent[0].to, 'ali@example.com');
  assert.equal(sent[0].from, 'u@ornek.com');
  assert.match(sent[0].text, /654321/);
});

test('yapılandırma yoksa kod sunucu konsoluna yazılır', async () => {
  const lines = [];
  const m = createMailer({}, { log: (s) => lines.push(s) });
  assert.equal(m.kind, 'console');
  await m.sendVerificationCode('ali@example.com', '111222');
  assert.ok(lines.some((l) => l.includes('ali@example.com') && l.includes('111222')));
});

test('eksik SMTP bilgisi konsola düşer', () => {
  assert.equal(createMailer({ SMTP_HOST: 'smtp.x' }).kind, 'console');
});
