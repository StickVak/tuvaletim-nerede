import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Place } from '../types';
import type { AdminPending, AdminStats, AdminVote } from './types';

/** Yönetim panelinin tüm verisi; her işlemden sonra reload() çağrılır. */
export function useAdminData() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pending, setPending] = useState<AdminPending[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [votes, setVotes] = useState<AdminVote[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, p, pl, v] = await Promise.all([
        api<AdminStats>('/admin/stats'),
        api<AdminPending[]>('/admin/pending'),
        api<Place[]>('/places'),
        api<AdminVote[]>('/admin/votes'),
      ]);
      setStats(s);
      setPending(p);
      setPlaces(pl);
      setVotes(v);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { stats, pending, places, votes, error, reload };
}
