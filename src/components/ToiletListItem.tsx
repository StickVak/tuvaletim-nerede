import { Navigation } from 'lucide-react';
import type { LatLng, PlaceView } from '../types';
import { CATEGORIES, placePhoto } from '../lib/categories';
import { formatDistance, formatScore, formatWalk, googleMapsDirections } from '../lib/geo';
import StarRating from './StarRating';
import { FeatureIcons, PriceBadge } from './Badges';

interface Props {
  place: PlaceView;
  user: LatLng;
  active?: boolean;
  onSelect: (id: string) => void;
}

export default function ToiletListItem({ place, user, active, onSelect }: Props) {
  const cat = CATEGORIES[place.category];
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(place.id)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(place.id)}
        className={`flex w-full items-center gap-3 rounded-3xl p-2.5 text-left transition active:scale-[.99] ${
          active ? 'bg-brand-soft ring-2 ring-brand-dark' : 'bg-card hover:bg-gray-100'
        }`}
      >
        <img
          src={placePhoto(place)}
          alt=""
          loading="lazy"
          className="h-[76px] w-[76px] shrink-0 rounded-2xl bg-gray-200 object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PriceBadge place={place} />
            <span className="truncate text-[11px] font-semibold text-ink-muted">
              {cat.label}
              {place.district ? ` · ${place.district}` : ''}
            </span>
            <FeatureIcons place={place} />
          </div>
          <h3 className="mt-1 truncate text-[15px] font-bold leading-tight text-ink">{place.name}</h3>
          <div className="mt-1 flex items-center gap-1.5">
            <StarRating value={place.rating} size={12} />
            <span className="text-xs font-bold text-ink">{place.ratingCount ? formatScore(place.rating) : '–'}</span>
            <span className="text-[11px] text-ink-muted">({place.ratingCount})</span>
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-muted">
            {formatDistance(place.distance)} · {formatWalk(place.distance)}
          </p>
        </div>
        <a
          href={googleMapsDirections(user, place)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 flex-col items-center gap-1 self-stretch rounded-2xl bg-ink px-3 py-2 text-[10px] font-bold text-white transition hover:bg-black active:scale-95"
          aria-label={`${place.name} için yol tarifi`}
        >
          <span className="flex flex-1 items-center">
            <Navigation size={18} className="text-brand" fill="currentColor" />
          </span>
          Yol Tarifi
        </a>
      </div>
    </li>
  );
}
