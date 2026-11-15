import type { LatLng, Toilet, ToiletWithDistance } from '../types';

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  if (m < 100000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(m / 1000)} km`;
}

/** Ortalama yürüme hızı ~4.8 km/sa */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / 80));
}

export function avgRating(t: Pick<Toilet, 'cleanliness' | 'comfort'>): number {
  return (t.cleanliness + t.comfort) / 2;
}

export function googleMapsDirections(from: LatLng, to: LatLng): string {
  const p = new URLSearchParams({
    api: '1',
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode: 'walking',
  });
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/**
 * ACİL modu: ücretsiz tuvaletler arasından mesafe ve puanı birlikte değerlendirip en uygununu seçer.
 * Ücretsiz tuvalet yoksa tüm tuvaletler arasından seçer.
 */
export function pickEmergency(toilets: ToiletWithDistance[]): ToiletWithDistance | null {
  if (toilets.length === 0) return null;
  const free = toilets.filter((t) => t.isFree);
  const pool = free.length > 0 ? free : toilets;
  const maxD = Math.max(...pool.map((t) => t.distance), 1);
  let best: ToiletWithDistance | null = null;
  let bestScore = -Infinity;
  for (const t of pool) {
    const closeness = 1 - t.distance / maxD; // 0..1, 1 = en yakın
    const quality = (avgRating(t) - 1) / 4; // 0..1
    const score = closeness * 0.6 + quality * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}
