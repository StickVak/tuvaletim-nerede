import { db, hashPassword, syncEnvAdmin } from '../db/db';
import { randomId } from '../lib/sha256';
import type { AdminUser } from '../types';

const SESSION_KEY = 'tn.admin.session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ATTEMPT_KEY = 'tn.admin.attempts';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 1000;

interface StoredSession {
  userId: number;
  token: string;
}

interface Attempts {
  count: number;
  until: number;
}

function readAttempts(): Attempts {
  try {
    return JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || '{"count":0,"until":0}');
  } catch {
    return { count: 0, until: 0 };
  }
}

/** Kaba kuvvet denemelerine karşı: 5 hatalı denemeden sonra 30 sn bekleme */
export function loginLockedFor(): number {
  const a = readAttempts();
  return a.until > Date.now() ? a.until - Date.now() : 0;
}

export async function login(username: string, password: string): Promise<AdminUser> {
  if (loginLockedFor()) throw new Error('LOCKED');
  await syncEnvAdmin();
  const user = await db.admin_users.where('username').equals(username.trim()).first();
  if (!user || user.passwordHash !== hashPassword(password, user.salt)) {
    const a = readAttempts();
    const count = a.count + 1;
    sessionStorage.setItem(
      ATTEMPT_KEY,
      JSON.stringify(count >= MAX_ATTEMPTS ? { count: 0, until: Date.now() + LOCKOUT_MS } : { count, until: 0 }),
    );
    throw new Error('INVALID');
  }
  sessionStorage.removeItem(ATTEMPT_KEY);
  const token = randomId(24);
  const now = Date.now();
  await db.admin_users.update(user.id!, {
    sessionToken: token,
    sessionExpires: now + SESSION_TTL_MS,
    lastLoginAt: new Date(now).toISOString(),
  });
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id!, token } satisfies StoredSession));
  return { ...user, sessionToken: token };
}

export async function restoreSession(): Promise<AdminUser | null> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    const user = await db.admin_users.get(s.userId);
    if (!user || user.sessionToken !== s.token || !user.sessionExpires || user.sessionExpires < Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

export async function logout(user: AdminUser | null) {
  sessionStorage.removeItem(SESSION_KEY);
  if (user?.id) await db.admin_users.update(user.id, { sessionToken: undefined, sessionExpires: undefined });
}
