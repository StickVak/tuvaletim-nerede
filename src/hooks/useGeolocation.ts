import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '../types';

export type GeoStatus = 'pending' | 'granted' | 'denied' | 'unsupported';

/** Tarayıcının gerçek konumunu izler. Reddedilir/alınamazsa status 'denied'; retry() yeniden dener. */
export function useGeolocation() {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<GeoStatus>('geolocation' in navigator ? 'pending' : 'unsupported');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setStatus('granted');
      },
      () => setStatus((s) => (s === 'granted' ? s : 'denied')),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus('pending');
    setAttempt((a) => a + 1);
  }, []);

  return { position, status, retry };
}
