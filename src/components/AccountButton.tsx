import { LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Avatar from './Avatar';

/** Girişsiz: Giriş Yap + Kayıt Ol · Girişli: kullanıcı adı + Çıkış Yap */
export default function AccountButton({ variant, onOpenProfile }: { variant: 'bar' | 'sidebar'; onOpenProfile: () => void }) {
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
      <button
        type="button"
        onClick={onOpenProfile}
        aria-label="Profilim"
        className={`${pill} flex min-w-0 items-center gap-1.5 bg-surface !pl-1 font-bold text-ink ring-1 ring-line ${bar ? 'max-w-[140px]' : 'flex-1'}`}
      >
        <Avatar name={user.displayName} url={user.avatarUrl} size={30} />
        <span className="truncate">{user.displayName}</span>
      </button>
      <button type="button" onClick={logout} className={`${pill} flex shrink-0 items-center gap-1.5 bg-surface font-bold text-ink ring-1 ring-line`}>
        <LogOut size={14} /> Çıkış Yap
      </button>
    </div>
  );
}
