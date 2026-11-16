import { useCallback, useEffect, useState } from 'react';
import type { Place } from '../types';
import { api } from '../api';

/** Mekan listesi. Kullanıcı değişince (myVote için) yeniden yüklenir. */
export function usePlaces(userId: number | null) {
  const [places, setPlaces] = useState<Place[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPlaces(await api<Place[]>('/places'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, userId]);

  /** Oy sonrası sunucunun döndürdüğü güncel mekanı listeye yazar */
  const replace = useCallback((place: Place) => setPlaces((ps) => ps?.map((p) => (p.id === place.id ? place : p))), []);

  return { places, error, refresh, replace };
}
