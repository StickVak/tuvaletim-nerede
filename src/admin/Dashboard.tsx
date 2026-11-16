import { ArrowRight, Building2, Inbox, MessageSquareText, Sparkles, Users } from 'lucide-react';
import type { Place } from '../types';
import type { AdminStats, AdminVote } from './types';
import { formatScore } from '../lib/geo';
import StarRating from '../components/StarRating';
import { PageHeader, relTime } from './ui';
import type { AdminTab } from './AdminPanel';

interface Props {
  stats: AdminStats | null;
  places: Place[];
  votes: AdminVote[];
  pendingCount: number;
  onNavigate: (t: AdminTab) => void;
}

function Stat({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: typeof Inbox; tone: string }) {
  return (
    <div className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-muted">{label}</span>
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}>
          <Icon size={19} />
        </span>
      </div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs font-medium text-ink-muted">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ stats, places, votes, pendingCount, onNavigate }: Props) {
  const n = (v: number | undefined) => (v ?? 0).toLocaleString('tr-TR');
  const userPlaces = places.filter((p) => p.source === 'user').length;
  const districts = Object.entries(
    places.reduce<Record<string, number>>((acc, p) => {
      const d = p.district || 'Belirtilmemiş';
      acc[d] = (acc[d] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const recent = votes.slice(0, 6);

  return (
    <>
      <PageHeader title="Genel Bakış" subtitle="Veritabanındaki güncel durum özeti" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Onaylı tuvalet" value={n(stats?.places)} sub={`${userPlaces} topluluk eklemesi`} icon={Building2} tone="bg-brand/20 text-ink" />
        <Stat label="Bekleyen başvuru" value={n(stats?.pending)} sub={stats?.pending ? 'İnceleme bekliyor' : 'Kuyruk boş'} icon={Inbox} tone="bg-red-500/10 text-red-500" />
        <Stat label="Toplam oy" value={n(stats?.votes)} sub={`${votes.filter((v) => v.comment).length} yorumlu`} icon={MessageSquareText} tone="bg-blue-500/10 text-blue-500" />
        <Stat label="Ortalama temizlik" value={stats?.votes ? `${formatScore(stats.avgCleanliness)} / 5` : '–'} sub="Tüm oyların ortalaması" icon={Sparkles} tone="bg-green-500/10 text-green-600" />
        <Stat label="Kayıtlı kullanıcı" value={n(stats?.users)} icon={Users} tone="bg-card text-ink" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {pendingCount > 0 && (
          <button type="button" onClick={() => onNavigate('pending')} className="flex items-center gap-4 rounded-3xl bg-[#1A1A1A] p-5 text-left text-white xl:col-span-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-onbrand">
              <Inbox size={22} />
            </span>
            <span className="flex-1">
              <span className="block font-extrabold">{pendingCount} başvuru onay bekliyor</span>
              <span className="block text-sm text-white/70">Kullanıcıların eklediği mekanları inceleyin.</span>
            </span>
            <ArrowRight size={20} />
          </button>
        )}

        <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold">Son oylar</h2>
            <button type="button" onClick={() => onNavigate('reviews')} className="text-sm font-bold text-ink-soft hover:text-ink">
              Tümü →
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">Henüz oy verilmedi.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {recent.map((v) => (
                <li key={v.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{v.placeName}</div>
                    <div className="text-xs text-ink-muted">@{v.username} · {v.isPaid ? `Ücretli${v.priceAmount ? ` ${v.priceAmount} ₺` : ''}` : 'Ücretsiz'}</div>
                    {v.comment && <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{v.comment}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <StarRating value={(v.cleanliness + v.comfort) / 2} size={12} />
                    <div className="mt-1 text-[11px] text-ink-muted">{relTime(v.updatedAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line">
          <h2 className="font-extrabold">İlçelere göre mekanlar</h2>
          <ul className="no-scrollbar mt-3 max-h-80 space-y-2 overflow-y-auto">
            {districts.map(([d, c]) => (
              <li key={d} className="flex items-center justify-between rounded-2xl bg-card px-3.5 py-2.5 text-sm">
                <span className="font-semibold">{d}</span>
                <span className="font-extrabold tabular-nums">{c}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
