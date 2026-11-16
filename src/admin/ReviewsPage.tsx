import { useMemo, useState } from 'react';
import { MessageSquareOff, Search, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { AdminVote } from './types';
import StarRating from '../components/StarRating';
import { Toggle } from '../components/FilterPanel';
import { ConfirmDialog, EmptyState, PageHeader, relTime } from './ui';

type Act = (fn: () => Promise<unknown>, success: string) => Promise<boolean>;

export default function ReviewsPage({ votes, act }: { votes: AdminVote[]; act: Act }) {
  const [q, setQ] = useState('');
  const [onlyComments, setOnlyComments] = useState(false);
  const [deleting, setDeleting] = useState<AdminVote | null>(null);

  const items = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return votes
      .filter((v) => !onlyComments || v.comment)
      .filter((v) => !needle || `${v.placeName} ${v.username} ${v.comment ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle));
  }, [votes, q, onlyComments]);

  return (
    <>
      <PageHeader title="Oy & Yorum Moderasyonu" subtitle={`${votes.length} oy · silinen oy mekanın puan ve ücret hesabından çıkar`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl bg-surface px-3.5 py-2.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-brand-dark">
          <Search size={16} className="text-ink-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mekan, kullanıcı veya yorum ara" className="w-full bg-transparent text-sm outline-none" />
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface px-3.5 py-2 text-sm font-semibold ring-1 ring-line">
          Sadece yorumlu
          <Toggle on={onlyComments} tone="ink" />
          <input type="checkbox" className="sr-only" checked={onlyComments} onChange={(e) => setOnlyComments(e.target.checked)} />
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={MessageSquareOff} title="Kayıt bulunamadı" text="Kullanıcılar mekan detayından oy verdikçe burada listelenir." />
      ) : (
        <ul className="space-y-2">
          {items.map((v) => (
            <li key={v.id} className="flex flex-wrap items-start gap-4 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold">{v.placeName}</span>
                  <span className="text-xs font-semibold text-ink-soft">@{v.username}</span>
                  <span className="text-xs text-ink-muted">{relTime(v.updatedAt)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-ink-muted">
                  <span className="flex items-center gap-1.5">Temizlik <StarRating value={v.cleanliness} size={12} /></span>
                  <span className="flex items-center gap-1.5">Konfor <StarRating value={v.comfort} size={12} /></span>
                  <span className={`rounded-full px-2 py-0.5 font-bold ${v.isPaid ? 'bg-brand/20 text-ink' : 'bg-green-500/15 text-green-600'}`}>
                    {v.isPaid ? `Ücretli${v.priceAmount ? ` ${v.priceAmount} ₺` : ''}` : 'Ücretsiz'}
                  </span>
                </div>
                {v.comment ? (
                  <p className="mt-2 rounded-xl bg-card px-3 py-2 text-sm">{v.comment}</p>
                ) : (
                  <p className="mt-2 text-xs italic text-ink-muted">Yorum yazılmamış, yalnızca puan.</p>
                )}
              </div>
              <button type="button" onClick={() => setDeleting(v)} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-500/10">
                <Trash2 size={15} /> Sil
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title="Oyu sil"
          text={<>@{deleting.username} kullanıcısının “{deleting.placeName}” için verdiği oy silinecek; puan ve ücret durumu yeniden hesaplanacak.</>}
          confirmLabel="Kalıcı olarak sil"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const id = deleting.id;
            setDeleting(null);
            void act(() => api(`/admin/votes/${id}`, { method: 'DELETE' }), 'Oy silindi, istatistikler güncellendi.');
          }}
        />
      )}
    </>
  );
}
