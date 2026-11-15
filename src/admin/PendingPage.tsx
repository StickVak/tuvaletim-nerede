import { useState } from 'react';
import { Accessibility, Baby, Check, Clock3, Inbox, MapPin, X } from 'lucide-react';
import type { PendingSubmission } from '../types';
import { approveSubmission, rejectSubmission } from '../db/repo';
import { CATEGORIES, placePhoto } from '../lib/categories';
import StarRating from '../components/StarRating';
import { PriceBadge } from '../components/Badges';
import MiniMap from './MiniMap';
import { ConfirmDialog, EmptyState, PageHeader, relTime } from './ui';

export default function PendingPage({ pending, onToast }: { pending: PendingSubmission[]; onToast: (t: string) => void }) {
  const [rejecting, setRejecting] = useState<PendingSubmission | null>(null);
  const sorted = [...pending].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return (
    <>
      <PageHeader title="Bekleyen Başvurular" subtitle="Kullanıcıların “+” ile eklediği mekanları inceleyin" />
      {sorted.length === 0 ? (
        <EmptyState icon={Inbox} title="Bekleyen başvuru yok" text="Yeni bir mekan eklendiğinde burada görünecek." />
      ) : (
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          {sorted.map((s) => {
            const Cat = CATEGORIES[s.category].icon;
            return (
              <article key={s.id} className="animate-slide-up overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                  <img src={placePhoto(s)} alt={s.name} className="h-48 w-full rounded-2xl bg-gray-200 object-cover" />
                  <MiniMap center={s} category={s.category} />
                </div>
                <div className="px-5 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-extrabold">{s.name}</h2>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                        <span className="flex items-center gap-1 font-semibold text-ink-soft"><Cat size={13} /> {CATEGORIES[s.category].label}</span>
                        <span className="flex items-center gap-1"><Clock3 size={12} /> {relTime(s.submittedAt)}</span>
                        <span className="flex items-center gap-1 font-mono"><MapPin size={12} /> {s.lat.toFixed(5)}, {s.lng.toFixed(5)}</span>
                      </p>
                    </div>
                    <PriceBadge place={s} size="md" />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl bg-card p-3">
                      <dt className="text-xs font-semibold text-ink-muted">Temizlik</dt>
                      <dd className="mt-1"><StarRating value={s.cleanliness} size={14} /></dd>
                    </div>
                    <div className="rounded-2xl bg-card p-3">
                      <dt className="text-xs font-semibold text-ink-muted">Konfor</dt>
                      <dd className="mt-1"><StarRating value={s.comfort} size={14} /></dd>
                    </div>
                    <div className="col-span-2 rounded-2xl bg-card p-3 text-ink-soft">
                      <span className="font-semibold text-ink">{[s.address, s.city].filter(Boolean).join(', ') || 'Adres belirtilmemiş'}</span>
                      {s.hours && <span> · {s.hours}</span>}
                      {(s.accessible || s.babyChanging) && (
                        <span className="ml-2 inline-flex gap-1.5 align-middle">
                          {s.accessible && <Accessibility size={14} aria-label="Engelli erişimi" />}
                          {s.babyChanging && <Baby size={14} aria-label="Bebek bakım" />}
                        </span>
                      )}
                    </div>
                  </dl>
                </div>
                <div className="grid grid-cols-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setRejecting(s)}
                    className="flex items-center justify-center gap-1.5 py-3.5 text-sm font-bold text-red-600 hover:bg-red-50"
                  >
                    <X size={16} /> Reddet
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const p = await approveSubmission(s.id);
                      if (p) onToast(`“${p.name}” onaylandı ve haritaya eklendi.`);
                    }}
                    className="flex items-center justify-center gap-1.5 bg-brand py-3.5 text-sm font-extrabold text-ink hover:bg-brand-dark"
                  >
                    <Check size={16} /> Onayla (Haritaya Ekle)
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rejecting && (
        <ConfirmDialog
          title="Başvuruyu reddet"
          text={<>“{rejecting.name}” başvurusu kalıcı olarak silinecek.</>}
          confirmLabel="Reddet"
          onCancel={() => setRejecting(null)}
          onConfirm={async () => {
            await rejectSubmission(rejecting.id);
            onToast('Başvuru reddedildi.');
            setRejecting(null);
          }}
        />
      )}
    </>
  );
}
