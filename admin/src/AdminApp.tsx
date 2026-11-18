import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../../src/hooks/useTheme';
import { auth, SESSION_EXPIRED_EVENT, type Session } from './api';
import AdminLogin from './AdminLogin';
import AdminPanel from './AdminPanel';

export default function AdminApp() {
  useTheme(); // sistem/kayıtlı tema
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    auth.me().then(setSession, () => setSession(null));
    const expired = () => setSession(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, []);

  const logout = useCallback(async () => {
    await auth.logout().catch(() => undefined);
    setSession(null);
  }, []);

  if (session === undefined) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-card">
        <Loader2 className="animate-spin text-ink-muted" />
      </div>
    );
  }
  if (!session) return <AdminLogin onLogin={setSession} />;
  return <AdminPanel appUrl={session.appUrl} onLogout={logout} />;
}
