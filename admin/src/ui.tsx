import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ImageOff, Maximize2, X } from 'lucide-react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: typeof X; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-line bg-surface px-6 py-14 text-center">
      <Icon size={34} className="text-ink-muted/60" />
      <p className="mt-3 font-bold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-muted">{text}</p>}
    </div>
  );
}

export function ConfirmDialog({
  title, text, confirmLabel, onConfirm, onCancel,
}: { title: string; text: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-sm animate-slide-up rounded-3xl bg-surface p-6 shadow-2xl">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-600">
          <AlertTriangle size={24} />
        </span>
        <h2 className="mt-4 text-lg font-extrabold">{title}</h2>
        <div className="mt-1.5 text-sm text-ink-soft">{text}</div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-2xl bg-card py-3 text-sm font-bold hover:bg-line/60">
            Vazgeç
          </button>
          <button type="button" onClick={onConfirm} className="rounded-2xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const inputCls =
  'w-full rounded-xl border-2 border-transparent bg-card px-3.5 py-2.5 text-sm font-medium outline-none transition focus:border-brand-dark focus:bg-surface';

export const selectCls =
  'rounded-xl border-2 border-transparent bg-surface px-3 py-2.5 text-sm font-semibold outline-none ring-1 ring-line focus:border-brand-dark';

export function relTime(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} gün önce` : new Date(iso).toLocaleDateString('tr-TR');
}

/** Tam ekran fotoğraf görüntüleyici (Esc veya tıklamayla kapanır) */
export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
      <button type="button" onClick={onClose} aria-label="Kapat" className="absolute right-4 top-4 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25">
        <X size={20} />
      </button>
    </div>
  );
}

/** Dış mekan fotoğrafı: etiketli, tıklayınca tam ekran */
export function OutdoorPhoto({ src, alt, className = 'h-56' }: { src: string | null; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!src) {
    return (
      <div className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-card text-ink-muted ${className}`}>
        <ImageOff size={24} />
        <span className="text-xs font-semibold">Dış mekan fotoğrafı yok</span>
      </div>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`group relative block w-full overflow-hidden rounded-2xl bg-card ${className}`} aria-label={`${alt} — büyüt`}>
        <img src={src} alt={alt} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white">Dış mekan fotoğrafı</span>
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white">
          <Maximize2 size={12} /> Büyüt
        </span>
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
