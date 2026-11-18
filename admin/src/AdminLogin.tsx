import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { auth, type Session } from './api';
import Logo from './Logo';

export default function AdminLogin({ onLogin }: { onLogin: (s: Session) => void }) {
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return setError('Yönetici anahtarını girin.');
    setBusy(true);
    setError('');
    try {
      onLogin(await auth.login(key.trim()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-card p-4">
      <form onSubmit={submit} className="w-full max-w-sm animate-slide-up rounded-[32px] bg-surface p-7 shadow-float ring-1 ring-line">
        <div className="flex items-center gap-3">
          <Logo size={48} />
          <div>
            <h1 className="text-xl font-extrabold leading-tight">Yönetim Paneli</h1>
            <p className="text-xs font-medium text-ink-muted">Tuvaletim Nerede?</p>
          </div>
        </div>

        <label className="mt-7 block">
          <span className="mb-1.5 block text-sm font-bold">Yönetici anahtarı</span>
          <span className="flex items-center gap-2 rounded-2xl border-2 border-transparent bg-card px-3.5 focus-within:border-brand-dark focus-within:bg-surface">
            <KeyRound size={17} className="text-ink-muted" />
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="current-password"
              autoFocus
              aria-label="Yönetici anahtarı"
              className="w-full bg-transparent py-3 font-mono text-[15px] outline-none"
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="text-ink-muted" aria-label={show ? 'Anahtarı gizle' : 'Anahtarı göster'}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>

        {error && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

        <button type="submit" disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 font-extrabold text-onbrand hover:bg-brand-dark disabled:opacity-60">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Giriş yap
        </button>

        <p className="mt-5 flex items-start gap-2 text-xs text-ink-muted">
          <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          Anahtar sunucudaki <code className="font-mono">ADMIN_SECRET_KEY</code> değeridir. Tarayıcıda saklanmaz; 12 saatlik güvenli bir oturum açılır.
        </p>
      </form>
    </div>
  );
}
