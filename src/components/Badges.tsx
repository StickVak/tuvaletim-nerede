import { Accessibility, Baby } from 'lucide-react';
import type { PlaceBase } from '../types';
import { feeLabel } from '../lib/categories';

export function PriceBadge({ place, size = 'sm' }: { place: Pick<PlaceBase, 'fee' | 'price'>; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';
  const tone =
    place.fee === 'free'
      ? 'bg-green-100 text-green-700'
      : place.fee === 'customers'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-brand-soft text-ink';
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full font-bold ${tone} ${cls}`}>{feeLabel(place)}</span>;
}

export function FeatureIcons({ place }: { place: Pick<PlaceBase, 'accessible' | 'babyChanging'> }) {
  if (!place.accessible && !place.babyChanging) return null;
  return (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      {place.accessible && <Accessibility size={13} aria-label="Engelli erişimi" />}
      {place.babyChanging && <Baby size={13} aria-label="Bebek bakım ünitesi" />}
    </span>
  );
}
