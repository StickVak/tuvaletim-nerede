import { LocateOff, RotateCw } from 'lucide-react';

interface Props {
  desktop: boolean;
  /** Elle konum zaten varken yeniden seçiliyorsa */
  remarking: boolean;
  onRetry: () => void;
  onCancel?: () => void;
}

/** Konum izni yokken: kibar uyarı + haritaya dokunarak konum işaretleme */
export default function LocationBanner({ desktop, remarking, onRetry, onCancel }: Props) {
  return (
    <div
      role="status"
      className={`absolute z-30 animate-slide-down rounded-3xl bg-surface p-4 text-ink shadow-float ring-1 ring-line ${
        desktop ? 'left-[432px] top-4 w-[400px]' : 'inset-x-4 top-[calc(max(1rem,env(safe-area-inset-top))+60px)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/20 text-ink">
          <LocateOff size={19} />
        </span>
        <p className="flex-1 text-sm">
          <b className="block">{remarking ? 'Konumunuzu yeniden işaretleyin' : 'Konumunuza erişemedik.'}</b>
          <span className="text-ink-soft">Haritada bulunduğunuz noktaya dokunun.</span>
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onRetry} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-card py-2 text-xs font-bold">
          <RotateCw size={14} /> Konum iznini tekrar dene
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-xl bg-card px-4 py-2 text-xs font-bold">
            Vazgeç
          </button>
        )}
      </div>
    </div>
  );
}
