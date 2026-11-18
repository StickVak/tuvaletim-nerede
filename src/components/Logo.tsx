/** Uygulama logosu (public/logo.png; köşeleri şeffaf, yuvarlatılmış). */
export default function Logo({ size = 36 }: { size?: number }) {
  return <img src="/logo.png" alt="" aria-hidden width={size} height={size} className="shrink-0 select-none" draggable={false} style={{ width: size, height: size }} />;
}
