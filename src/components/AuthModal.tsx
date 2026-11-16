import { useState } from 'react';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import { useAuth, type AuthMode } from '../hooks/useAuth';
import Logo from './Logo';

const input =
  'w-full rounded-2xl border-2 border-transparent bg-card px-4 py-3 text-[15px] font-medium text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-dark';

export default function AuthModal({ onWelcome }: { onWelcome: (username: string) => void }) {
  const { authMode, openAuth, closeAuth, login, register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!authMode) return null;
  const isRegister = authMode === 'register';

  const switchTo = (m: AuthMode) => {
    setError('');
    openAuth(m);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = isRegister ? await register(username.trim(), email.trim(), password) : await login(username.trim(), password);
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
      <form onSubmit={submit} className="relative w-full max-w-sm animate-sheet-in rounded-t-[32px] bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:animate-slide-up sm:rounded-[32px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <h2 className="text-lg font-extrabold text-ink">{isRegister ? 'Kayıt Ol' : 'Giriş Yap'}</h2>
              <p className="text-xs text-ink-muted">Tuvalet eklemek ve puanlamak için</p>
            </div>
          </div>
          <button type="button" onClick={closeAuth} aria-label="Kapat" className="rounded-full bg-card p-2 text-ink">
            <X size={18} />
          </button>
        </div>

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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-posta (isteğe bağlı)"
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
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-base font-extrabold text-onbrand transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy && <Loader2 size={18} className="animate-spin" />}
          {isRegister ? 'Hesap Oluştur' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
}
