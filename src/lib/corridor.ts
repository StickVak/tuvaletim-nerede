import type { LatLng, PlaceView } from '../types';

const M_PER_DEG = 111_320;

/** Noktanın rota çizgisine (doğru parçalarına) en kısa mesafesi, metre. Kısa mesafede düzlem (eşdikdörtgen) yaklaşımı. */
export function distanceToRoute(p: LatLng, route: LatLng[]): number {
  if (route.length === 0) return Infinity;
  const kx = Math.cos((p.lat * Math.PI) / 180) * M_PER_DEG;
  const xy = (q: LatLng) => [(q.lng - p.lng) * kx, (q.lat - p.lat) * M_PER_DEG];
  if (route.length === 1) return Math.hypot(...xy(route[0]));
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = xy(route[i - 1]);
    const [bx, by] = xy(route[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // p (orijin) için segment üzerindeki en yakın noktanın parametresi
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Rota çizgisine en fazla maxM metre uzaklıktaki tuvaletler (hedef hariç) */
export function placesOnRoute(places: PlaceView[], route: LatLng[], excludeId: string, maxM = 150): Set<string> {
  const out = new Set<string>();
  if (route.length < 2) return out;
  for (const p of places) if (p.id !== excludeId && distanceToRoute(p, route) <= maxM) out.add(p.id);
  return out;
}
