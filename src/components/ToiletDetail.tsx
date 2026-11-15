import { Accessibility, ArrowLeft, Baby, Clock, MapPin, Navigation, Sparkles, Sofa, Wallet } from 'lucide-react';
import type { LatLng, ToiletWithDistance } from '../types';
import { CATEGORIES } from '../lib/categories';
import { avgRating, formatDistance, googleMapsDirections, walkMinutes } from '../lib/geo';
import StarRating from './StarRating';
import { PriceBadge } from './Badges';

interface Props {
  toilet: ToiletWithDistance;
  user: LatLng;
  onBack: () => void;
}

export default function ToiletDetail({ toilet, user, onBack }: Props) {
  const cat = CATEGORIES[toilet.category];
  const CatIcon = cat.icon;
  const rating = avgRating(toilet);

  return (
    <div className="animate-slide-up px-4 pb-6">
      <div className="relative overflow-hidden rounded-3xl">
        <img src={toilet.photo} alt={toilet.name} className="h-44 w-full bg-gray-200 object-cover" />
        <button
          type="button"
          onClick={onBack}
          aria-label="Listeye dön"
          className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-ink shadow-float"
        >
          <ArrowLeft size={19} />
        </button>
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-ink">
          <CatIcon size={14} /> {cat.label}
        </div>
        {toilet.userAdded && (
          <div className="absolute right-3 top-3 rounded-full bg-ink/85 px-2.5 py-1 text-[10px] font-bold text-white">
            Topluluk ekledi
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-tight text-ink">{toilet.name}</h2>
          {toilet.address && (
            <p className="mt-1 flex items-start gap-1 text-sm text-ink-muted">
              <MapPin size={14} className="mt-0.5 shrink-0" />
              {toilet.address}
            </p>
          )}
        </div>
        <div className="shrink-0 rounded-2xl bg-brand px-3 py-2 text-center">
          <div className="text-lg font-extrabold leading-none text-ink">{rating.toFixed(1).replace('.', ',')}</div>
          <div className="mt-0.5 text-[10px] font-bold text-ink/70">PUAN</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Sparkles size={14} /> Temizlik
          </div>
          <div className="mt-1.5"><StarRating value={toilet.cleanliness} size={15} /></div>
        </div>
        <div className="rounded-2xl bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Sofa size={14} /> Konfor
          </div>
          <div className="mt-1.5"><StarRating value={toilet.comfort} size={15} /></div>
        </div>
        <div className="rounded-2xl bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Wallet size={14} /> Ücret
          </div>
          <div className="mt-1.5"><PriceBadge toilet={toilet} size="md" /></div>
        </div>
        <div className="rounded-2xl bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Clock size={14} /> Saatler
          </div>
          <div className="mt-1.5 text-sm font-bold text-ink">{toilet.hours ?? 'Bilinmiyor'}</div>
        </div>
      </div>

      {(toilet.accessible || toilet.babyChanging) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {toilet.accessible && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <Accessibility size={14} /> Engelli erişimi
            </span>
          )}
          {toilet.babyChanging && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-3 py-1.5 text-xs font-semibold text-pink-700">
              <Baby size={14} /> Bebek bakım ünitesi
            </span>
          )}
        </div>
      )}

      <a
        href={googleMapsDirections(user, toilet)}
        target="_blank"
        rel="noreferrer"
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-base font-bold text-white shadow-float transition hover:bg-black active:scale-[.98]"
      >
        <Navigation size={19} className="text-brand" fill="currentColor" />
        Yol Tarifi · {formatDistance(toilet.distance)} ({walkMinutes(toilet.distance)} dk)
      </a>
    </div>
  );
}
