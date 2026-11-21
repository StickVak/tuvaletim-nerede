import { useCallback, useEffect, useState } from 'react';
import { Accessibility, AlertTriangle, Baby, CheckCircle2, Clock, Heart, KeyRound, LogIn, MapPin, MessageSquareText, Navigation, PackageX, Send, Sofa, Sparkles, Toilet, Users, Wallet, Wrench, X } from 'lucide-react';
import type { Place, PlaceView, ReportType, ToiletType, Vote } from '../types';
import { relTime } from '../lib/time';
import Avatar from './Avatar';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { CATEGORIES, placePhoto } from '../lib/categories';
import { formatDistance, formatScore, formatWalk } from '../lib/geo';
import StarRating from './StarRating';
import { PriceBadge } from './Badges';
import FeeVoteInput, { parsePrice } from './FeeVoteInput';

interface Props {
  place: PlaceView;
  desktop: boolean;
  onClose: () => void;
  onVoted: (place: Place) => void;
  /** Uygulama içi yol tarifi */
  onRoute: (id: string) => void;
  onToggleFavorite: (place: PlaceView) => void;
  onReport: (id: string, type: ReportType) => void;
  onOpenUser: (userId: number) => void;
  onToast: (text: string, tone?: 'success' | 'info' | 'error') => void;
}

type Review = Vote & { userId: number; username: string; displayName: string; avatarUrl: string | null; updatedAt: string };

const TOILET_TYPE_LABEL: Record<ToiletType, string> = { alafranga: 'Alafranga', alaturka: 'Alaturka', ikisi: 'Alafranga + Alaturka' };
const REPORTS: { type: ReportType; label: string; icon: typeof Wrench }[] = [
  { type: 'closed', label: 'Temizlik / Tadilat Nedeniyle Kapalı', icon: Wrench },
  { type: 'no_supplies', label: 'Kağıt / Sabun Yok', icon: PackageX },
  { type: 'crowded', label: 'Çok Kalabalık', icon: Users },
  { type: 'open', label: 'Şu An Açık / Sorun Yok', icon: CheckCircle2 },
];

function ScoreBar({ label, icon: Icon, value }: { label: string; icon: typeof Sparkles; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-ink-soft">
        <span className="flex items-center gap-1.5"><Icon size={14} /> {label}</span>
        <span className="font-bold text-ink">{value ? formatScore(value) : '–'}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand-dark transition-all duration-500" style={{ width: `${(value / 5) * 100}%` }} />
      </div>
    </div>
  );
}

export default function PlaceDetail({ place, desktop, onClose, onVoted, onRoute, onToggleFavorite, onReport, onOpenUser, onToast }: Props) {
  const auth = useAuth();
  const cat = CATEGORIES[place.category];
  const CatIcon = cat.icon;
  const mine = place.myVote;
  const [cleanliness, setCleanliness] = useState(mine?.cleanliness ?? 0);
  const [comfort, setComfort] = useState(mine?.comfort ?? 0);
  const [isPaid, setIsPaid] = useState<boolean | null>(mine?.isPaid ?? null);
  const [price, setPrice] = useState(mine?.priceAmount != null ? String(mine.priceAmount) : '');
  const [comment, setComment] = useState(mine?.comment ?? '');
  const [toiletType, setToiletType] = useState<ToiletType | null>(mine?.toiletType ?? null);
  const [sending, setSending] = useState(false);
  const { stats } = place;
  const [reviews, setReviews] = useState<Review[]>([]);

  const loadReviews = useCallback(() => {
    api<Review[]>(`/places/${place.id}/reviews`).then(setReviews).catch(() => setReviews([]));
  }, [place.id]);
  useEffect(loadReviews, [loadReviews]);

  const send = async () => {
    if (!auth.requireAuth()) return;
    if (!cleanliness || !comfort) return onToast('Lütfen temizlik ve konfor için yıldız seçin.', 'error');
    if (isPaid === null) return onToast('Lütfen tuvaletin ücretli mi ücretsiz mi olduğunu seçin.', 'error');
    setSending(true);
    try {
      const updated = await api<Place>(`/places/${place.id}/vote`, {
        method: 'PUT',
        body: { cleanliness, comfort, isPaid, priceAmount: isPaid ? parsePrice(price) : null, comment, toiletType },
      });
      onVoted(updated);
      loadReviews();
      onToast(mine ? 'Oyunuz güncellendi.' : 'Puanınız kaydedildi. Teşekkürler!', 'success');
    } catch (e) {
      onToast((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`absolute z-[45] ${desktop ? 'bottom-4 left-[432px] top-4 w-[400px]' : 'inset-0'}`} role="dialog" aria-label={`${place.name} detayı`}>
      {!desktop && <div className="absolute inset-0 animate-fade-in bg-black/30" onClick={onClose} />}
      <div
        className={`flex flex-col overflow-hidden bg-surface shadow-sheet ${
          desktop ? 'h-full animate-slide-up rounded-[28px] ring-1 ring-line' : 'absolute inset-x-0 bottom-0 max-h-[88%] animate-sheet-in rounded-t-[30px]'
        }`}
      >
        <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain">
          <div className="relative">
            <img src={placePhoto(place)} alt={place.name} className="h-48 w-full bg-card object-cover" />
            <button
              type="button"
              onClick={() => onToggleFavorite(place)}
              aria-label={place.isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
              aria-pressed={place.isFavorite}
              className="absolute right-16 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-float"
            >
              <Heart size={19} className={place.isFavorite ? 'text-red-500' : 'text-[#1A1A1A]'} fill={place.isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button type="button" onClick={onClose} aria-label="Kapat" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-[#1A1A1A] shadow-float">
              <X size={19} />
            </button>
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#1A1A1A]">
                <CatIcon size={14} /> {cat.label}
              </span>
              {place.source === 'user' && <span className="rounded-full bg-black/70 px-2.5 py-1.5 text-[10px] font-bold text-white">Topluluk ekledi</span>}
            </div>
          </div>

          <div className="px-5 pb-6 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold leading-tight text-ink">{place.name}</h2>
                {(place.address || place.district || place.province) && (
                  <p className="mt-1 flex items-start gap-1 text-sm text-ink-muted">
                    <MapPin size={14} className="mt-0.5 shrink-0" />
                    {[place.address, place.district && place.province ? `${place.district} / ${place.province}` : place.district || place.province].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <div className="shrink-0 rounded-2xl bg-brand px-3 py-2 text-center text-onbrand">
                <div className="text-xl font-extrabold leading-none">{stats.voteCount ? formatScore(stats.rating) : '–'}</div>
                <div className="mt-1 text-[10px] font-bold opacity-70">{stats.voteCount} OY</div>
              </div>
            </div>

            {place.status.closed && (
              <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-2xl bg-orange-600 p-3 text-sm text-white">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <span>
                  <b className="block">Geçici Olarak Kapalı Bildirildi</b>
                  Son 3 saatte {place.status.closedReports} kullanıcı kapalı/arızalı olduğunu bildirdi.
                </span>
              </div>
            )}
            {(place.status.noSupplies > 0 || place.status.crowded > 0) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                {place.status.noSupplies > 0 && <span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-amber-700 dark:text-amber-300">Kağıt/sabun yok · {place.status.noSupplies} bildirim</span>}
                {place.status.crowded > 0 && <span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-amber-700 dark:text-amber-300">Çok kalabalık · {place.status.crowded} bildirim</span>}
              </div>
            )}

            <div className="mt-4 space-y-3 rounded-3xl bg-card p-4">
              {stats.voteCount ? (
                <>
                  <ScoreBar label="Temizlik" icon={Sparkles} value={stats.cleanliness} />
                  <ScoreBar label="Konfor" icon={Sofa} value={stats.comfort} />
                </>
              ) : (
                <p className="text-center text-sm font-semibold text-ink-muted">Henüz puanlanmadı · İlk puanı siz verin</p>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted"><Wallet size={14} /> Ücret</div>
                <div className="mt-1.5"><PriceBadge stats={stats} size="md" /></div>
                {!stats.voteCount && <div className="mt-1 text-[10px] text-ink-muted">Türe göre tahmini</div>}
              </div>
              <div className="rounded-2xl bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted"><Clock size={14} /> Saatler</div>
                <div className="mt-1.5 text-sm font-bold text-ink">{place.hours ?? 'Bilinmiyor'}</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted"><Toilet size={14} /> Tuvalet tipi</div>
                <div className="mt-1.5 text-sm font-bold text-ink">{place.toiletType ? TOILET_TYPE_LABEL[place.toiletType] : 'Bilinmiyor'}</div>
              </div>
              <div className="rounded-2xl bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted"><KeyRound size={14} /> Erişim</div>
                <div className="mt-1.5 text-sm font-bold text-ink">{place.publicAccess ? 'Şifresiz / herkese açık' : 'Müşteriye şifreli'}</div>
              </div>
            </div>
            {(place.accessible || place.babyChanging) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {place.accessible && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-300">
                    <Accessibility size={14} /> Engelli erişimi
                  </span>
                )}
                {place.babyChanging && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/10 px-3 py-1.5 text-xs font-semibold text-pink-600 dark:text-pink-300">
                    <Baby size={14} /> Bebek bakım ünitesi
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => onRoute(place.id)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-bold text-surface transition hover:opacity-90 active:scale-[.98]"
            >
              <Navigation size={18} className="text-brand" fill="currentColor" />
              Yol Tarifi{place.distance !== null && ` · ${formatDistance(place.distance)} · ${formatWalk(place.distance)}`}
            </button>

            <section className="mt-5" aria-label="Durum bildir">
              <h3 className="text-sm font-extrabold text-ink">Şu an durum nasıl?</h3>
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                {REPORTS.map((r) => (
                  <button
                    key={r.type}
                    type="button"
                    onClick={() => onReport(place.id, r.type)}
                    className="flex items-center gap-2 rounded-2xl bg-card px-3.5 py-2.5 text-left text-sm font-semibold text-ink ring-1 ring-line transition hover:ring-orange-500"
                  >
                    <r.icon size={16} className={r.type === 'open' ? 'text-green-600' : 'text-orange-600'} /> {r.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-6 rounded-3xl border-2 border-brand bg-brand/10 p-4" aria-label="Puan ver">
              <h3 className="text-base font-extrabold text-ink">{mine ? 'Oyunuz' : 'Bu tuvaleti puanla'}</h3>
              {!auth.user ? (
                <button type="button" onClick={() => auth.openAuth('login')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-extrabold text-onbrand">
                  <LogIn size={16} /> Puan vermek için giriş yapın
                </button>
              ) : (
                <>
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between rounded-2xl bg-surface px-3 py-1.5">
                      <span className="text-sm font-bold text-ink">Temizlik</span>
                      <StarRating value={cleanliness} onChange={setCleanliness} size={24} label="Temizlik puanı" />
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-surface px-3 py-1.5">
                      <span className="text-sm font-bold text-ink">Konfor</span>
                      <StarRating value={comfort} onChange={setComfort} size={24} label="Konfor puanı" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <FeeVoteInput isPaid={isPaid} price={price} onChange={(p, v) => { setIsPaid(p); setPrice(v); }} />
                  </div>
                  <div className="mt-2" role="radiogroup" aria-label="Tuvalet tipi">
                    <span className="mb-1 block text-xs font-bold text-ink-soft">Tuvalet tipi (isteğe bağlı)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(TOILET_TYPE_LABEL) as ToiletType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={toiletType === t}
                          onClick={() => setToiletType(toiletType === t ? null : t)}
                          className={`rounded-full px-3 py-1.5 text-xs font-bold ${toiletType === t ? 'bg-night text-white' : 'bg-surface text-ink-soft ring-1 ring-line'}`}
                        >
                          {t === 'ikisi' ? 'İkisi de' : TOILET_TYPE_LABEL[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={280}
                    rows={2}
                    placeholder="Kısa bir yorum (isteğe bağlı)"
                    className="mt-2 w-full resize-none rounded-2xl border-2 border-transparent bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand-dark"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[11px] text-ink-muted">{comment.length}/280</span>
                    <button
                      type="button"
                      onClick={send}
                      disabled={sending}
                      className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-extrabold text-onbrand transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                    >
                      <Send size={15} /> {mine ? 'Oyumu Güncelle' : 'Puanı Gönder'}
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="mt-6">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <MessageSquareText size={16} /> Son yorumlar
                <span className="text-xs font-semibold text-ink-muted">({reviews.length})</span>
              </h3>
              {reviews.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">Henüz yorum yok.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {reviews.map((r) => (
                    <li key={r.userId} className="rounded-2xl bg-card p-3">
                      <div className="flex items-center gap-2.5">
                        <button type="button" onClick={() => onOpenUser(r.userId)} aria-label={`${r.displayName} profili`} className="shrink-0">
                          <Avatar name={r.displayName} url={r.avatarUrl} size={34} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <button type="button" onClick={() => onOpenUser(r.userId)} className="block truncate text-left text-sm font-bold text-ink hover:underline">
                            {r.displayName}
                          </button>
                          <span className="text-[11px] text-ink-muted">{relTime(r.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                        <span className="flex items-center gap-1">Temizlik <StarRating value={r.cleanliness} size={10} /></span>
                        <span className="flex items-center gap-1">Konfor <StarRating value={r.comfort} size={10} /></span>
                        <span>{r.isPaid ? `Ücretli${r.priceAmount ? ` · ${r.priceAmount.toLocaleString('tr-TR')} ₺` : ''}` : 'Ücretsiz'}</span>
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
