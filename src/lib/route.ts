import type { LatLng } from '../types';

export interface RouteResult {
  points: LatLng[];
  approximate: boolean;
  distance?: number;
}

/**
 * Ücretsiz OSRM (OpenStreetMap) yaya rotası. Ağ hatası/zaman aşımında düz çizgiye düşer.
 */
export async function fetchWalkingRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
  const fallback: RouteResult = { points: [from, to], approximate: true };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return fallback;
    const data = await res.json();
    const route = data?.routes?.[0];
    const coords: [number, number][] | undefined = route?.geometry?.coordinates;
    if (!coords || coords.length < 2) return fallback;
    return {
      points: [from, ...coords.map(([lng, lat]) => ({ lat, lng })), to],
      approximate: false,
      distance: typeof route.distance === 'number' ? route.distance : undefined,
    };
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timer);
  }
}
