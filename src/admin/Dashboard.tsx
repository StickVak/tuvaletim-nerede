import { ArrowRight, Building2, Inbox, MessageSquareText, Sparkles, Star } from 'lucide-react';
import type { PendingSubmission, Place, Review } from '../types';
import { formatScore } from '../lib/geo';
import StarRating from '../components/StarRating';
import { PageHeader, relTime } from './ui';
import type { AdminTab } from './AdminPanel';

interface Props {
  places: Place[];
  pending: PendingSubmission[];
  reviews: Review[];
  onNavigate: (t: AdminTab) => void;
}

function Stat({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: typeof Star; tone: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
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

export default function Dashboard({ places, pending, reviews, onNavigate }: Props) {
  const totalVotes = places.reduce((s, p) => s + p.ratingCount, 0);
  const totalClean = places.reduce((s, p) => s + p.cleanlinessTotal, 0);
  const avgClean = totalVotes ? totalClean / totalVotes : 0;
  const comments = reviews.filter((r) => r.comment).length;
  const userPlaces = places.filter((p) => p.source === 'user').length;
  const placeName = new Map(places.map((p) => [p.id, p.name]));

  const cities = Object.entries(
    places.reduce<Record<string, number>>((acc, p) => {
      const c = p.city || 'Belirtilmemiş';
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const recent = [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <>
      <PageHeader title="Genel Bakış" subtitle="Veritabanındaki güncel durum özeti" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Onaylı tuvalet" value={places.length.toLocaleString('tr-TR')} sub={`${userPlaces} topluluk eklemesi`} icon={Building2} tone="bg-brand-soft text-ink" />
        <Stat label="Bekleyen başvuru" value={pending.length.toLocaleString('tr-TR')} sub={pending.length ? 'İnceleme bekliyor' : 'Kuyruk boş'} icon={Inbox} tone="bg-red-50 text-red-600" />
        <Stat
          label="Toplam puan / yorum"
          value={totalVotes.toLocaleString('tr-TR')}
          sub={`${reviews.length} uygulama içi puan · ${comments} yorum`}
          icon={MessageSquareText}
          tone="bg-blue-50 text-blue-600"
        />
        <Stat label="Ortalama temizlik" value={`${formatScore(avgClean)} / 5`} sub="Tüm oyların ağırlıklı ortalaması" icon={Sparkles} tone="bg-green-50 text-green-700" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {pending.length > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('pending')}
            className="flex items-center gap-4 rounded-3xl bg-ink p-5 text-left text-white xl:col-span-3"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-ink">
              <Inbox size={22} />
            </span>
            <span className="flex-1">
              <span className="block font-extrabold">{pending.length} başvuru onay bekliyor</span>
              <span className="block text-sm text-white/70">Kullanıcıların eklediği mekanları inceleyin.</span>
            </span>
            <ArrowRight size={20} />
          </button>
        )}

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold">Son puanlamalar</h2>
            <button type="button" onClick={() => onNavigate('reviews')} className="text-sm font-bold text-ink-soft hover:text-ink">
              Tümü →
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">Henüz uygulama içinden puan verilmedi.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {recent.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{placeName.get(r.placeId) ?? 'Silinmiş mekan'}</div>
                    {r.comment && <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{r.comment}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <StarRating value={(r.cleanliness + r.comfort) / 2} size={12} />
                    <div className="mt-1 text-[11px] text-ink-muted">{relTime(r.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-extrabold">Şehirlere göre mekanlar</h2>
          <ul className="mt-3 space-y-2">
            {cities.map(([city, n]) => (
              <li key={city} className="flex items-center justify-between rounded-2xl bg-card px-3.5 py-2.5 text-sm">
                <span className="font-semibold">{city}</span>
                <span className="font-extrabold tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
