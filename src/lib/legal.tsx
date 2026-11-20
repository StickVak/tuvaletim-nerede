/** Hizmet Şartları ve Gizlilik Politikası: sunucuda düz HTML sayfalar (server/legal.js) */
export const PRIVACY_URL = '/gizlilik-politikasi';
export const TERMS_URL = '/hizmet-sartlari';
export const TERMS_REQUIRED = "Devam etmek için Hizmet Şartları'nı ve Gizlilik Politikası'nı kabul etmelisiniz.";

const link = 'font-bold text-ink underline underline-offset-2';

/** Yeni sekmede açılır: doldurulmakta olan form kaybolmaz */
export function TermsLink({ className = link }: { className?: string }) {
  return (
    <a href={TERMS_URL} target="_blank" rel="noopener" className={className}>
      Hizmet Şartları
    </a>
  );
}

export function PrivacyLink({ className = link }: { className?: string }) {
  return (
    <a href={PRIVACY_URL} target="_blank" rel="noopener" className={className}>
      Gizlilik Politikası
    </a>
  );
}
