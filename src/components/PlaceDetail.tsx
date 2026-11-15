import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Accessibility, Baby, CheckCircle2, Clock, Lock, MapPin, MessageSquareText, Navigation, Send, Sofa, Sparkles, Wallet, X,
} from 'lucide-react';
import type { LatLng, PlaceView } from '../types';
import { db } from '../db/db';
import { getVoteLock, submitReview } from '../db/repo';
import { CATEGORIES, placePhoto } from '../lib/categories';
import { formatDistance, formatScore, formatWalk, googleMapsDirections } from '../lib/geo';
import StarRating from './StarRating';
import { PriceBadge } from './Badges';

interface Props {
  place: PlaceView;
  user: LatLng;
  desktop: boolean;
  onClose: () => void;
  onToast: (text: string, tone?: 'success' | 'info' | 'error') => void;
}

function relTime(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} gün önce` : new Date(iso).toLocaleDateString('tr-TR');
}

function ScoreBar({ label, icon: Icon, value }: { label: string; icon: typeof Sparkles; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-ink-soft">
        <span className="flex items-center gap-1.5"><Icon size={14} /> {label}</span>
        <span className="font-bold text-ink">{value ? formatScore(value) : '–'}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-brand-dark transition-all duration-500" style={{ width: `${(value / 5) * 100}%` }} />
      </div>
    </div>
  );
}

export default function PlaceDetail({ place, user, desktop, onClose, onToast }: Props) {
  const cat = CATEGORIES[place.category];
  const CatIcon = cat.icon;
  const [cleanliness, setCleanliness] = useState(0);
  const [comfort, setComfort] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [justVoted, setJustVoted] = useState(false);

  const reviews = useLiveQuery(
    () => db.reviews.where('placeId').equals(place.id).reverse().sortBy('createdAt'),
    [place.id],
  );

  useEffect(() => {
    setCleanliness(0);
    setComfort(0);
    setComment('');
    setJustVoted(false);
    let alive = true;
    void getVoteLock(place.id).then((l) => alive && setLockedUntil(l));
    return () => {
      alive = false;
    };
  }, [place.id]);

  const send = async () => {
    if (!cleanliness || !comfort) {
      onToast('Lütfen temizlik ve konfor için yıldız seçin.', 'error');
      return;
    }
    setSending(true);
    try {
      await submitReview(place.id, cleanliness, comfort, comment);
      setJustVoted(true);
      setLockedUntil(await getVoteLock(place.id));
      onToast('Puanınız kaydedildi. Teşekkürler!', 'success');
    } catch (e) {
      if ((e as Error).message === 'VOTE_LOCKED') {
        setLockedUntil(await getVoteLock(place.id));
        onToast('Bu mekana yakın zamanda zaten puan verdiniz.', 'error');
      } else {
        onToast('Puan kaydedilemedi.', 'error');
      }
    } finally {
      setSending(false);
    }
  };

  const hoursLeft = lockedUntil ? Math.max(1, Math.ceil((lockedUntil - Date.now()) / 3600000)) : 0;
  const commented = (reviews ?? []).filter((r) => r.comment);

  return (
    <div
      className={`absolute z-[45] ${
        desktop ? 'bottom-4 left-[432px] top-4 w-[400px]' : 'inset-0'
      }`}
      role="dialog"
      aria-label={`${place.name} detayı`}
    >
      {!desktop && <div className="absolute inset-0 animate-fade-in bg-ink/30" onClick={onClose} />}
      <div
        className={`flex flex-col overflow-hidden bg-white shadow-sheet ${
          desktop
            ? 'h-full animate-slide-up rounded-[28px] ring-1 ring-black/5'
            : 'absolute inset-x-0 bottom-0 max-h-[88%] animate-sheet-in rounded-t-[30px]'
        }`}
      >
        <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain">
          {/* Görsel */}
          <div className="relative">
            <img src={placePhoto(place)} alt={place.name} className="h-48 w-full bg-gray-200 object-cover" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-ink shadow-float"
            >
              <X size={19} />
            </button>
            {!desktop && <span className="absolute left-1/2 top-2 h-1.5 w-11 -translate-x-1/2 rounded-full bg-white/80" />}
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-ink">
                <CatIcon size={14} /> {cat.label}
              </span>
              {place.source === 'seed' ? (
                <span className="rounded-full bg-ink/80 px-2.5 py-1.5 text-[10px] font-bold text-white">Örnek veri</span>
              ) : (
                <span className="rounded-full bg-ink/80 px-2.5 py-1.5 text-[10px] font-bold text-white">Topluluk ekledi</span>
              )}
            </div>
          </div>

          <div className="px-5 pb-6 pt-4">
            {/* Başlık + genel puan */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold leading-tight text-ink">{place.name}</h2>
                {(place.address || place.city) && (
                  <p className="mt-1 flex items-start gap-1 text-sm text-ink-muted">
                    <MapPin size={14} className="mt-0.5 shrink-0" />
                    {[place.address, place.city].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <div className="shrink-0 rounded-2xl bg-brand px-3 py-2 text-center">
                <div className="text-xl font-extrabold leading-none text-ink">{place.ratingCount ? formatScore(place.rating) : '–'}</div>
                <div className="mt-1 text-[10px] font-bold text-ink/70">{place.ratingCount} OY</div>
              </div>
            </div>

            {/* Puan dağılımı */}
            <div className="mt-4 space-y-3 rounded-3xl bg-card p-4">
              <ScoreBar label="Temizlik" icon={Sparkles} value={place.cleanliness} />
              <ScoreBar label="Konfor" icon={Sofa} value={place.comfort} />
            </div>

            {/* Bilgiler */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted"><Wallet size={14} /> Ücret</div>
                <div className="mt-1.5"><PriceBadge place={place} size="md" /></div>
              </div>
              <div className="rounded-2xl bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted"><Clock size={14} /> Saatler</div>
                <div className="mt-1.5 text-sm font-bold text-ink">{place.hours ?? 'Bilinmiyor'}</div>
              </div>
            </div>
            {(place.accessible || place.babyChanging) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {place.accessible && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                    <Accessibility size={14} /> Engelli erişimi
                  </span>
                )}
                {place.babyChanging && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-3 py-1.5 text-xs font-semibold text-pink-700">
                    <Baby size={14} /> Bebek bakım ünitesi
                  </span>
                )}
              </div>
            )}

            <a
              href={googleMapsDirections(user, place)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-bold text-white shadow-float transition hover:bg-black active:scale-[.98]"
            >
              <Navigation size={18} className="text-brand" fill="currentColor" />
              Yol Tarifi · {formatDistance(place.distance)} · {formatWalk(place.distance)}
            </a>

            {/* Puan ver */}
            <section className="mt-6 rounded-3xl border-2 border-brand bg-brand-soft/50 p-4" aria-label="Puan ver">
              <h3 className="text-base font-extrabold">Bu tuvaleti puanla</h3>
              {lockedUntil ? (
                <div className="mt-2 flex items-start gap-2.5 text-sm text-ink-soft">
                  {justVoted ? (
                    <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-600" />
                  ) : (
                    <Lock size={18} className="mt-0.5 shrink-0" />
                  )}
                  <p>
                    {justVoted ? 'Teşekkürler! Puanınız ortalamaya eklendi. ' : 'Bu mekana zaten puan verdiniz. '}
                    Aynı mekanı yaklaşık <b>{hoursLeft} saat</b> sonra tekrar puanlayabilirsiniz.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mt-0.5 text-xs text-ink-muted">Deneyiminiz diğer kullanıcılara yol göstersin.</p>
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-1.5">
                      <span className="text-sm font-bold">Temizlik</span>
                      <StarRating value={cleanliness} onChange={setCleanliness} size={24} label="Temizlik puanı" />
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-1.5">
                      <span className="text-sm font-bold">Konfor</span>
                      <StarRating value={comfort} onChange={setComfort} size={24} label="Konfor puanı" />
                    </div>
                  </div>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={280}
                    rows={2}
                    placeholder="Kısa bir yorum (isteğe bağlı)"
                    className="mt-2 w-full resize-none rounded-2xl border-2 border-transparent bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-dark"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[11px] text-ink-muted">{comment.length}/280</span>
                    <button
                      type="button"
                      onClick={send}
                      disabled={sending}
                      className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-extrabold text-ink shadow-sm transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                    >
                      <Send size={15} /> Puanı Gönder
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Yorumlar */}
            <section className="mt-6">
              <h3 className="flex items-center gap-2 text-sm font-extrabold">
                <MessageSquareText size={16} /> Son yorumlar
                <span className="text-xs font-semibold text-ink-muted">({commented.length})</span>
              </h3>
              {commented.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">Henüz yorum yok. İlk yorumu siz yazın!</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {commented.slice(0, 10).map((r) => (
                    <li key={r.id} className="rounded-2xl bg-card p-3">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
                        <span className="flex items-center gap-2">
                          <span>Temizlik</span> <StarRating value={r.cleanliness} size={10} />
                          <span>Konfor</span> <StarRating value={r.comfort} size={10} />
                        </span>
                        <span>{relTime(r.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 text-sm text-ink">{r.comment}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
