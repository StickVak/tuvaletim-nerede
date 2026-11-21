import { useState } from 'react';
import { Clock3, KeyRound, Loader2, MailCheck, RotateCw } from 'lucide-react';
import { ApiError, api } from '../api';
import CodeInput from './CodeInput';
import { useNow } from '../hooks/useNow';
import { formatWait, retryHint, secondsLeft, waitSecondsFromError } from '../lib/otp';

const input = 'w-full rounded-2xl border-2 border-transparent bg-card px-4 py-2.5 text-sm font-medium text-ink outline-none focus:border-brand-dark';

interface CodeResponse {
  sentTo: string;
  expiresIn: number;
  resendIn: number;
  delivery: 'sent' | 'uncertain';
  message?: string;
}

/**
 * Profil → şifre. İki yol:
 * - Mevcut şifreyle değiştir (şifresi olan hesaplar)
 * - Kayıtlı e-postaya gelen kodla değiştir / belirle (şifreyi hatırlamayanlar ve yalnızca Google ile açılmış hesaplar)
 * Başarıda bu cihaz dışındaki oturumlar sunucuda kapanır.
 */
export default function PasswordSection({
  hasPassword,
  onToast,
  onChanged,
}: {
  hasPassword: boolean;
  onToast: (msg: string, tone: 'success' | 'error') => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'current' | 'code'>(hasPassword ? 'current' : 'code');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<CodeResponse | null>(null);
  const [busy, setBusy] = useState<'send' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, syncNow] = useNow(Boolean(sent) || waitUntil > Date.now());
  const resendIn = secondsLeft(resendAt, now);
  const expiresIn = secondsLeft(expiresAt, now);
  const wait = secondsLeft(waitUntil, now);

  const fail = (e: unknown) => {
    const w = waitSecondsFromError(e instanceof ApiError ? e : null);
    if (w) {
      setWaitUntil(Date.now() + w * 1000);
      syncNow();
    }
    setError((e as Error).message);
  };

  const sendCode = async () => {
    setBusy('send');
    setError('');
    try {
      const r = await api<CodeResponse>('/profile/password/code', { method: 'POST' });
      const t = Date.now();
      setSent(r);
      setResendAt(t + r.resendIn * 1000);
      setExpiresAt(t + r.expiresIn * 1000);
      setWaitUntil(0);
      syncNow();
      setCode('');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      const body = mode === 'code' ? { code, newPassword: newPw } : { currentPassword: currentPw, newPassword: newPw };
      await api('/profile/password', { method: 'POST', body });
      onToast(hasPassword ? 'Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.' : 'Şifreniz belirlendi. Artık e-posta ya da kullanıcı adınız ve şifrenizle de giriş yapabilirsiniz.', 'success');
      setCurrentPw('');
      setNewPw('');
      setCode('');
      setSent(null);
      setMode('current');
      onChanged();
    } catch (e) {
      fail(e);
      if (e instanceof ApiError && e.field === 'code') setCode('');
    } finally {
      setBusy(null);
    }
  };

  const switchMode = (m: 'current' | 'code') => {
    setMode(m);
    setError('');
  };

  const canSave = newPw.length > 0 && (mode === 'current' ? currentPw.length > 0 : code.length === 6) && !busy && wait === 0;

  return (
    <section className="mt-6 space-y-2" aria-labelledby="password-heading">
      <h3 id="password-heading" className="flex items-center gap-2 text-sm font-extrabold">
        <KeyRound size={15} /> {hasPassword ? 'Şifre değiştir' : 'Şifre belirle'}
      </h3>

      {mode === 'current' ? (
        <>
          <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="Mevcut şifre" aria-label="Mevcut şifre" autoComplete="current-password" className={input} />
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Yeni şifre (en az 6 karakter)" aria-label="Yeni şifre" autoComplete="new-password" className={input} />
        </>
      ) : !sent ? (
        <p className="rounded-2xl bg-card p-3 text-sm text-ink-soft">
          {hasPassword
            ? 'Mevcut şifrenizi hatırlamıyorsanız kayıtlı e-posta adresinize 6 haneli bir kod göndereceğiz; kodla yeni şifrenizi belirleyebilirsiniz.'
            : 'Hesabınız Google ile oluşturuldu ve henüz bir şifresi yok. Kayıtlı e-posta adresinize göndereceğimiz kodla şifre belirlerseniz e-posta ya da kullanıcı adınız ve şifrenizle de giriş yapabilirsiniz.'}
        </p>
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-2xl bg-brand-soft p-3 text-sm text-ink" role="status">
            <MailCheck size={18} className="mt-0.5 shrink-0" />
            <p>{sent.delivery === 'uncertain' ? sent.message : <>Kod <b>{sent.sentTo}</b> adresine gönderildi. Gelen kutunuzu (ve gereksiz klasörünü) kontrol edin.</>}</p>
          </div>
          <CodeInput value={code} disabled={busy === 'save'} onChange={(v) => { setCode(v); if (v) setError(''); }} />
          <div className="flex items-center justify-between px-1 text-xs font-semibold">
            <span className={expiresIn > 0 ? 'text-ink-muted' : 'text-red-600'} aria-live="polite">
              {expiresIn > 0 ? `Kod ${formatWait(expiresIn)} içinde geçersiz olur` : 'Kodun süresi doldu'}
            </span>
            <button type="button" onClick={() => void sendCode()} disabled={busy !== null || resendIn > 0} className="flex items-center gap-1 text-ink underline disabled:text-ink-muted disabled:no-underline">
              <RotateCw size={13} /> {resendIn > 0 ? `Tekrar gönder (${resendIn} sn)` : 'Kodu tekrar gönder'}
            </button>
          </div>
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Yeni şifre (en az 6 karakter)" aria-label="Yeni şifre" autoComplete="new-password" className={input} />
        </>
      )}

      {error && (
        <div role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">
          <p>{error}</p>
          {wait > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold" aria-live="polite">
              <Clock3 size={13} /> {retryHint(wait)}
            </p>
          )}
        </div>
      )}

      {mode === 'code' && !sent ? (
        <button type="button" onClick={() => void sendCode()} disabled={busy !== null || wait > 0} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-card py-3 text-sm font-bold text-ink ring-1 ring-line disabled:opacity-50">
          {busy === 'send' ? <Loader2 size={16} className="animate-spin" /> : <MailCheck size={16} />} E-postama kod gönder
        </button>
      ) : (
        <button type="button" onClick={() => void save()} disabled={!canSave} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-card py-3 text-sm font-bold text-ink ring-1 ring-line disabled:opacity-50">
          {busy === 'save' && <Loader2 size={16} className="animate-spin" />}
          {mode === 'code' ? (hasPassword ? 'Yeni şifreyi kaydet' : 'Şifreyi belirle') : 'Şifreyi değiştir'}
        </button>
      )}

      {hasPassword && (
        <button
          type="button"
          onClick={() => switchMode(mode === 'current' ? 'code' : 'current')}
          className="mx-auto block text-sm font-semibold text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          {mode === 'current' ? 'Mevcut şifremi hatırlamıyorum' : 'Mevcut şifremle değiştir'}
        </button>
      )}
    </section>
  );
}
