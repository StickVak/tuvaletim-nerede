import { Accessibility, Baby } from 'lucide-react';
import type { Place, PlaceStats } from '../types';
import { feeLabel } from '../lib/categories';

export function PriceBadge({ stats, size = 'sm' }: { stats: Pick<PlaceStats, 'isPaid' | 'avgPrice'>; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';
  const tone = stats.isPaid ? 'bg-brand-soft text-ink' : 'bg-green-100 text-green-700';
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full font-bold ${tone} ${cls}`}>{feeLabel(stats)}</span>;
}

export function FeatureIcons({ place }: { place: Pick<Place, 'accessible' | 'babyChanging'> }) {
  if (!place.accessible && !place.babyChanging) return null;
  return (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      {place.accessible && <Accessibility size={13} aria-label="Engelli erişimi" />}
      {place.babyChanging && <Baby size={13} aria-label="Bebek bakım ünitesi" />}
    </span>
  );
}

/** `4,3 (12 oy)` ya da `Henüz puanlanmadı` */
export function RatingText({ stats }: { stats: PlaceStats }) {
  if (!stats.voteCount) return <span className="text-xs font-medium text-ink-muted">Henüz puanlanmadı · 0 oy</span>;
  return (
    <span className="text-xs font-bold text-ink">
      {stats.rating.toFixed(1).replace('.', ',')} <span className="font-medium text-ink-muted">({stats.voteCount} oy)</span>
    </span>
  );
}
