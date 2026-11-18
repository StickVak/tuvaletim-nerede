/** Oturum sona erince (401) panel giriş ekranına döner */
export const SESSION_EXPIRED_EVENT = 'tn-admin-session-expired';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        // CSRF: admin sunucusu değiştiren isteklerde bu başlığı ister
        'X-TN-Admin': '1',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Panel sunucusuna ulaşılamadı. Bağlantınızı kontrol edin.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* JSON olmayan yanıt */
  }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? `İstek başarısız (${res.status}).`);
  }
  return data as T;
}

/** Yönetim API'si: path '/admin/...' → admin sunucusu → ana sunucu (X-Admin-Key ile) */
export function api<T>(path: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}): Promise<T> {
  return request<T>(`/api${path}`, method, body);
}

export interface Session {
  ok: true;
  appUrl?: string;
  expiresAt?: string;
}

export const auth = {
  me: () => request<Session>('/auth/me', 'GET'),
  login: (key: string) => request<Session>('/auth/login', 'POST', { key }),
  logout: () => request<null>('/auth/logout', 'POST'),
};
