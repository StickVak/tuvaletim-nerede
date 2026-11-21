import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Eye, EyeOff, KeyRound, Loader2, MailCheck, RotateCw, X } from 'lucide-react';
import { ApiError, api } from '../api';
import CodeInput from './CodeInput';
import { useNow } from '../hooks/useNow';
import { formatWait, retryHint, secondsLeft, waitSecondsFromError } from '../lib/otp';

const input =
  'w-full rounded-2xl border-2 border-transparent bg-card px-4 py-3 text-[15px] font-medium text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-dark';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RequestResponse {
  message: string;
  expiresIn: number;
  resendIn: number;
}

/**
 * Şifremi unuttum: 1) e-posta → kod gönderilir (hesap olsun olmasın aynı mesaj), 2) 6 haneli kod + yeni şifre,
 * 3) başarı → giriş ekranına dönülür (tüm oturumlar sunucuda kapatıldı, yeni şifreyle giriş yapılır).
 */
export default function ForgotPassword({
  initialEmail,
  onBack,
  onDone,
  onClose,
}: {
  initialEmail: string;
  onBack: () => void;
  onDone: (email: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState(EMAIL_RE.test(initialEmail.trim()) ? initialEmail.trim() : '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, syncNow] = useNow(step === 'code' || waitUntil > Date.now());
  const resendIn = secondsLeft(resendAt, now);
  const expiresIn = secondsLeft(expiresAt, now);
  const wait = secondsLeft(waitUntil, now);

  const requestCode = async () => {
    if (!EMAIL_RE.test(email.trim())) return setError('Geçerli bir e-posta adresi girin.');
    setBusy(true);
    setError('');
    try {
      const r = await api<RequestResponse>('/auth/password-reset/request', { method: 'POST', body: { email: email.trim() } });
      const t = Date.now();
      setResendAt(t + r.resendIn * 1000);
      setExpiresAt(t + r.expiresIn * 1000);
      syncNow();
      setInfo(r.message);
      setCode('');
      setStep('code');
    } catch (err) {
      const w = waitSecondsFromError(err instanceof ApiError ? err : null);
      if (w) {
        setWaitUntil(Date.now() + w * 1000);
        syncNow();
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (code.length !== 6) return setError('E-postanıza gelen 6 haneli kodu girin.');
    if (password.length < 6 || password.length > 128) return setError('Yeni şifre 6-128 karakter olmalı.');
    setBusy(true);
    setError('');
    try {
      const r = await api<{ message: string }>('/auth/password-reset/confirm', { method: 'POST', body: { email: email.trim(), code, newPassword: password } });
      setPassword('');
      setInfo(r.message);
      setStep('done');
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const w = waitSecondsFromError(apiErr);
      if (w) {
        setWaitUntil(Date.now() + w * 1000);
        syncNow();
      }
      setError((err as Error).message);
      if (apiErr?.field === 'code') setCode('');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || wait > 0) return;
    if (step === 'email') return void requestCode();
    if (step === 'code') return void confirm();
    onDone(email.trim());
  };

  const title = step === 'done' ? 'Şifreniz güncellendi' : 'Şifremi Unuttum';
  const subtitle = step === 'email' ? 'E-postanıza bir sıfırlama kodu göndereceğiz' : step === 'code' ? 'Kodu ve yeni şifrenizi girin' : 'Yeni şifrenizle giriş yapın';

  return (
    <div className="absolute inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Şifre sıfırlama">
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} />
      <form onSubmit={submit} noValidate className="relative w-full max-w-sm animate-sheet-in rounded-t-[32px] bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:animate-slide-up sm:rounded-[32px]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-ink">{title}</h2>
            <p className="text-xs text-ink-muted">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-full bg-card p-2 text-ink">
            <X size={18} />
          </button>
        </div>

        {step === 'email' && (
          <div className="mt-5 space-y-3">
            <p className="px-1 text-sm text-ink-soft">Hesabınıza kayıtlı e-posta adresini girin. Size 15 dakika geçerli, 6 haneli bir kod göndereceğiz.</p>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              placeholder="E-posta"
              aria-label="E-posta"
              autoComplete="email"
              autoFocus
              className={input}
            />
          </div>
        )}

        {step === 'code' && (
          <div className="mt-5 space-y-3">
            <div className="flex items-start gap-3 rounded-2xl bg-brand-soft p-3.5 text-sm text-ink" role="status">
              <MailCheck size={20} className="mt-0.5 shrink-0" />
              <p>{info}</p>
            </div>
            <CodeInput
              value={code}
              disabled={busy}
              onChange={(v) => {
                setCode(v);
                if (v) setError('');
              }}
            />
            <div className="flex items-center justify-between px-1 text-xs font-semibold">
              <span className={expiresIn > 0 ? 'text-ink-muted' : 'text-red-600'} aria-live="polite">
                {expiresIn > 0 ? `Kod ${formatWait(expiresIn)} içinde geçersiz olur` : 'Kodun süresi doldu'}
              </span>
              <button
                type="button"
                onClick={() => void requestCode()}
                disabled={busy || resendIn > 0}
                className="flex items-center gap-1 text-ink underline disabled:text-ink-muted disabled:no-underline"
              >
                <RotateCw size={13} /> {resendIn > 0 ? `Tekrar gönder (${resendIn} sn)` : 'Kodu tekrar gönder'}
              </button>
            </div>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Yeni şifre (en az 6 karakter)"
                aria-label="Yeni şifre"
                autoComplete="new-password"
                className={`${input} pr-12`}
              />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted">
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="px-1 text-xs text-ink-muted">Şifre değişince güvenliğiniz için tüm cihazlardaki oturumlarınız kapatılır.</p>
          </div>
        )}

        {step === 'done' && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-green-500/10 p-3.5 text-sm font-semibold text-green-700 dark:text-green-400" role="status">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            <p>{info}</p>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">
            <p>{error}</p>
            {wait > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold" aria-live="polite">
                <Clock3 size={13} /> {retryHint(wait)}
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || wait > 0 || (step === 'email' && !email) || (step === 'code' && (code.length !== 6 || !password))}
          aria-busy={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-base font-extrabold text-onbrand transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : step === 'code' && <KeyRound size={18} />}
          {step === 'email' ? 'Kod Gönder' : step === 'code' ? 'Şifreyi Güncelle' : 'Giriş Yap'}
        </button>

        {step !== 'done' && (
          <button
            type="button"
            onClick={step === 'code' ? () => { setStep('email'); setError(''); } : onBack}
            className="mx-auto mt-3 flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"
          >
            <ArrowLeft size={15} /> {step === 'code' ? 'E-postayı değiştir' : 'Girişe dön'}
          </button>
        )}
      </form>
    </div>
  );
}
