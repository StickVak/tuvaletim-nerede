import type { LatLng, Place, PlaceView } from '../types';

/** Konum bilinmezken harita merkezi: İzmir, Konak */
export const IZMIR_CENTER: LatLng = { lat: 38.4189, lng: 27.1287 };

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  if (m < 100000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(m / 1000).toLocaleString('tr-TR')} km`;
}

/** Ortalama yürüme hızı ~4.8 km/sa */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / 80));
}

export function formatWalk(m: number): string {
  const min = walkMinutes(m);
  if (min < 60) return `${min} dk yürüme`;
  if (min < 600) return `${Math.floor(min / 60)} sa ${min % 60} dk`;
  return 'yürüme mesafesinde değil';
}

export function formatScore(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

export function toView(p: Place, user: LatLng | null): PlaceView {
  return { ...p, distance: user ? distanceMeters(user, p) : null };
}

/** Başlangıç noktası yoksa Google Maps kullanıcının kendi konumunu kullanır */
export function googleMapsDirections(from: LatLng | null, to: LatLng): string {
  const p = new URLSearchParams({ api: '1', destination: `${to.lat},${to.lng}`, travelmode: 'walking' });
  if (from) p.set('origin', `${from.lat},${from.lng}`);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/** Geçici: Görev 9'da ücretsiz öncelikli algoritmayla değiştirilecek */
export function pickEmergency(places: PlaceView[]): PlaceView | null {
  const known = places.filter((p) => p.distance !== null).sort((a, b) => a.distance! - b.distance!);
  return known[0] ?? null;
}
