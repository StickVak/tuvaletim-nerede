import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2, MailCheck, RotateCw, X } from 'lucide-react';
import { useAuth, type AuthMode } from '../hooks/useAuth';
import { ApiError } from '../api';
import Logo from './Logo';
import CodeInput from './CodeInput';

const input =
  'w-full rounded-2xl border-2 border-transparent bg-card px-4 py-3 text-[15px] font-medium text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-dark';

const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,30}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Saniyede bir yenilenen "şu an" (geri sayımlar için) */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

export default function AuthModal({ onWelcome }: { onWelcome: (username: string) => void }) {
  const { authMode, openAuth, closeAuth, login, sendCode, register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Kayıt 2. adımı: e-postaya gönderilen kod
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [notice, setNotice] = useState('');
  const now = useNow(step === 'code');

  if (!authMode) return null;
  const isRegister = authMode === 'register';
  const onCodeStep = isRegister && step === 'code';
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expiresIn = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  const switchTo = (m: AuthMode) => {
    setError('');
    setStep('form');
    openAuth(m);
  };

  /** Kod iste (ilk gönderim ya da tekrar gönder) */
  const requestCode = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await sendCode(email.trim(), username.trim());
      const t = Date.now();
      setResendAt(t + r.resendIn * 1000);
      setExpiresAt(t + r.expiresIn * 1000);
      setCode('');
      setStep('code');
      setNotice(step === 'code' ? 'Yeni kod gönderildi.' : '');
    } catch (err) {
      // 60 sn sınırı: sunucunun söylediği süre kadar geri say
      if (err instanceof ApiError && err.status === 429) {
        const s = Number(err.message.match(/(\d+) saniye/)?.[1] ?? 60);
        setResendAt(Date.now() + s * 1000);
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (c = code) => {
    if (c.length !== 6) return setError('E-postanıza gelen 6 haneli kodu girin.');
    setBusy(true);
    setError('');
    try {
      const u = await register(username.trim(), email.trim(), password, c);
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
      return requestCode();
    }
    setBusy(true);
    setError('');
    try {
      const u = await login(username.trim(), password);
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
                {expiresIn > 0 ? `Kod ${mmss(expiresIn)} içinde geçersiz olur` : 'Kodun süresi doldu'}
              </span>
              <button
                type="button"
                onClick={() => void requestCode()}
                disabled={busy || resendIn > 0}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-ink disabled:text-ink-muted"
              >
                <RotateCw size={13} /> {resendIn > 0 ? `Kodu tekrar gönder (${mmss(resendIn)})` : 'Kodu tekrar gönder'}
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
              {isRegister && <p className="px-1 text-xs text-ink-muted">E-postanıza gönderilecek 6 haneli kodla hesabınızı doğrulayacaksınız.</p>}
            </div>
          </>
        )}

        {notice && !error && <p className="mt-3 rounded-xl bg-green-500/10 px-3 py-2 text-sm font-semibold text-green-700 dark:text-green-400">{notice}</p>}
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || (onCodeStep ? code.length !== 6 : !username || !password || (isRegister && !email))}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-base font-extrabold text-onbrand transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy && <Loader2 size={18} className="animate-spin" />}
          {onCodeStep ? 'Doğrula ve Hesap Oluştur' : isRegister ? 'Kod Gönder' : 'Giriş Yap'}
        </button>

        {onCodeStep && (
          <button
            type="button"
            onClick={() => {
              setStep('form');
              setError('');
              setNotice('');
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
