import { Footprints, Info, Loader2, Navigation, X } from 'lucide-react';
import type { PlaceView, RouteState } from '../types';
import { formatDistance } from '../lib/geo';

interface Props {
  place: PlaceView;
  route: RouteState;
  desktop: boolean;
  onClose: () => void;
}

/** Uygulama içi yol tarifi: mesafe, tahmini yürüme süresi, Rotayı Bitir */
export default function RouteCard({ place, route, desktop, onClose }: Props) {
  const minutes = Math.max(1, Math.round(route.duration / 60));
  return (
    <div
      role="region"
      aria-label="Yol tarifi"
      className={`absolute z-40 animate-slide-down overflow-hidden rounded-[28px] bg-surface text-ink shadow-float ring-1 ring-line ${
        desktop ? 'left-[432px] top-4 w-[400px]' : 'inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))]'
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <Navigation size={20} fill="currentColor" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Yol tarifi</p>
          <h2 className="truncate text-base font-extrabold leading-tight">{place.name}</h2>
          <div className="mt-1 flex items-baseline gap-3">
            {route.loading ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
                <Loader2 size={14} className="animate-spin" /> Rota hesaplanıyor…
              </span>
            ) : (
              <>
                <span className="text-xl font-extrabold" data-testid="route-distance">{formatDistance(route.distance)}</span>
                <span className="flex items-center gap-1 text-sm font-semibold text-ink-soft" data-testid="route-duration">
                  <Footprints size={15} /> {minutes} dk yürüme
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-card py-3 text-sm font-bold text-ink transition hover:bg-line/60"
        >
          <X size={16} /> Rotayı Bitir
        </button>
      </div>
      {route.approximate && !route.loading && (
        <p className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-[11px] text-ink-muted">
          <Info size={12} /> Rota servisine ulaşılamadı; kuş uçuşu mesafe gösteriliyor.
        </p>
      )}
    </div>
  );
}
