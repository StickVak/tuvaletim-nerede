import { Footprints, Info, Navigation, Siren, X } from 'lucide-react';
import type { EmergencyState, LatLng, PlaceView } from '../types';
import { formatDistance, googleMapsDirections, walkMinutes } from '../lib/geo';
import { placePhoto } from '../lib/categories';
import StarRating from './StarRating';
import { PriceBadge, RatingText } from './Badges';

interface Props {
  place: PlaceView;
  emergency: EmergencyState;
  user: LatLng | null;
  desktop: boolean;
  onClose: () => void;
  onDetails: () => void;
}

export default function EmergencyCard({ place, emergency, user, desktop, onClose, onDetails }: Props) {
  const distance = emergency.routeDistance ?? place.distance ?? 0;
  return (
    <div
      className={`absolute z-40 animate-slide-down overflow-hidden rounded-[28px] bg-white shadow-float ring-1 ring-black/5 ${
        desktop ? 'left-[432px] top-4 w-[420px]' : 'inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))]'
      }`}
    >
      <div className="flex items-center justify-between bg-gradient-to-r from-red-500 to-red-600 px-4 py-2.5 text-white">
        <span className="flex items-center gap-2 text-xs font-extrabold tracking-wider">
          <Siren size={16} /> ACİL · EN UYGUN TUVALET
        </span>
        <button type="button" onClick={onClose} aria-label="Acil modunu kapat" className="rounded-full p-1 hover:bg-white/20">
          <X size={18} />
        </button>
      </div>

      <div className="flex gap-3 p-4">
        <img src={placePhoto(place)} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-gray-200 object-cover" />
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
              <Footprints size={15} /> {walkMinutes(distance)} dk
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-4">
        <a
          href={googleMapsDirections(user, place)}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-base font-extrabold text-ink shadow-sm transition hover:bg-brand-dark active:scale-[.98]"
        >
          <Navigation size={19} fill="currentColor" /> Hemen Git
        </a>
        <button type="button" onClick={onDetails} className="rounded-2xl bg-card px-4 text-sm font-bold text-ink transition hover:bg-gray-100">
          Detay
        </button>
      </div>

      {emergency.approximate && (
        <p className="flex items-center gap-1.5 border-t border-gray-100 px-4 py-2 text-[11px] text-ink-muted">
          <Info size={12} /> Rota kuş uçuşu gösteriliyor; detaylı tarif için “Hemen Git”e dokunun.
        </p>
      )}
    </div>
  );
}
