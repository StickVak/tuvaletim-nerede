import { LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

/** Girişsiz: Giriş Yap + Kayıt Ol · Girişli: kullanıcı adı + Çıkış Yap */
export default function AccountButton({ variant }: { variant: 'bar' | 'sidebar' }) {
  const { user, openAuth, logout } = useAuth();
  const bar = variant === 'bar';
  const pill = bar ? 'h-10 rounded-full px-3.5 text-xs shadow-float' : 'h-10 rounded-2xl px-4 text-sm';

  if (!user) {
    return (
      <div className={`flex gap-2 ${bar ? '' : 'w-full'}`}>
        <button type="button" onClick={() => openAuth('login')} className={`${pill} bg-surface font-bold text-ink ring-1 ring-line ${bar ? '' : 'flex-1'}`}>
          Giriş Yap
        </button>
        <button type="button" onClick={() => openAuth('register')} className={`${pill} bg-brand font-bold text-onbrand ${bar ? '' : 'flex-1'}`}>
          Kayıt Ol
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${bar ? '' : 'w-full'}`}>
      <span className={`${pill} flex min-w-0 items-center gap-1.5 bg-surface font-bold text-ink ring-1 ring-line ${bar ? 'max-w-[120px]' : 'flex-1'}`}>
        <UserRound size={15} className="shrink-0 text-brand-dark" />
        <span className="truncate">{user.username}</span>
      </span>
      <button type="button" onClick={logout} className={`${pill} flex shrink-0 items-center gap-1.5 bg-surface font-bold text-ink ring-1 ring-line`}>
        <LogOut size={14} /> Çıkış Yap
      </button>
    </div>
  );
}
