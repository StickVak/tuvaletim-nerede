/**
 * Esnek e-posta servisi (öncelik sırası):
 *   1) RESEND_API_KEY  → Resend HTTP API
 *   2) SMTP_HOST + SMTP_USER + SMTP_PASS → Nodemailer (SMTP_PORT, varsayılan 587; 465 ise TLS)
 *   3) hiçbiri yoksa   → kod sunucu konsoluna yazılır (yerel geliştirme)
 * Gönderen adresi: MAIL_FROM (Resend için doğrulanmış alan adı gerekir).
 */
import nodemailer from 'nodemailer';

const APP = 'Tuvaletim Nerede?';

function verificationMessage(code) {
  const subject = `${APP} doğrulama kodunuz: ${code}`;
  const text = `${APP} hesabınızı oluşturmak için doğrulama kodunuz:\n\n${code}\n\nKod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.`;
  const html = `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1A1A1A">
  <h2 style="margin:0 0 8px">${APP}</h2>
  <p style="margin:0 0 16px">Hesabınızı oluşturmak için doğrulama kodunuz:</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:8px;background:#FFD60A;border-radius:14px;padding:14px 0;text-align:center;margin:0 0 16px">${code}</p>
  <p style="color:#666;font-size:13px;margin:0">Kod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>
</div>`;
  return { subject, text, html };
}

/**
 * @param env process.env benzeri nesne
 * @param deps testler için: fetchImpl, createTransport, log
 */
export function createMailer(env = process.env, { fetchImpl = fetch, createTransport = nodemailer.createTransport, log = console.log } = {}) {
  if (env.RESEND_API_KEY) {
    const from = env.MAIL_FROM || `${APP} <onboarding@resend.dev>`;
    return {
      kind: 'resend',
      async sendVerificationCode(to, code) {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], ...verificationMessage(code) }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      },
    };
  }

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    const port = Number(env.SMTP_PORT) || 587;
    const transport = createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 15000,
    });
    const from = env.MAIL_FROM || env.SMTP_USER;
    return {
      kind: 'smtp',
      async sendVerificationCode(to, code) {
        await transport.sendMail({ from, to, ...verificationMessage(code) });
      },
    };
  }

  return {
    kind: 'console',
    async sendVerificationCode(to, code) {
      log(`[mail] ${to} için doğrulama kodu: ${code}  (e-posta servisi yapılandırılmadı; RESEND_API_KEY ya da SMTP_* ekleyin)`);
    },
  };
}
