import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FeeType, ToiletCategory } from '../types';
import { CATEGORIES } from './categories';

export type PinState = 'normal' | 'selected' | 'emergency' | 'new';
const iconCache = new Map<string, L.DivIcon>();

export function toiletIcon(category: ToiletCategory, fee: FeeType, state: PinState) {
  const key = `${category}-${fee}-${state}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const Icon = CATEGORIES[category].icon;
  const svg = renderToStaticMarkup(<Icon strokeWidth={2.6} />);
  const badge =
    state === 'new' ? '' : fee === 'free' ? '<span class="tn-pin-free">Ücretsiz</span>' : '';
  const html = `<div class="tn-pin ${state !== 'normal' ? `is-${state}` : ''}">
    <span class="tn-pin-shadow"></span>
    <div class="tn-pin-body"><div class="tn-pin-inner">${svg}</div></div>
    ${badge}
  </div>`;
  const icon = L.divIcon({ html, className: '', iconSize: [44, 54], iconAnchor: [22, 52] });
  iconCache.set(key, icon);
  return icon;
}

export const userIcon = L.divIcon({
  html: '<div class="tn-user"><span class="tn-user-pulse"></span><span class="tn-user-dot"></span></div>',
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export const OSM_TILE = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları',
};
