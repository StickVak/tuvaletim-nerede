import { AlertTriangle, Heart, Navigation } from 'lucide-react';
import type { PlaceView } from '../types';
import { CATEGORIES, placePhoto } from '../lib/categories';
import { formatDistance, formatWalk } from '../lib/geo';
import StarRating from './StarRating';
import { FeatureIcons, PriceBadge, RatingText } from './Badges';

interface Props {
  place: PlaceView;
  active?: boolean;
  onSelect: (id: string) => void;
  /** Uygulama içi yol tarifi */
  onRoute: (id: string) => void;
  onToggleFavorite: (place: PlaceView) => void;
}

export default function ToiletListItem({ place, active, onSelect, onRoute, onToggleFavorite }: Props) {
  const cat = CATEGORIES[place.category];
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(place.id)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(place.id)}
        className={`flex w-full items-center gap-3 rounded-3xl p-2.5 text-left transition active:scale-[.99] ${
          active ? 'bg-brand-soft ring-2 ring-brand-dark' : 'bg-card hover:bg-line/60'
        }`}
      >
        <div className="relative shrink-0">
          <img src={placePhoto(place)} alt="" loading="lazy" className="h-[76px] w-[76px] rounded-2xl bg-line object-cover" />
          <button
            type="button"
            aria-label={place.isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
            aria-pressed={place.isFavorite}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(place);
            }}
            className="absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-surface shadow-float"
          >
            <Heart size={14} className={place.isFavorite ? 'text-red-500' : 'text-ink-muted'} fill={place.isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PriceBadge stats={place.stats} />
            <span className="truncate text-[11px] font-semibold text-ink-muted">
              {cat.label}
              {place.district ? ` · ${place.district}` : ''}
            </span>
            <FeatureIcons place={place} />
          </div>
          <h3 className="mt-1 truncate text-[15px] font-bold leading-tight text-ink">{place.name}</h3>
          {place.status.closed && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold text-white">
              <AlertTriangle size={11} /> Geçici Olarak Kapalı Bildirildi
            </p>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            {place.stats.voteCount > 0 && <StarRating value={place.stats.rating} size={12} />}
            <RatingText stats={place.stats} />
          </div>
          {place.distance !== null && (
            <p className="mt-0.5 truncate text-xs font-medium text-ink-muted">
              {formatDistance(place.distance)} · {formatWalk(place.distance)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRoute(place.id);
          }}
          className="flex shrink-0 flex-col items-center gap-1 self-stretch rounded-2xl bg-ink px-3 py-2 text-[10px] font-bold text-surface transition hover:opacity-90 active:scale-95"
          aria-label={`${place.name} için yol tarifi`}
        >
          <span className="flex flex-1 items-center">
            <Navigation size={18} className="text-brand" fill="currentColor" />
          </span>
          Yol Tarifi
        </button>
      </div>
    </li>
  );
}
