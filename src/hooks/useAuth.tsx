import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../types';
import { AUTH_EXPIRED_EVENT, api, getToken, setToken } from '../api';
import type { SendCodeResponse } from '../lib/otp';

export type AuthMode = 'login' | 'register';

interface AuthState {
  user: User | null;
  /** İlk oturum kontrolü bitti mi */
  ready: boolean;
  authMode: AuthMode | null;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  login: (username: string, password: string) => Promise<User>;
  /** Kayıt 1. adım: e-postaya 6 haneli doğrulama kodu gönderir */
  sendCode: (email: string, username: string) => Promise<SendCodeResponse>;
  /** Kayıt 2. adım: kodu doğrular ve hesabı oluşturur */
  register: (username: string, email: string, password: string, code: string) => Promise<User>;
  logout: () => void;
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
    if (!getToken()) {
      setReady(true);
      return;
    }
    // Açılış kontrolü sessiz: süresi dolmuş oturum haritanın üstünü kaplamasın
    api<{ user: User }>('/auth/me', { silent: true })
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
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
    async (username: string, password: string) => finish(await api('/auth/login', { method: 'POST', body: { username, password } })),
    [],
  );
  const sendCode = useCallback(
    (email: string, username: string) =>
      api<SendCodeResponse>('/auth/send-code', { method: 'POST', body: { email, username } }),
    [],
  );
  const register = useCallback(
    async (username: string, email: string, password: string, code: string) =>
      finish(await api('/auth/register', { method: 'POST', body: { username, email, password, code } })),
    [],
  );
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);
  const openAuth = useCallback((mode: AuthMode = 'login') => setAuthMode(mode), []);
  const closeAuth = useCallback(() => setAuthMode(null), []);
  const requireAuth = useCallback(() => {
    if (user) return true;
    setAuthMode('login');
    return false;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, ready, authMode, openAuth, closeAuth, login, sendCode, register, logout, requireAuth, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
