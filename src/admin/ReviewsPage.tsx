import { useMemo, useState } from 'react';
import { MessageSquareOff, Search, Trash2 } from 'lucide-react';
import type { Place, Review } from '../types';
import { deleteReview } from '../db/repo';
import StarRating from '../components/StarRating';
import { Toggle } from '../components/FilterPanel';
import { ConfirmDialog, EmptyState, PageHeader, relTime } from './ui';

export default function ReviewsPage({ reviews, places, onToast }: { reviews: Review[]; places: Place[]; onToast: (t: string) => void }) {
  const [q, setQ] = useState('');
  const [onlyComments, setOnlyComments] = useState(false);
  const [deleting, setDeleting] = useState<Review | null>(null);
  const placeName = useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);

  const items = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return [...reviews]
      .filter((r) => !onlyComments || r.comment)
      .filter((r) => !needle || `${placeName.get(r.placeId) ?? ''} ${r.comment ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [reviews, q, onlyComments, placeName]);

  return (
    <>
      <PageHeader title="Yorum & Puan Moderasyonu" subtitle={`${reviews.length} kayıt · uygunsuz olanları silin, ortalamalar otomatik güncellenir`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-brand-dark">
          <Search size={16} className="text-ink-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mekan adı veya yorum metni ara" className="w-full bg-transparent text-sm outline-none" />
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold ring-1 ring-gray-200">
          Sadece yorumlu
          <Toggle on={onlyComments} tone="ink" />
          <input type="checkbox" className="sr-only" checked={onlyComments} onChange={(e) => setOnlyComments(e.target.checked)} />
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={MessageSquareOff} title="Kayıt bulunamadı" text="Kullanıcılar mekan detayından puan verdikçe burada listelenir." />
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold">{placeName.get(r.placeId) ?? 'Silinmiş mekan'}</span>
                  <span className="text-xs text-ink-muted">{relTime(r.createdAt)}</span>
                  <span className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[10px] text-ink-muted" title="Anonim tarayıcı kimliği">
                    #{r.voterId.slice(0, 6)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-ink-muted">
                  <span className="flex items-center gap-1.5">Temizlik <StarRating value={r.cleanliness} size={12} /></span>
                  <span className="flex items-center gap-1.5">Konfor <StarRating value={r.comfort} size={12} /></span>
                </div>
                {r.comment ? (
                  <p className="mt-2 rounded-xl bg-card px-3 py-2 text-sm">{r.comment}</p>
                ) : (
                  <p className="mt-2 text-xs italic text-ink-muted">Yorum yazılmamış, yalnızca puan.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDeleting(r)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
              >
                <Trash2 size={15} /> Sil
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title="Puanı / yorumu sil"
          text="Bu kayıt silinecek ve mekanın temizlik/konfor ortalaması yeniden hesaplanacak."
          confirmLabel="Kalıcı olarak sil"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteReview(deleting.id!);
            onToast('Kayıt silindi, ortalamalar güncellendi.');
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
