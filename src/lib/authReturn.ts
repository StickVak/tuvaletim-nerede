/** Google ile girişten dönüşte URL'deki ?auth= / ?auth_error= parametrelerini kullanıcı mesajına çevirir */

const ERRORS: Record<string, string> = {
  google_disabled: 'Google ile giriş şu an kullanılamıyor.',
  cancelled: 'Google ile giriş iptal edildi.',
  state: 'Giriş isteğinin süresi doldu ya da geçersiz. Lütfen tekrar deneyin.',
  email_unverified: 'Google hesabınızın e-posta adresi doğrulanmamış. Lütfen başka bir yöntemle giriş yapın.',
  account_conflict: 'Bu e-posta adresi başka bir Google hesabına bağlı. Lütfen şifrenizle giriş yapın.',
};
const GENERIC = 'Google ile giriş tamamlanamadı. Lütfen tekrar deneyin.';

export interface AuthReturn {
  tone: 'success' | 'error';
  text: string;
}

/** search: location.search; ilgili parametre yoksa null */
export function readAuthReturn(search: string): AuthReturn | null {
  const p = new URLSearchParams(search);
  const err = p.get('auth_error');
  if (err !== null) return { tone: 'error', text: ERRORS[err] ?? GENERIC };
  if (p.get('auth') === 'google') {
    return p.get('new') === '1'
      ? { tone: 'success', text: 'Google hesabınızla kaydınız oluşturuldu. Kullanıcı adınızı Profil’den değiştirebilirsiniz.' }
      : { tone: 'success', text: 'Google ile giriş yapıldı.' };
  }
  return null;
}

/** Bildirimden sonra adres çubuğunu temizler (yenilemede tekrar gösterilmesin); diğer parametreler korunur */
export function stripAuthParams(href: string): string {
  const u = new URL(href);
  for (const k of ['auth', 'auth_error', 'new']) u.searchParams.delete(k);
  return u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '') + u.hash;
}
