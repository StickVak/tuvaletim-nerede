import { Footprints, Info, Navigation, Siren, X } from 'lucide-react';
import type { PlaceView, RouteState } from '../types';
import { formatDistance } from '../lib/geo';
import { placePhoto } from '../lib/categories';
import StarRating from './StarRating';
import { PriceBadge, RatingText } from './Badges';

interface Props {
  place: PlaceView;
  route: RouteState;
  desktop: boolean;
  onClose: () => void;
  onDetails: () => void;
  /** Uygulama içi rotayı başlatır (rota bilgi kartına geçer) */
  onGo: () => void;
}

export default function EmergencyCard({ place, route, desktop, onClose, onDetails, onGo }: Props) {
  const distance = route.distance;
  const minutes = Math.max(1, Math.round(route.duration / 60));
  return (
    <div
      className={`absolute z-40 animate-slide-down overflow-hidden rounded-[28px] bg-surface shadow-float ring-1 ring-line ${
        desktop ? 'left-[432px] top-4 w-[420px]' : 'inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))]'
      }`}
    >
      <div className="flex items-center justify-between bg-red-500 px-4 py-2.5 text-white">
        <span className="flex items-center gap-2 text-xs font-extrabold tracking-wider">
          <Siren size={16} /> ACİL · EN UYGUN TUVALET
        </span>
        <button type="button" onClick={onClose} aria-label="Acil modunu kapat" className="rounded-full p-1 hover:bg-white/20">
          <X size={18} />
        </button>
      </div>

      <div className="flex gap-3 p-4">
        <img src={placePhoto(place)} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-line object-cover" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold leading-tight text-ink">{place.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {place.stats.voteCount > 0 && <StarRating value={place.stats.rating} size={13} />}
            <RatingText stats={place.stats} />
            <PriceBadge stats={place.stats} />
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-extrabold text-ink">{formatDistance(distance)}</span>
            <span className="flex items-center gap-1 text-sm font-semibold text-ink-muted">
              <Footprints size={15} /> {minutes} dk
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-4">
        <button
          type="button"
          onClick={onGo}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-base font-extrabold text-onbrand shadow-sm transition hover:bg-brand-dark active:scale-[.98]"
        >
          <Navigation size={19} fill="currentColor" /> Hemen Git
        </button>
        <button type="button" onClick={onDetails} className="rounded-2xl bg-card px-4 text-sm font-bold text-ink transition hover:bg-line/60">
          Detay
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
