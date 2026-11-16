import { useEffect, useState } from 'react';
import { CalendarDays, Loader2, MessageSquareText, PlusCircle, Star } from 'lucide-react';
import type { PublicProfile } from '../types';
import { api } from '../api';
import { joinedLabel, relTime } from '../lib/time';
import Avatar from './Avatar';
import StarRating from './StarRating';
import ModalShell from './ModalShell';

/** Başka bir kullanıcının herkese açık profili (gizli bilgi yok) */
export default function UserProfileModal({ userId, onClose, onOpenPlace }: { userId: number; onClose: () => void; onOpenPlace: (id: string) => void }) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setP(null);
    api<PublicProfile>(`/users/${userId}`).then(setP).catch((e) => setError((e as Error).message));
  }, [userId]);

  return (
    <ModalShell label="Kullanıcı profili" onClose={onClose} z="z-[58]">
      {!p ? (
        <div className="flex h-60 items-center justify-center text-ink-muted">{error || <Loader2 className="animate-spin" />}</div>
      ) : (
        <div className="p-6">
          <div className="flex flex-col items-center text-center">
            <Avatar name={p.displayName} url={p.avatarUrl} size={88} />
            <h2 className="mt-3 text-xl font-extrabold">{p.displayName}</h2>
            <p className="text-sm text-ink-muted">@{p.username}</p>
            {p.isDemo && <span className="mt-1 rounded-full bg-card px-2.5 py-0.5 text-[11px] font-bold text-ink-muted">Örnek profil</span>}
            {p.bio && <p className="mt-3 text-sm text-ink-soft">{p.bio}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
              <CalendarDays size={13} /> {joinedLabel(p.createdAt)} tarihinden beri üye
            </p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            {[
              { n: p.stats.votes, l: 'Oy', i: Star },
              { n: p.stats.comments, l: 'Yorum', i: MessageSquareText },
              { n: p.stats.placesAdded, l: 'Eklediği', i: PlusCircle },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-card p-3">
                <s.i size={16} className="mx-auto text-brand-dark" />
                <div className="mt-1 text-xl font-extrabold">{s.n}</div>
                <div className="text-[11px] font-semibold text-ink-muted">{s.l}</div>
              </div>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-extrabold">Değerlendirmeleri</h3>
          {p.reviews.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Henüz değerlendirme yok.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {p.reviews.map((r) => (
                <li key={r.placeId} className="rounded-2xl bg-card p-3">
                  <button type="button" onClick={() => onOpenPlace(r.placeId)} className="text-left text-sm font-bold text-ink hover:underline">
                    {r.placeName}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                    <span className="flex items-center gap-1">Temizlik <StarRating value={r.cleanliness} size={10} /></span>
                    <span className="flex items-center gap-1">Konfor <StarRating value={r.comfort} size={10} /></span>
                    <span>{r.isPaid ? `Ücretli${r.priceAmount ? ` · ${r.priceAmount.toLocaleString('tr-TR')} ₺` : ''}` : 'Ücretsiz'}</span>
                    <span>{relTime(r.updatedAt)}</span>
                  </div>
                  {r.comment && <p className="mt-1.5 text-sm text-ink">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ModalShell>
  );
}
