import { useState } from 'react';
import { Accessibility, Baby, Check, Clock3, Inbox, MapPin, Pencil, X } from 'lucide-react';
import { api } from './api';
import type { AdminPending } from './types';
import { CATEGORIES } from '../../src/lib/categories';
import StarRating from '../../src/components/StarRating';
import MiniMap from './MiniMap';
import PendingEditModal from './PendingEditModal';
import { ConfirmDialog, EmptyState, OutdoorPhoto, PageHeader, relTime } from './ui';

type Act = (fn: () => Promise<unknown>, success: string) => Promise<boolean>;

export default function PendingPage({ pending, act }: { pending: AdminPending[]; act: Act }) {
  const [rejecting, setRejecting] = useState<AdminPending | null>(null);
  const [editing, setEditing] = useState<AdminPending | null>(null);
  const sorted = pending;

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
              <article key={s.id} className="animate-slide-up overflow-hidden rounded-3xl bg-surface shadow-sm ring-1 ring-line">
                <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                  <OutdoorPhoto src={s.photo} alt={`${s.name} dış mekan fotoğrafı`} className="h-56" />
                  <MiniMap center={s} category={s.category} className="h-56" />
                </div>
                <div className="px-5 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-extrabold">{s.name}</h2>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                        <span className="flex items-center gap-1 font-semibold text-ink-soft"><Cat size={13} /> {CATEGORIES[s.category].label}</span>
                        <span className="flex items-center gap-1"><Clock3 size={12} /> {relTime(s.submittedAt)}</span>
                        {s.username && <span className="font-semibold">@{s.username}</span>}
                        <span className="flex items-center gap-1 font-mono"><MapPin size={12} /> {s.lat.toFixed(5)}, {s.lng.toFixed(5)}</span>
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.vote.isPaid ? 'bg-brand/20 text-ink' : 'bg-green-500/15 text-green-600'}`}>
                      {s.vote.isPaid ? `Ücretli${s.vote.priceAmount ? ` · ${s.vote.priceAmount} ₺` : ''}` : 'Ücretsiz'}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl bg-card p-3">
                      <dt className="text-xs font-semibold text-ink-muted">Temizlik</dt>
                      <dd className="mt-1"><StarRating value={s.vote.cleanliness} size={14} /></dd>
                    </div>
                    <div className="rounded-2xl bg-card p-3">
                      <dt className="text-xs font-semibold text-ink-muted">Konfor</dt>
                      <dd className="mt-1"><StarRating value={s.vote.comfort} size={14} /></dd>
                    </div>
                    <div className="col-span-2 rounded-2xl bg-card p-3 text-ink-soft">
                      <span className="font-semibold text-ink">{[s.address, s.district, s.province].filter(Boolean).join(', ') || 'Adres belirtilmemiş'}</span>
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
                <div className="grid grid-cols-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setEditing(s)}
                    className="flex items-center justify-center gap-1.5 py-3.5 text-sm font-bold text-ink hover:bg-card"
                  >
                    <Pencil size={16} /> Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejecting(s)}
                    className="flex items-center justify-center gap-1.5 py-3.5 text-sm font-bold text-red-600 hover:bg-red-500/10"
                  >
                    <X size={16} /> Reddet
                  </button>
                  <button
                    type="button"
                    onClick={() => act(() => api(`/admin/pending/${s.id}/approve`, { method: 'POST' }), `“${s.name}” onaylandı ve haritaya eklendi.`)}
                    className="flex items-center justify-center gap-1.5 bg-brand py-3.5 text-sm font-extrabold text-onbrand hover:bg-brand-dark"
                  >
                    <Check size={16} /> Onayla (Haritaya Ekle)
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <PendingEditModal
          pending={editing}
          onClose={() => setEditing(null)}
          onSave={(changes) =>
            act(() => api(`/admin/pending/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: changes }), 'Başvuru güncellendi.').then((ok) => ok && setEditing(null))
          }
        />
      )}

      {rejecting && (
        <ConfirmDialog
          title="Başvuruyu reddet"
          text={<>“{rejecting.name}” başvurusu kalıcı olarak silinecek.</>}
          confirmLabel="Reddet"
          onCancel={() => setRejecting(null)}
          onConfirm={() => {
            const id = rejecting.id;
            setRejecting(null);
            void act(() => api(`/admin/pending/${id}`, { method: 'DELETE' }), 'Başvuru reddedildi.');
          }}
        />
      )}
    </>
  );
}
