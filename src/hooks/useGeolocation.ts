import { useEffect, useState } from 'react';
import type { LatLng } from '../types';

export type GeoStatus = 'pending' | 'granted' | 'denied' | 'unsupported';

export function useGeolocation() {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<GeoStatus>('pending');

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setStatus('granted');
      },
      () => setStatus((s) => (s === 'granted' ? s : 'denied')),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return { position, status };
}
