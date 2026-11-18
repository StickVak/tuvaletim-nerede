import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Place } from '../../src/types';
import type { AdminPending, AdminReportGroup, AdminStats, AdminUser, AdminVote } from './types';

/** Yönetim panelinin tüm verisi; her işlemden sonra reload() çağrılır. */
export function useAdminData() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pending, setPending] = useState<AdminPending[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [votes, setVotes] = useState<AdminVote[]>([]);
  const [reports, setReports] = useState<AdminReportGroup[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [s, p, pl, v, r, u] = await Promise.all([
        api<AdminStats>('/admin/stats'),
        api<AdminPending[]>('/admin/pending'),
        api<Place[]>('/admin/places'),
        api<AdminVote[]>('/admin/votes'),
        api<AdminReportGroup[]>('/admin/reports'),
        api<AdminUser[]>('/admin/users'),
      ]);
      setStats(s);
      setPending(p);
      setPlaces(pl);
      setVotes(v);
      setReports(r);
      setUsers(u);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { stats, pending, places, votes, reports, users, error, loading, reload };
}
