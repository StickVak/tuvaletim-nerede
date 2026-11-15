import { Accessibility, Baby } from 'lucide-react';
import type { Toilet } from '../types';

export function PriceBadge({ toilet, size = 'sm' }: { toilet: Pick<Toilet, 'isFree' | 'price'>; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';
  return toilet.isFree ? (
    <span className={`inline-flex items-center rounded-full bg-green-100 font-bold text-green-700 ${cls}`}>Ücretsiz</span>
  ) : (
    <span className={`inline-flex items-center rounded-full bg-brand-soft font-bold text-ink ${cls}`}>
      {toilet.price ? toilet.price : 'Ücretli'}
    </span>
  );
}

export function FeatureIcons({ toilet }: { toilet: Pick<Toilet, 'accessible' | 'babyChanging'> }) {
  if (!toilet.accessible && !toilet.babyChanging) return null;
  return (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      {toilet.accessible && <Accessibility size={13} aria-label="Engelli erişimi" />}
      {toilet.babyChanging && <Baby size={13} aria-label="Bebek bakım ünitesi" />}
    </span>
  );
}
