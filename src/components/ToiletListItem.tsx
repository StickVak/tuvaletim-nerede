import { Navigation } from 'lucide-react';
import type { LatLng, ToiletWithDistance } from '../types';
import { CATEGORIES } from '../lib/categories';
import { avgRating, formatDistance, googleMapsDirections, walkMinutes } from '../lib/geo';
import StarRating from './StarRating';
import { FeatureIcons, PriceBadge } from './Badges';

interface Props {
  toilet: ToiletWithDistance;
  user: LatLng;
  rank?: number;
  onSelect: (id: string) => void;
}

export default function ToiletListItem({ toilet, user, onSelect }: Props) {
  const cat = CATEGORIES[toilet.category];
  const rating = avgRating(toilet);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(toilet.id)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(toilet.id)}
        className="flex w-full items-center gap-3 rounded-3xl bg-card p-2.5 text-left transition hover:bg-gray-100 active:scale-[.99]"
      >
        <img
          src={toilet.photo}
          alt={toilet.name}
          loading="lazy"
          className="h-[76px] w-[76px] shrink-0 rounded-2xl bg-gray-200 object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PriceBadge toilet={toilet} />
            <span className="text-[11px] font-semibold text-ink-muted">{cat.label}</span>
            <FeatureIcons toilet={toilet} />
          </div>
          <h3 className="mt-1 truncate text-[15px] font-bold leading-tight text-ink">{toilet.name}</h3>
          <div className="mt-1 flex items-center gap-1.5">
            <StarRating value={rating} size={12} />
            <span className="text-xs font-bold text-ink">{rating.toFixed(1).replace('.', ',')}</span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-ink-muted">
            {formatDistance(toilet.distance)} · {walkMinutes(toilet.distance)} dk yürüme
          </p>
        </div>
        <a
          href={googleMapsDirections(user, toilet)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 flex-col items-center gap-1 self-stretch rounded-2xl bg-ink px-3 py-2 text-[10px] font-bold text-white transition hover:bg-black active:scale-95"
          aria-label={`${toilet.name} için yol tarifi`}
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
