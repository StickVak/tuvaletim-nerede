/**
 * Esnek ve dayanıklı e-posta servisi (öncelik sırası):
 *   1) RESEND_API_KEY  → Resend HTTP API
 *   2) SMTP_HOST + SMTP_USER + SMTP_PASS → Nodemailer (SMTP_PORT, varsayılan 587; 465 ise TLS)
 *   3) hiçbiri yoksa   → kod sunucu konsoluna yazılır (yerel geliştirme)
 * Gönderen adresi: MAIL_FROM (Resend için doğrulanmış alan adı gerekir).
 *
 * Dayanıklılık: her deneme `timeoutMs` (varsayılan 8000 ms) ile sınırlıdır. Geçici hatalarda (zaman aşımı, ağ,
 * sağlayıcının 5xx / SMTP 4xx yanıtı) kısa bir beklemeden sonra AYNI kodla en fazla 1 kez yeniden denenir —
 * ilk e-posta geç ulaşsa bile iki e-postadaki kod aynıdır. Rate-limit ve kalıcı hatalar yeniden denenmez.
 * Hatalar MailError olarak sınıflanır; loglarda adres maskelenir, kod hiç yazılmaz.
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

/** Hata türleri: timeout | network | rate_limit | provider | config */
export class MailError extends Error {
  constructor(kind, message, { provider, retryable = false, retryAfter = null, status = null, attempts = 1, cause } = {}) {
    super(message, { cause });
    this.name = 'MailError';
    this.kind = kind;
    this.provider = provider;
    this.retryable = retryable;
    /** Sağlayıcının bildirdiği bekleme (sn), rate-limit için */
    this.retryAfter = retryAfter;
    this.status = status;
    this.attempts = attempts;
  }
}

/** ahmet@ornek.com → a***@ornek.com (loglarda kişisel veri sızmasın) */
export function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  return domain ? `${user.slice(0, 1)}***@${domain}` : '***';
}

const NETWORK_CODES = new Set(['ECONNECTION', 'ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'EDNS', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH']);
const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));

/** fn'i ms içinde bitmezse MailError(timeout) ile reddeder (zamanlayıcı her durumda temizlenir) */
function withTimeout(promise, ms, provider) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new MailError('timeout', `${provider}: ${ms} ms içinde yanıt yok`, { provider, retryable: true })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Resend fetch hatası / yanıtı → MailError */
function resendError(e) {
  if (e instanceof MailError) return e;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return new MailError('timeout', 'Resend: istek zaman aşımına uğradı', { provider: 'resend', retryable: true, cause: e });
  return new MailError('network', `Resend: ağ hatası (${e?.cause?.code ?? e?.message ?? 'bilinmiyor'})`, { provider: 'resend', retryable: true, cause: e });
}

async function resendResponseError(res) {
  const detail = (await res.text().catch(() => '')).slice(0, 200);
  const base = { provider: 'resend', status: res.status };
  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after'));
    return new MailError('rate_limit', `Resend 429: ${detail}`, { ...base, retryAfter: Number.isFinite(ra) && ra > 0 ? Math.ceil(ra) : null });
  }
  if (res.status >= 500) return new MailError('provider', `Resend ${res.status}: ${detail}`, { ...base, retryable: true });
  if (res.status === 401 || res.status === 403) return new MailError('config', `Resend ${res.status} (API anahtarı / alan adı): ${detail}`, base);
  return new MailError('provider', `Resend ${res.status}: ${detail}`, base);
}

/** Nodemailer hatası → MailError */
function smtpError(e) {
  if (e instanceof MailError) return e;
  const code = e?.code;
  const rc = Number(e?.responseCode) || 0;
  const base = { provider: 'smtp', status: rc || null, cause: e };
  if (code === 'ETIMEDOUT') return new MailError('timeout', `SMTP: zaman aşımı (${e.message})`, { ...base, retryable: true });
  if (code === 'EAUTH' || rc === 535 || rc === 534 || rc === 530) return new MailError('config', `SMTP: kimlik doğrulama hatası (${rc || code})`, base);
  if (NETWORK_CODES.has(code)) return new MailError('network', `SMTP: ağ hatası (${code})`, { ...base, retryable: true });
  if (rc === 421 || rc === 450 || rc === 451 || rc === 452 || rc === 454) return new MailError('rate_limit', `SMTP ${rc}: geçici ret (${e.message})`, { ...base, retryable: true });
  if (rc >= 500) return new MailError('provider', `SMTP ${rc}: ${e.message}`, base);
  return new MailError('provider', `SMTP: ${e?.message ?? 'bilinmeyen hata'}`, { ...base, retryable: rc >= 400 });
}

/**
 * @param env process.env benzeri nesne
 * @param deps fetchImpl, createTransport, log (konsol modunda kod çıktısı), logger (uyarı/hata),
 *             timeoutMs (deneme başına), retryDelayMs (yeniden deneme öncesi bekleme), sleep
 */
export function createMailer(
  env = process.env,
  {
    fetchImpl = fetch,
    createTransport = nodemailer.createTransport,
    log = console.log,
    logger = console,
    timeoutMs = 8000,
    retryDelayMs = 700,
    sleep = sleepFor,
  } = {},
) {
  /** En fazla 2 deneme: yalnızca retryable hatalarda, kısa beklemeyle */
  const withRetry = (provider, to, attemptFn) => async () => {
    const MAX = 2;
    for (let attempt = 1; ; attempt++) {
      try {
        return await attemptFn();
      } catch (err) {
        const e = err instanceof MailError ? err : new MailError('provider', String(err?.message ?? err), { provider, cause: err });
        e.attempts = attempt;
        const line = `[mail] gönderim hatası sağlayıcı=${provider} tür=${e.kind} deneme=${attempt}/${MAX} alıcı=${maskEmail(to)}${e.status ? ` durum=${e.status}` : ''}: ${e.message}`;
        if (e.retryable && attempt < MAX) {
          logger.warn?.(`${line} → ${retryDelayMs} ms sonra yeniden denenecek`);
          await sleep(retryDelayMs);
          continue;
        }
        logger.error?.(line);
        throw e;
      }
    }
  };

  if (env.RESEND_API_KEY) {
    const from = env.MAIL_FROM || `${APP} <onboarding@resend.dev>`;
    return {
      kind: 'resend',
      timeoutMs,
      async sendVerificationCode(to, code) {
        const body = JSON.stringify({ from, to: [to], ...verificationMessage(code) });
        await withRetry('resend', to, async () => {
          // Kendi zamanlayıcımız: AbortSignal.timeout olay döngüsünü canlı tutmaz; bu her durumda temizlenir
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(new DOMException('zaman aşımı', 'TimeoutError')), timeoutMs);
          try {
            let res;
            try {
              res = await fetchImpl('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body,
                signal: ac.signal,
              });
            } catch (e) {
              throw resendError(ac.signal.aborted ? ac.signal.reason : e);
            }
            if (!res.ok) throw await resendResponseError(res);
          } finally {
            clearTimeout(timer);
          }
        })();
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
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    });
    const from = env.MAIL_FROM || env.SMTP_USER;
    return {
      kind: 'smtp',
      timeoutMs,
      async sendVerificationCode(to, code) {
        await withRetry('smtp', to, async () => {
          try {
            await withTimeout(transport.sendMail({ from, to, ...verificationMessage(code) }), timeoutMs, 'SMTP');
          } catch (e) {
            throw smtpError(e);
          }
        })();
      },
    };
  }

  return {
    kind: 'console',
    timeoutMs,
    async sendVerificationCode(to, code) {
      log(`[mail] ${to} için doğrulama kodu: ${code}  (e-posta servisi yapılandırılmadı; RESEND_API_KEY ya da SMTP_* ekleyin)`);
    },
  };
}
