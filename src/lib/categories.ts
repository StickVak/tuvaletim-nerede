import { Coffee, Landmark, MapPin, ShoppingBag, Trees, type LucideIcon } from 'lucide-react';
import type { FeeType, PlaceBase, ToiletCategory } from '../types';

export const CATEGORIES: Record<ToiletCategory, { label: string; icon: LucideIcon; from: string; to: string }> = {
  avm: { label: 'AVM', icon: ShoppingBag, from: '#FFE566', to: '#FFC300' },
  kafe: { label: 'Kafe', icon: Coffee, from: '#F7DDBF', to: '#D4A373' },
  belediye: { label: 'Belediye', icon: Landmark, from: '#CFE3FF', to: '#6FA8F7' },
  park: { label: 'Park', icon: Trees, from: '#C9F5D6', to: '#5AD27F' },
  diger: { label: 'Diğer', icon: MapPin, from: '#ECEDEF', to: '#A9AEB6' },
};

export const CATEGORY_ORDER: ToiletCategory[] = ['avm', 'kafe', 'belediye', 'park', 'diger'];

export const FEE_LABELS: Record<FeeType, string> = {
  free: 'Ücretsiz',
  customers: 'Müşteriye Ücretsiz',
  paid: 'Ücretli',
};

export function feeLabel(p: Pick<PlaceBase, 'fee' | 'price'>): string {
  return p.fee === 'paid' && p.price ? p.price : FEE_LABELS[p.fee];
}

const cache = new Map<string, string>();

/** API'siz, her zaman çalışan temsili görsel (SVG data URI). */
export function placeholderPhoto(category: ToiletCategory, variant = 0): string {
  const key = `${category}-${variant % 3}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = CATEGORIES[category];
  const cx = 520 - (variant % 3) * 60;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.from}"/><stop offset="1" stop-color="${c.to}"/></linearGradient></defs>
<rect width="640" height="400" fill="url(#g)"/>
<circle cx="${cx}" cy="70" r="150" fill="#fff" opacity=".18"/>
<circle cx="90" cy="380" r="130" fill="#fff" opacity=".14"/>
<rect x="245" y="95" width="150" height="150" rx="34" fill="#fff" opacity=".95"/>
<text x="320" y="192" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="62" font-weight="800" fill="#1A1A1A">WC</text>
<text x="320" y="315" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="28" font-weight="700" letter-spacing="6" fill="#1A1A1A" opacity=".72">${c.label.toLocaleUpperCase('tr-TR')}</text>
</svg>`;
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, uri);
  return uri;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Mekanın fotoğrafı; yoksa kategoriye göre temsili görsel */
export function placePhoto(p: Pick<PlaceBase, 'photo' | 'category' | 'name'>): string {
  return p.photo || placeholderPhoto(p.category, hash(p.name));
}
