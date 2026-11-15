import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AdminUser } from '../types';
import { logout, restoreSession } from './auth';
import AdminLogin from './AdminLogin';
import AdminPanel from './AdminPanel';

export default function AdminApp() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    document.title = 'Yönetim Paneli · Tuvaletim Nerede?';
    void restoreSession().then((u) => {
      setUser(u);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-card">
        <Loader2 className="animate-spin text-ink-muted" />
      </div>
    );
  }

  return user ? (
    <AdminPanel
      user={user}
      onLogout={async () => {
        await logout(user);
        setUser(null);
      }}
    />
  ) : (
    <AdminLogin onLogin={setUser} />
  );
}
