/** Kayıt doğrulama kodu (OTP) gönderimi: geri sayım ve bekleme hesapları (arayüzden bağımsız, test edilebilir) */

export interface SendCodeResponse {
  ok: boolean;
  /** sent: e-posta gönderildi · uncertain: sağlayıcı geç yanıt verdi, kod yine de gelebilir */
  delivery?: 'sent' | 'uncertain';
  expiresIn: number;
  resendIn: number;
  message?: string;
}

/** Bir hatadan beklenmesi gereken süre (sn); sunucu süre bildirmediyse 429 için 60 sn, diğerlerinde null */
export function waitSecondsFromError(err: { status?: number; retryAfter?: number | null } | null | undefined): number | null {
  if (!err) return null;
  if (typeof err.retryAfter === 'number' && err.retryAfter > 0) return Math.ceil(err.retryAfter);
  if (err.status === 429) return 60;
  return null;
}

/** untilMs anına kalan tam saniye (geçtiyse 0) */
export function secondsLeft(untilMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((untilMs - nowMs) / 1000));
}

/** 75 → "1:15" */
export function formatWait(s: number): string {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

/** Geri sayım metni: kullanıcının ne zaman tekrar deneyebileceği */
export function retryHint(s: number): string {
  if (s <= 0) return 'Şimdi tekrar deneyebilirsiniz.';
  return s < 60 ? `${s} saniye sonra tekrar deneyebilirsiniz.` : `${formatWait(s)} sonra tekrar deneyebilirsiniz.`;
}

/** "Kod Gönder" butonunun durumu: istek sürüyor / bekleme var / hazır */
export function sendButton({ busy, wait }: { busy: boolean; wait: number }): { label: string; disabled: boolean } {
  if (busy) return { label: 'Kod gönderiliyor…', disabled: true };
  if (wait > 0) return { label: `Tekrar dene (${formatWait(wait)})`, disabled: true };
  return { label: 'Kod Gönder', disabled: false };
}

/** "Kodu tekrar gönder" bağlantısının metni */
export function resendLabel({ busy, wait }: { busy: boolean; wait: number }): string {
  if (busy) return 'Gönderiliyor…';
  return wait > 0 ? `Kodu tekrar gönder (${formatWait(wait)})` : 'Kodu tekrar gönder';
}

/**
 * Bekleme gerektiren hatanın başlığı (süre ayrıca canlı geri sayımla gösterilir; sunucu mesajındaki sabit
 * "37 saniye" ifadesi geri sayımla çelişmesin diye kullanılmaz). Bilinmeyen durumda sunucu mesajı.
 */
export function failureTitle(err: { status?: number; reason?: string | null; message?: string }): string {
  if (err.reason === 'rate_limit') return 'E-posta servisi şu an yoğun.';
  if (err.reason === 'network') return 'Doğrulama e-postası şu an gönderilemedi.';
  if (err.reason === 'unavailable') return 'E-posta servisi geçici olarak kullanılamıyor.';
  if (err.status === 429) return 'Bu adrese kısa süre önce kod gönderildi.';
  return err.message ?? 'Kod gönderilemedi.';
}
