/**
 * Esnek ve dayanıklı e-posta servisi (öncelik sırası):
 *   1) BREVO_API_KEY   → Brevo Transactional Email API (POST /v3/smtp/email, `api-key` başlığı)
 *   2) RESEND_API_KEY  → Resend HTTP API
 *   3) SMTP_HOST + SMTP_USER + SMTP_PASS → Nodemailer (SMTP_PORT, varsayılan 587; 465 ise TLS)
 *   4) hiçbiri yoksa   → kod sunucu konsoluna yazılır (yerel geliştirme)
 * Gönderen adresi: MAIL_FROM ("Ad <adres>" ya da yalın adres). Brevo'da zorunludur ve Brevo panelinde doğrulanmış
 * bir gönderen/alan adı olmalıdır; boş ya da geçersizse açılışta loglanır ve gönderimler config hatası verir.
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

/**
 * MAIL_FROM → { name, email }. "Ad <adres>", "\"Ad\" <adres>" ya da yalın adres; boş/geçersizse null.
 */
export function parseSender(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const m = v.match(/^(?:"?([^"<]*?)"?\s*)?<([^<>\s]+)>$/);
  const name = m ? m[1].trim() || null : null;
  const email = m ? m[2] : v;
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? { name, email } : null;
}

/**
 * Zaman aşımlı JSON POST. Ağ/zaman aşımı hatalarını MailError'a çevirir; HTTP yanıtını olduğu gibi döner.
 * Kendi zamanlayıcımız: AbortSignal.timeout olay döngüsünü canlı tutmaz; bu her durumda temizlenir.
 */
async function postJson({ fetchImpl, url, headers, body, timeoutMs, provider, label }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException('zaman aşımı', 'TimeoutError')), timeoutMs);
  try {
    return await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body, signal: ac.signal });
  } catch (err) {
    const e = ac.signal.aborted ? ac.signal.reason : err;
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new MailError('timeout', `${label}: ${timeoutMs} ms içinde yanıt yok`, { provider, retryable: true, cause: e });
    }
    throw new MailError('network', `${label}: ağ hatası (${e?.cause?.code ?? e?.message ?? 'bilinmiyor'})`, { provider, retryable: true, cause: e });
  } finally {
    clearTimeout(timer);
  }
}

/** Rate-limit bekleme süresi (sn): Retry-After ya da Brevo'nun x-sib-ratelimit-reset başlığı */
function retryAfterFrom(res) {
  for (const h of ['retry-after', 'x-sib-ratelimit-reset']) {
    const n = Number(res.headers.get(h));
    if (Number.isFinite(n) && n > 0) return Math.ceil(n);
  }
  return null;
}

/**
 * Brevo hata yanıtı → MailError. Brevo gövdesi: { code, message }.
 * 401 geçersiz anahtar, 403 yetki/IP kısıtı, 400 + "sender" doğrulanmamış gönderen → config (kullanıcı düzeltemez,
 * yönetici düzeltmeli); 429 → rate_limit; 5xx → geçici (yeniden denenir); diğer 4xx → sağlayıcı reddi.
 */
async function brevoResponseError(res) {
  const raw = await res.text().catch(() => '');
  let code = '';
  let message = raw.slice(0, 300);
  try {
    const j = JSON.parse(raw);
    code = j.code ?? '';
    message = String(j.message ?? message).slice(0, 300);
  } catch {
    /* JSON değil */
  }
  const detail = `Brevo ${res.status}${code ? ` ${code}` : ''}: ${message || '(boş yanıt)'}`;
  const base = { provider: 'brevo', status: res.status };
  if (res.status === 429) return new MailError('rate_limit', detail, { ...base, retryAfter: retryAfterFrom(res) });
  if (res.status >= 500) return new MailError('provider', detail, { ...base, retryable: true });
  if (res.status === 401 || res.status === 403) return new MailError('config', `${detail} (API anahtarını / Brevo hesap yetkilerini ve izinli IP'leri kontrol edin)`, base);
  if (res.status === 400 && /sender|from/i.test(`${code} ${message}`)) {
    return new MailError('config', `${detail} (MAIL_FROM adresini Brevo'da gönderen olarak doğrulayın)`, base);
  }
  return new MailError('provider', detail, base);
}

/** Resend hata yanıtı → MailError */
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

  if (env.BREVO_API_KEY) {
    const sender = parseSender(env.MAIL_FROM);
    // Gönderen yoksa sunucu yine açılır (diğer özellikler çalışsın) ama sorun açıkça loglanır ve her gönderim reddedilir
    const configError = sender
      ? null
      : `MAIL_FROM ${env.MAIL_FROM ? `geçersiz ("${String(env.MAIL_FROM).slice(0, 80)}")` : 'tanımlı değil'}: Brevo için Brevo'da doğrulanmış bir gönderen adresi gerekir, ör. MAIL_FROM="Tuvaletim Nerede? <noreply@alanadiniz.com>"`;
    if (configError) logger.error?.(`[mail] brevo yapılandırma hatası: ${configError}`);
    return {
      kind: 'brevo',
      timeoutMs,
      configError,
      summary: sender ? `brevo (gönderen: ${sender.email})` : 'brevo (HATALI: MAIL_FROM)',
      async sendVerificationCode(to, code) {
        if (configError) {
          const e = new MailError('config', configError, { provider: 'brevo' });
          logger.error?.(`[mail] gönderim hatası sağlayıcı=brevo tür=config deneme=0/2 alıcı=${maskEmail(to)}: ${configError}`);
          throw e;
        }
        const { subject, text, html } = verificationMessage(code);
        const body = JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html, textContent: text });
        await withRetry('brevo', to, async () => {
          const res = await postJson({
            fetchImpl,
            url: 'https://api.brevo.com/v3/smtp/email',
            headers: { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' },
            body,
            timeoutMs,
            provider: 'brevo',
            label: 'Brevo',
          });
          if (!res.ok) throw await brevoResponseError(res);
        })();
      },
    };
  }

  if (env.RESEND_API_KEY) {
    const from = env.MAIL_FROM || `${APP} <onboarding@resend.dev>`;
    return {
      kind: 'resend',
      timeoutMs,
      summary: `resend (gönderen: ${parseSender(from)?.email ?? from}; BREVO_API_KEY tanımlı değil)`,
      async sendVerificationCode(to, code) {
        const body = JSON.stringify({ from, to: [to], ...verificationMessage(code) });
        await withRetry('resend', to, async () => {
          const res = await postJson({
            fetchImpl,
            url: 'https://api.resend.com/emails',
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
            body,
            timeoutMs,
            provider: 'resend',
            label: 'Resend',
          });
          if (!res.ok) throw await resendResponseError(res);
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
      summary: `smtp (${env.SMTP_HOST}:${port}; BREVO_API_KEY ve RESEND_API_KEY tanımlı değil)`,
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
    summary: 'console (BREVO_API_KEY, RESEND_API_KEY ve SMTP_* tanımlı değil: kodlar sunucu konsoluna yazılır)',
    async sendVerificationCode(to, code) {
      log(`[mail] ${to} için doğrulama kodu: ${code}  (e-posta servisi yapılandırılmadı; RESEND_API_KEY ya da SMTP_* ekleyin)`);
    },
  };
}
