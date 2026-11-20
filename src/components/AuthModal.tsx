import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Clock3, Eye, EyeOff, Loader2, MailCheck, RotateCw, X } from 'lucide-react';
import { useAuth, type AuthMode } from '../hooks/useAuth';
import { ApiError } from '../api';
import Logo from './Logo';
import CodeInput from './CodeInput';
import { failureTitle, formatWait, resendLabel, retryHint, secondsLeft, sendButton, waitSecondsFromError } from '../lib/otp';

const input =
  'w-full rounded-2xl border-2 border-transparent bg-card px-4 py-3 text-[15px] font-medium text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-dark';

const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,30}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Saniyede bir yenilenen "şu an" (geri sayımlar için) */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now()); // etkinleşir etkinleşmez güncel zamanla başla (eski değerle ilk kare yanlış görünmesin)
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  /** Yeni bir bitiş zamanı ayarlanınca saati de hemen güncelle (sayaç bir an fazladan saniye göstermesin) */
  const sync = () => setNow(Date.now());
  return [now, sync] as const;
}

export default function AuthModal({ onWelcome }: { onWelcome: (username: string) => void }) {
  const { authMode, openAuth, closeAuth, login, sendCode, register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  // Güvenilir cihaz: işaretliyse bu cihazda oturum kalıcıdır (sonraki açılışlarda giriş ekranı gelmez)
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Kayıt 2. adımı: e-postaya gönderilen kod
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  // Kod isteği sürüyor mu (çift tıklama / Enter ile çift istek engeli: state güncellenmeden de geçerli)
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  // Form adımındaki bekleme: rate-limit ya da gönderim hatası sonrası "ne zaman tekrar deneyebilirim"
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, syncNow] = useNow(step === 'code' || cooldownUntil > Date.now());

  if (!authMode) return null;
  const isRegister = authMode === 'register';
  const onCodeStep = isRegister && step === 'code';
  const resendIn = secondsLeft(resendAt, now);
  const expiresIn = secondsLeft(expiresAt, now);
  const cooldown = secondsLeft(cooldownUntil, now);
  const sendBtn = sendButton({ busy: sending, wait: cooldown });

  const switchTo = (m: AuthMode) => {
    setError('');
    setNotice(null);
    setStep('form');
    openAuth(m);
  };

  /** Kod iste (ilk gönderim ya da tekrar gönder). Aynı anda yalnızca bir istek. */
  const requestCode = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    setNotice(null);
    const fromCodeStep = step === 'code';
    try {
      const r = await sendCode(email.trim(), username.trim());
      const t = Date.now();
      setResendAt(t + r.resendIn * 1000);
      setExpiresAt(t + r.expiresIn * 1000);
      setCooldownUntil(0);
      syncNow();
      setCode('');
      setStep('code');
      if (r.delivery === 'uncertain') {
        // Sağlayıcı geç yanıt verdi: kod yine de gelebilir; kısa süre sonra yenisi istenebilir
        setNotice({ tone: 'warn', text: r.message ?? 'E-posta gönderimi gecikiyor; kod birkaç dakika içinde gelebilir.' });
      } else if (fromCodeStep) {
        setNotice({ tone: 'ok', text: 'Yeni kod gönderildi. En son gelen kodu kullanın.' });
      }
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const wait = waitSecondsFromError(apiErr);
      if (wait) {
        const until = Date.now() + wait * 1000;
        if (fromCodeStep) setResendAt(until);
        else setCooldownUntil(until);
        syncNow();
      }
      // Bekleme varsa başlık + canlı geri sayım; yoksa sunucunun mesajı
      setError(wait && apiErr ? failureTitle(apiErr) : (err as Error).message);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const verify = async (c = code) => {
    if (c.length !== 6) return setError('E-postanıza gelen 6 haneli kodu girin.');
    setBusy(true);
    setError('');
    try {
      const u = await register(username.trim(), email.trim(), password, c, remember);
      setPassword('');
      setStep('form');
      onWelcome(u.username);
    } catch (err) {
      setError((err as Error).message);
      setCode(''); // hatalı/süresi dolmuş kod: kutuları temizle, ilk kutuya dön
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onCodeStep) return verify();
    if (isRegister) {
      if (!USERNAME_RE.test(username.trim())) return setError('Kullanıcı adı 3-30 karakter olmalı; harf, rakam, _ . - kullanılabilir.');
      if (!EMAIL_RE.test(email.trim())) return setError('Geçerli bir e-posta adresi girin.');
      if (password.length < 6) return setError('Şifre en az 6 karakter olmalı.');
      if (cooldown > 0 || sending) return; // bekleme sürerken Enter ile de gönderilmez
      return requestCode();
    }
    setBusy(true);
    setError('');
    try {
      const u = await login(username.trim(), password, remember);
      setPassword('');
      onWelcome(u.username);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={isRegister ? 'Kayıt ol' : 'Giriş yap'}>
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={closeAuth} />
      <form onSubmit={submit} noValidate className="relative w-full max-w-sm animate-sheet-in rounded-t-[32px] bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:animate-slide-up sm:rounded-[32px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <h2 className="text-lg font-extrabold text-ink">{onCodeStep ? 'E-postanızı doğrulayın' : isRegister ? 'Kayıt Ol' : 'Giriş Yap'}</h2>
              <p className="text-xs text-ink-muted">{onCodeStep ? 'Son adım: 6 haneli kod' : 'Tuvalet eklemek ve puanlamak için'}</p>
            </div>
          </div>
          <button type="button" onClick={closeAuth} aria-label="Kapat" className="rounded-full bg-card p-2 text-ink">
            <X size={18} />
          </button>
        </div>

        {onCodeStep ? (
          <div className="mt-5">
            <div className="flex items-start gap-3 rounded-2xl bg-brand-soft p-3.5 text-sm text-ink">
              <MailCheck size={20} className="mt-0.5 shrink-0" />
              <p>
                <b className="break-all">{email.trim()}</b> adresine 6 haneli bir kod gönderdik. Gelen kutunuzu (ve gereksiz klasörünü) kontrol edin.
              </p>
            </div>

            <div className="mt-4">
              <CodeInput
                value={code}
                disabled={busy}
                onChange={(v) => {
                  setCode(v);
                  if (v) setError('');
                  if (v.length === 6) void verify(v); // tamamlanınca otomatik doğrula
                }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs font-semibold">
              <span className={expiresIn > 0 ? 'text-ink-muted' : 'text-red-600'} aria-live="polite">
                {expiresIn > 0 ? `Kod ${formatWait(expiresIn)} içinde geçersiz olur` : 'Kodun süresi doldu'}
              </span>
              <button
                type="button"
                onClick={() => void requestCode()}
                disabled={busy || sending || resendIn > 0}
                aria-busy={sending}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-ink disabled:text-ink-muted"
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />} {resendLabel({ busy: sending, wait: resendIn })}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-card p-1" role="tablist">
              {(['login', 'register'] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={authMode === m}
                  onClick={() => switchTo(m)}
                  className={`rounded-xl py-2.5 text-sm font-bold transition ${authMode === m ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'}`}
                >
                  {m === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isRegister ? 'Kullanıcı adı' : 'Kullanıcı adı veya e-posta'}
                aria-label={isRegister ? 'Kullanıcı adı' : 'Kullanıcı adı veya e-posta'}
                autoComplete="username"
                autoFocus
                className={input}
              />
              {isRegister && (
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-posta"
                  aria-label="E-posta"
                  autoComplete="email"
                  className={input}
                />
              )}
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? 'Şifre (en az 6 karakter)' : 'Şifre'}
                  aria-label="Şifre"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className={`${input} pr-12`}
                />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted">
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 px-1 text-sm text-ink">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#FFC300]" />
                <span>
                  <b className="font-semibold">Bu cihazı hatırla</b>
                  <span className="block text-xs text-ink-muted">Bu cihazda tekrar giriş yapmanız gerekmez. Ortak kullanılan cihazlarda işareti kaldırın.</span>
                </span>
              </label>
              {isRegister && <p className="px-1 text-xs text-ink-muted">E-postanıza gönderilecek 6 haneli kodla hesabınızı doğrulayacaksınız.</p>}
            </div>
          </>
        )}

        {notice && !error && (
          <p
            role="status"
            className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
              notice.tone === 'warn' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-green-500/10 text-green-700 dark:text-green-400'
            }`}
          >
            {notice.tone === 'warn' && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            {notice.text}
          </p>
        )}
        {error && (
          <div role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">
            <p>{error}</p>
            {/* Ne zaman tekrar denenebileceği: canlı geri sayım (form adımı ya da kod adımındaki tekrar gönder) */}
            {(onCodeStep ? resendAt > 0 && resendIn > 0 : cooldownUntil > 0) && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold" aria-live="polite" data-testid="retry-countdown">
                <Clock3 size={13} /> {retryHint(onCodeStep ? resendIn : cooldown)}
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={
            busy ||
            sending ||
            (onCodeStep ? code.length !== 6 : !username || !password || (isRegister && (!email || sendBtn.disabled)))
          }
          aria-busy={busy || sending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-base font-extrabold text-onbrand transition hover:bg-brand-dark disabled:opacity-50"
        >
          {(busy || (sending && !onCodeStep)) && <Loader2 size={18} className="animate-spin" />}
          {!busy && !sending && !onCodeStep && isRegister && cooldown > 0 && <Clock3 size={18} />}
          {onCodeStep ? 'Doğrula ve Hesap Oluştur' : isRegister ? sendBtn.label : 'Giriş Yap'}
        </button>

        {onCodeStep && (
          <button
            type="button"
            onClick={() => {
              setStep('form');
              setError('');
              setNotice(null);
            }}
            className="mx-auto mt-3 flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"
          >
            <ArrowLeft size={15} /> E-postayı değiştir
          </button>
        )}
      </form>
    </div>
  );
}
