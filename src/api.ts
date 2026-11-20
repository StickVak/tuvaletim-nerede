import type { User } from './types';

const TOKEN_KEY = 'tn.token';
export const AUTH_EXPIRED_EVENT = 'tn-auth-expired';
/** Güvenilir cihazla oturum sessizce tazelendi (detail: güncel kullanıcı) */
export const AUTH_REFRESHED_EVENT = 'tn-auth-refreshed';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Sunucunun bildirdiği bekleme (sn): gövdedeki retryAfter ya da Retry-After başlığı */
    public retryAfter: number | null = null,
    /** Sunucunun kararlı hata nedeni (ör. rate_limit, network, unavailable) */
    public reason: string | null = null,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* gizli sekme vb. */
  }
}

let refreshing: Promise<{ token: string; user: User } | null> | null = null;

/**
 * Güvenilir cihaz çereziyle (HttpOnly, sunucuda doğrulanır) sessiz oturum tazeleme.
 * Başarılıysa yeni belirteç kaydedilir ve AUTH_REFRESHED_EVENT yayınlanır; değilse null (standart girişe düşülür).
 * Aynı anda gelen çağrılar tek istekte birleşir.
 */
export function refreshSession(): Promise<{ token: string; user: User } | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = (await res.json()) as { token: string; user: User };
      setToken(data.token);
      window.dispatchEvent(new CustomEvent(AUTH_REFRESHED_EVENT, { detail: data.user }));
      return data;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * /api altındaki uç noktalara JSON istek. Hata durumunda sunucunun Türkçe mesajıyla ApiError fırlatır.
 * 401'de (giriş uçları hariç) önce güvenilir cihazla oturum sessizce tazelenip istek BİR kez yeniden denenir;
 * olmazsa belirteç silinir ve silent değilse giriş penceresi açılsın diye AUTH_EXPIRED_EVENT yayınlanır.
 */
export async function api<T>(
  path: string,
  { method = 'GET', body, silent = false }: { method?: string; body?: unknown; silent?: boolean } = {},
  retried = false,
): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.');
  }
  if (res.status === 401 && token && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    if (!retried && (await refreshSession())) return api<T>(path, { method, body, silent }, true);
    setToken(null);
    if (!silent) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const header = Number(res.headers.get('Retry-After'));
    const retryAfter = Number(data?.retryAfter) > 0 ? Number(data.retryAfter) : header > 0 ? header : null;
    throw new ApiError(res.status, data?.error ?? 'Beklenmeyen bir hata oluştu.', retryAfter, data?.reason ?? null);
  }
  return data as T;
}
