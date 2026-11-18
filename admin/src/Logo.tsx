import logoUrl from '../../public/logo.png';

/** Uygulama logosu (ana uygulamayla aynı görsel; panel paketine dahil edilir) */
export default function Logo({ size = 36 }: { size?: number }) {
  return <img src={logoUrl} alt="" aria-hidden width={size} height={size} className="shrink-0 select-none" draggable={false} style={{ width: size, height: size }} />;
}
