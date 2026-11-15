import type { LatLng, Place, PlaceView } from '../types';

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

export function placeAverages(p: Pick<Place, 'cleanlinessTotal' | 'comfortTotal' | 'ratingCount'>) {
  const n = p.ratingCount || 0;
  const cleanliness = n ? p.cleanlinessTotal / n : 0;
  const comfort = n ? p.comfortTotal / n : 0;
  return { cleanliness, comfort, rating: n ? (cleanliness + comfort) / 2 : 0 };
}

export function toView(p: Place, user: LatLng): PlaceView {
  return { ...p, ...placeAverages(p), distance: distanceMeters(user, p) };
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
 * ACİL modu: önce yakındaki ÜCRETSİZ mekanlar, yoksa "müşteriye ücretsiz", o da yoksa tümü.
 * Seçilen kademede yakın adaylar (en yakının 2 katı / en az 1,5 km çevresi) arasında
 * yakınlık %60 + puan %40 skoruyla en iyisi seçilir.
 */
export function pickEmergency(places: PlaceView[]): PlaceView | null {
  if (places.length === 0) return null;
  const tiers: ((p: PlaceView) => boolean)[] = [
    (p) => p.fee === 'free',
    (p) => p.fee !== 'paid',
    () => true,
  ];
  for (let i = 0; i < tiers.length; i++) {
    const pool = places.filter(tiers[i]).sort((a, b) => a.distance - b.distance);
    if (pool.length === 0) continue;
    // Ücretsiz seçenek çok uzaktaysa (5 km+) bir sonraki kademeye bak
    if (i < tiers.length - 1 && pool[0].distance > 5000) continue;
    const limit = Math.max(1500, pool[0].distance * 2);
    const candidates = pool.filter((p) => p.distance <= limit).slice(0, 10);
    const maxD = Math.max(...candidates.map((p) => p.distance), 1);
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const p of candidates) {
      const closeness = 1 - p.distance / maxD;
      const quality = p.ratingCount ? (p.rating - 1) / 4 : 0.4;
      const score = closeness * 0.6 + quality * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }
  return null;
}
