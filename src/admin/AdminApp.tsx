import { useEffect } from 'react';
import { Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import AdminLogin from './AdminLogin';
import AdminPanel from './AdminPanel';

export default function AdminApp() {
  const { user, ready, logout } = useAuth();
  useTheme(); // sistem/kayıtlı temayı panelde de uygula

  useEffect(() => {
    document.title = 'Yönetim Paneli · Tuvaletim Nerede?';
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-card">
        <Loader2 className="animate-spin text-ink-muted" />
      </div>
    );
  }
  if (!user) return <AdminLogin />;
  if (user.role !== 'admin') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-card p-4">
        <div className="max-w-sm rounded-3xl bg-surface p-7 text-center shadow-float ring-1 ring-line">
          <ShieldAlert size={36} className="mx-auto text-red-500" />
          <h1 className="mt-3 text-lg font-extrabold text-ink">Bu hesabın yönetici yetkisi yok.</h1>
          <p className="mt-1 text-sm text-ink-muted">“{user.username}” olarak giriş yaptınız.</p>
          <button type="button" onClick={logout} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-surface">
            <LogOut size={16} /> Çıkış yap
          </button>
        </div>
      </div>
    );
  }
  return <AdminPanel username={user.username} onLogout={logout} />;
}
