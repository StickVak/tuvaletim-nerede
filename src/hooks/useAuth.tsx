import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../types';
import { AUTH_EXPIRED_EVENT, AUTH_REFRESHED_EVENT, api, getToken, refreshSession, setToken } from '../api';
import type { SendCodeResponse } from '../lib/otp';

export type AuthMode = 'login' | 'register';

interface AuthState {
  user: User | null;
  /** İlk oturum kontrolü bitti mi */
  ready: boolean;
  authMode: AuthMode | null;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  /** remember: bu cihazı güvenilir yap (varsayılan açık) — sonraki açılışlarda giriş ekranı gelmez */
  login: (username: string, password: string, remember?: boolean) => Promise<User>;
  /** Kayıt 1. adım: e-postaya 6 haneli doğrulama kodu gönderir */
  sendCode: (email: string, username: string) => Promise<SendCodeResponse>;
  /** Kayıt 2. adım: kodu doğrular ve hesabı oluşturur */
  register: (username: string, email: string, password: string, code: string, remember?: boolean) => Promise<User>;
  /** Bu cihazdan çıkış: yalnızca bu cihazın güvenilir kaydı iptal edilir */
  logout: () => Promise<void>;
  /** Tüm cihazlardan çıkış: tüm güvenilir cihazlar ve oturumlar iptal edilir */
  logoutAll: () => Promise<void>;
  /** Girişli değilse giriş penceresini açar ve false döner */
  requireAuth: () => boolean;
  /** Profil güncellenince oturumdaki kullanıcıyı yeniler */
  updateUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  useEffect(() => {
    // Açılış kontrolü sessiz (giriş penceresi haritayı kaplamasın):
    // belirteç varsa doğrula (süresi dolmuşsa api() güvenilir cihazla kendisi tazeler); yoksa güvenilir cihazla dene.
    const check = getToken()
      ? api<{ user: User }>('/auth/me', { silent: true }).then((r) => r.user)
      : refreshSession().then((r) => r?.user ?? null);
    check
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onRefreshed = (e: Event) => setUser((e as CustomEvent<User>).detail);
    window.addEventListener(AUTH_REFRESHED_EVENT, onRefreshed);
    return () => window.removeEventListener(AUTH_REFRESHED_EVENT, onRefreshed);
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setAuthMode('login');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const finish = (r: { token: string; user: User }) => {
    setToken(r.token);
    setUser(r.user);
    setAuthMode(null);
    return r.user;
  };

  const login = useCallback(
    async (username: string, password: string, remember = true) =>
      finish(await api('/auth/login', { method: 'POST', body: { username, password, remember } })),
    [],
  );
  const sendCode = useCallback(
    (email: string, username: string) =>
      api<SendCodeResponse>('/auth/send-code', { method: 'POST', body: { email, username } }),
    [],
  );
  const register = useCallback(
    async (username: string, email: string, password: string, code: string, remember = true) =>
      finish(await api('/auth/register', { method: 'POST', body: { username, email, password, code, remember } })),
    [],
  );
  const clearLocal = () => {
    setToken(null);
    setUser(null);
  };
  const logout = useCallback(async () => {
    // Sunucu bu cihazın güvenilir kaydını iptal eder ve çerezi siler; ağ hatasında da yerelde çıkış yapılır
    await api('/auth/logout', { method: 'POST', silent: true }).catch(() => undefined);
    clearLocal();
  }, []);
  const logoutAll = useCallback(async () => {
    await api('/auth/logout-all', { method: 'POST', silent: true });
    clearLocal();
  }, []);
  const openAuth = useCallback((mode: AuthMode = 'login') => setAuthMode(mode), []);
  const closeAuth = useCallback(() => setAuthMode(null), []);
  const requireAuth = useCallback(() => {
    if (user) return true;
    setAuthMode('login');
    return false;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, ready, authMode, openAuth, closeAuth, login, sendCode, register, logout, logoutAll, requireAuth, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
