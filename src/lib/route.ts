import type { LatLng } from '../types';
import { distanceMeters } from './geo.ts';

/** Yürüme hızı ~4,8 km/sa (dakikada 80 m; walkMinutes ile aynı) */
export const WALK_SPEED_MPS = 80 / 60;

export interface RouteResult {
  points: LatLng[];
  /** true: rota servisi yanıt vermedi, kuş uçuşu çizgi */
  approximate: boolean;
  /** metre */
  distance: number;
  /** saniye */
  duration: number;
}

/**
 * OSRM yaya rotası sunucuları, sırayla.
 * router.project-osrm.org genel demo sunucusu yalnızca araç profilini çalıştırır ("foot" isteğine araç rotası döner);
 * bu yüzden önce gerçek yaya profili olan FOSSGIS sunucusu denenir, demo sunucusunda süre yürüme hızından hesaplanır.
 */
const SERVERS = [
  { base: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot', walkingDuration: true },
  { base: 'https://router.project-osrm.org/route/v1/foot', walkingDuration: false },
];

async function tryServer(server: (typeof SERVERS)[number], from: LatLng, to: LatLng): Promise<RouteResult | null> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 5000);
  try {
    const url = `${server.base}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const route = (await res.json())?.routes?.[0];
    const coords: [number, number][] | undefined = route?.geometry?.coordinates;
    if (!coords || coords.length < 2 || typeof route.distance !== 'number') return null;
    return {
      points: [from, ...coords.map(([lng, lat]) => ({ lat, lng })), to],
      approximate: false,
      distance: route.distance,
      duration: server.walkingDuration ? route.duration : Math.round(route.distance / WALK_SPEED_MPS),
    };
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/** Sokaklara oturan yaya rotası; tüm sunucular yanıt vermezse kuş uçuşu (approximate) çizgi. */
export async function fetchWalkingRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
  for (const server of SERVERS) {
    const r = await tryServer(server, from, to);
    if (r) return r;
  }
  const distance = distanceMeters(from, to);
  return { points: [from, to], approximate: true, distance, duration: Math.round(distance / WALK_SPEED_MPS) };
}
