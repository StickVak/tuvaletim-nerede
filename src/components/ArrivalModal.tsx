import { useState } from 'react';
import { Loader2, LogIn, MapPinCheck } from 'lucide-react';
import type { Place, PlaceView } from '../types';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import StarRating from './StarRating';
import FeeVoteInput, { parsePrice } from './FeeVoteInput';

interface Props {
  place: PlaceView;
  onSkip: () => void;
  onDone: (place: Place, contributions: number) => void;
  onError: (msg: string) => void;
}

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  const btn = (v: boolean, text: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => onChange(v)}
      className={`rounded-xl py-2 text-sm font-bold transition ${value === v ? (v ? 'bg-green-700 text-white' : 'bg-orange-700 text-white') : 'text-ink-muted hover:text-ink'}`}
    >
      {text}
    </button>
  );
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold text-ink">{label}</span>
      <div className="grid w-36 shrink-0 grid-cols-2 gap-1 rounded-2xl bg-card p-1" role="radiogroup" aria-label={label}>
        {btn(true, 'Evet')}
        {btn(false, 'Hayır')}
      </div>
    </div>
  );
}

/** Yolculuk sonu: hızlı değerlendirme (açık mıydı, kağıt, temizlik/konfor, ücret) */
export default function ArrivalModal({ place, onSkip, onDone, onError }: Props) {
  const { user, openAuth } = useAuth();
  const [wasOpen, setWasOpen] = useState<boolean | null>(null);
  const [hadPaper, setHadPaper] = useState<boolean | null>(null);
  const [cleanliness, setCleanliness] = useState(0);
  const [comfort, setComfort] = useState(0);
  const [isPaid, setIsPaid] = useState<boolean | null>(null);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = wasOpen === false || (wasOpen === true && cleanliness > 0 && comfort > 0 && isPaid !== null);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ place: Place; contributions: number }>(`/places/${place.id}/arrival`, {
        method: 'POST',
        body: wasOpen
          ? { wasOpen, hadPaper, cleanliness, comfort, isPaid, priceAmount: isPaid ? parsePrice(price) : null }
          : { wasOpen },
      });
      onDone(r.place, r.contributions);
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[65] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Varış ve değerlendirme">
      <div className="absolute inset-0 animate-fade-in bg-black/50" />
      <div className="relative max-h-[90%] w-full max-w-sm animate-slide-up overflow-y-auto rounded-[28px] bg-surface p-6 text-ink shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-onbrand">
            <MapPinCheck size={28} />
          </span>
          <h2 className="mt-3 text-lg font-extrabold">Vardın! 🎉</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{place.name}</p>
        </div>

        {!user ? (
          <div className="mt-6 space-y-2">
            <p className="text-center text-sm text-ink-soft">Deneyimini paylaşmak için giriş yap.</p>
            <button type="button" onClick={() => openAuth('login')} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-extrabold text-onbrand">
              <LogIn size={16} /> Giriş yap ve değerlendir
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <YesNo label="Açık mıydı?" value={wasOpen} onChange={setWasOpen} />
            {wasOpen && (
              <>
                <YesNo label="Kağıt var mıydı?" value={hadPaper} onChange={setHadPaper} />
                <div className="flex items-center justify-between rounded-2xl bg-card px-3 py-1.5">
                  <span className="text-sm font-bold">Temizlik</span>
                  <StarRating value={cleanliness} onChange={setCleanliness} size={22} label="Temizlik puanı" />
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-card px-3 py-1.5">
                  <span className="text-sm font-bold">Konfor</span>
                  <StarRating value={comfort} onChange={setComfort} size={22} label="Konfor puanı" />
                </div>
                <FeeVoteInput isPaid={isPaid} price={price} onChange={(p, v) => { setIsPaid(p); setPrice(v); }} />
              </>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!ready || busy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-base font-extrabold text-onbrand transition hover:bg-brand-dark disabled:opacity-50"
            >
              {busy && <Loader2 size={18} className="animate-spin" />} Gönder
            </button>
          </div>
        )}
        <button type="button" onClick={onSkip} className="mt-2 w-full rounded-2xl py-2.5 text-sm font-bold text-ink-muted hover:text-ink">
          Atla
        </button>
      </div>
    </div>
  );
}
