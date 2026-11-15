import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, LogIn, ShieldCheck, User } from 'lucide-react';
import type { AdminUser } from '../types';
import { login, loginLockedFor } from './auth';
import { ADMIN_FROM_ENV } from '../db/db';
import Logo from '../components/Logo';

export default function AdminLogin({ onLogin }: { onLogin: (u: AdminUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Kullanıcı adı ve şifre gerekli.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onLogin(await login(username, password));
    } catch (err) {
      const locked = loginLockedFor();
      setError(
        (err as Error).message === 'LOCKED' || locked
          ? `Çok fazla hatalı deneme. ${Math.ceil(locked / 1000)} sn sonra tekrar deneyin.`
          : 'Kullanıcı adı veya şifre hatalı.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_15%_15%,#FFF3B0_0,transparent_40%),radial-gradient(circle_at_85%_85%,#FFE680_0,transparent_35%)] bg-card p-4">
      <div className="w-full max-w-sm">
        <a href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          <ArrowLeft size={16} /> Haritaya dön
        </a>
        <form onSubmit={submit} className="animate-slide-up rounded-[32px] bg-white p-7 shadow-float ring-1 ring-black/5">
          <div className="flex items-center gap-3">
            <Logo size={48} />
            <div>
              <h1 className="text-xl font-extrabold leading-tight">Yönetici Girişi</h1>
              <p className="text-xs font-medium text-ink-muted">Tuvaletim Nerede? · Yönetim Paneli</p>
            </div>
          </div>

          <label className="mt-7 block">
            <span className="mb-1.5 block text-sm font-bold">Kullanıcı adı</span>
            <span className="flex items-center gap-2 rounded-2xl border-2 border-transparent bg-card px-3.5 focus-within:border-brand-dark focus-within:bg-white">
              <User size={17} className="text-ink-muted" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                className="w-full bg-transparent py-3 text-[15px] font-medium outline-none"
              />
            </span>
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-bold">Şifre</span>
            <span className="flex items-center gap-2 rounded-2xl border-2 border-transparent bg-card px-3.5 focus-within:border-brand-dark focus-within:bg-white">
              <KeyRound size={17} className="text-ink-muted" />
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-transparent py-3 text-[15px] font-medium outline-none"
              />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'} className="text-ink-muted">
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>

          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-base font-bold text-white transition hover:bg-black disabled:opacity-60"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Giriş Yap
          </button>

          {!ADMIN_FROM_ENV && (
            <p className="mt-5 flex items-start gap-2 rounded-2xl bg-brand-soft p-3 text-xs text-ink-soft">
              <ShieldCheck size={15} className="mt-px shrink-0" />
              <span>
                Varsayılan test hesabı: <b className="font-mono">admin</b> / <b className="font-mono">admin123</b>. Değiştirmek için
                <span className="font-mono"> .env</span> dosyasında <span className="font-mono">VITE_ADMIN_PASSWORD</span> tanımlayın.
              </span>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
