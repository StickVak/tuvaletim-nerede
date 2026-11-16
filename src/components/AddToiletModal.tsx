import { useEffect, useRef, useState } from 'react';
import { Accessibility, Baby, Camera, Crosshair, ImagePlus, LocateFixed, MapPin, Send, Trash2, X } from 'lucide-react';
import type { LatLng, PlaceDraft, ToiletCategory, ToiletType } from '../types';
import { CATEGORIES, CATEGORY_ORDER } from '../lib/categories';
import FeeVoteInput, { parsePrice } from './FeeVoteInput';
import { readImageAsDataUrl } from '../lib/image';
import StarRating from './StarRating';

interface Props {
  visible: boolean;
  location: LatLng | null;
  onRequestPick: () => void;
  onUseMyLocation: () => void;
  onClose: () => void;
  desktop: boolean;
  onSubmit: (draft: PlaceDraft) => Promise<void> | void;
}

export default function AddToiletModal({
  visible,
  location,
  onRequestPick,
  onUseMyLocation,
  onClose,
  onSubmit,
  desktop,
}: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ToiletCategory>('kafe');
  const [isPaid, setIsPaid] = useState<boolean | null>(null);
  const [district, setDistrict] = useState('');
  const [toiletType, setToiletType] = useState<ToiletType | null>(null);
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [price, setPrice] = useState('');
  const [cleanliness, setCleanliness] = useState(0);
  const [comfort, setComfort] = useState(0);
  const [accessible, setAccessible] = useState(false);
  const [babyChanging, setBabyChanging] = useState(false);
  const [hours, setHours] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (location) setErrors((e) => ({ ...e, location: '' }));
  }, [location]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors((e) => ({ ...e, photo: 'Lütfen bir görsel dosyası seçin.' }));
      return;
    }
    setPhotoLoading(true);
    try {
      setPhoto(await readImageAsDataUrl(file));
      setErrors((e) => ({ ...e, photo: '' }));
    } catch {
      setErrors((e) => ({ ...e, photo: 'Görsel okunamadı.' }));
    } finally {
      setPhotoLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 3) errs.name = 'Mekan adı en az 3 karakter olmalı.';
    if (!location) errs.location = 'Haritadan bir konum seçin.';
    if (!cleanliness) errs.cleanliness = 'Temizlik puanı verin.';
    if (!comfort) errs.comfort = 'Konfor puanı verin.';
    if (isPaid === null) errs.fee = 'Ücretli mi ücretsiz mi, seçin.';
    setErrors(errs);
    if (Object.values(errs).some(Boolean) || !location || isPaid === null) return;

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        lat: location.lat,
        lng: location.lng,
        district: district.trim() || undefined,
        address: address.trim() || undefined,
        photo: photo ?? undefined,
        hours: hours.trim() || undefined,
        accessible,
        babyChanging,
        vote: { cleanliness, comfort, isPaid, priceAmount: isPaid ? parsePrice(price) : null, comment: null, toiletType },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`absolute inset-0 z-50 ${visible ? '' : 'hidden'}`} role="dialog" aria-modal="true" aria-label="Tuvalet ekle">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={submit}
        noValidate
        className={
          desktop
            ? 'absolute left-1/2 top-1/2 flex max-h-[90%] w-[520px] -translate-x-1/2 -translate-y-1/2 animate-fade-in flex-col rounded-[32px] bg-surface shadow-2xl'
            : 'absolute inset-x-0 bottom-0 flex max-h-[92%] animate-sheet-in flex-col rounded-t-[32px] bg-surface shadow-sheet'
        }
      >
        <header className="flex items-center justify-between px-5 pb-3 pt-5">
          <div>
            <h2 className="text-xl font-extrabold">Tuvalet Ekle</h2>
            <p className="text-xs font-medium text-ink-muted">İncelendikten sonra haritada yayınlanır.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-full bg-card p-2 hover:bg-line/60">
            <X size={18} />
          </button>
        </header>

        <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-5 pb-4">
          {/* Fotoğraf */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {photo ? (
              <div className="relative overflow-hidden rounded-3xl">
                <img src={photo} alt="Önizleme" className="h-44 w-full object-cover" />
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-onbrand shadow"
                  >
                    <Camera size={14} /> Değiştir
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    aria-label="Fotoğrafı kaldır"
                    className="rounded-full bg-white/95 p-1.5 text-red-600 shadow"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line bg-card text-ink-soft transition hover:border-brand-dark hover:bg-brand-soft"
              >
                {photoLoading ? (
                  <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-ink" />
                ) : (
                  <ImagePlus size={28} />
                )}
                <span className="text-sm font-bold">Mekan fotoğrafı yükle</span>
                <span className="text-[11px] text-ink-muted">Kamera veya galeri · isteğe bağlı</span>
              </button>
            )}
            {errors.photo && <p className="mt-1 text-xs font-semibold text-red-600">{errors.photo}</p>}
          </div>

          {/* Konum */}
          <div>
            <span className="mb-1.5 block text-sm font-bold">Konum</span>
            <div
              className={`rounded-2xl border-2 p-3 ${
                errors.location ? 'border-red-300 bg-red-500/10' : location ? 'border-transparent bg-card' : 'border-transparent bg-card'
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={16} className={location ? 'text-ink' : 'text-ink-muted'} />
                {location ? (
                  <span className="font-mono text-xs font-semibold">
                    {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                  </span>
                ) : (
                  <span className="text-ink-muted">Henüz konum seçilmedi</span>
                )}
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onRequestPick}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-ink py-2.5 text-xs font-bold text-surface"
                >
                  <Crosshair size={15} /> Haritadan Seç
                </button>
                <button
                  type="button"
                  onClick={onUseMyLocation}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-surface py-2.5 text-xs font-bold text-ink ring-1 ring-line"
                >
                  <LocateFixed size={15} /> Konumum
                </button>
              </div>
            </div>
            {errors.location && <p className="mt-1 text-xs font-semibold text-red-600">{errors.location}</p>}
          </div>

          {/* Ad */}
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Mekan adı</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="örn. Moda Sahil Kafe"
              maxLength={60}
              className={`w-full rounded-2xl border-2 bg-card px-4 py-3 text-[15px] font-medium outline-none transition placeholder:text-ink-muted focus:border-brand-dark focus:bg-surface ${
                errors.name ? 'border-red-300' : 'border-transparent'
              }`}
            />
            {errors.name && <p className="mt-1 text-xs font-semibold text-red-600">{errors.name}</p>}
          </label>

          <div className="grid grid-cols-[2fr_3fr] gap-2">
            <input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="İlçe"
              maxLength={60}
              className="w-full rounded-2xl border-2 border-transparent bg-card px-4 py-3 text-sm font-medium outline-none focus:border-brand-dark focus:bg-surface"
            />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Adres (isteğe bağlı)"
              maxLength={80}
              className="w-full rounded-2xl border-2 border-transparent bg-card px-4 py-3 text-sm font-medium outline-none focus:border-brand-dark focus:bg-surface"
            />
          </div>

          {/* Kategori */}
          <div>
            <span className="mb-1.5 block text-sm font-bold">Mekan türü</span>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              {CATEGORY_ORDER.map((c) => {
                const Icon = CATEGORIES[c].icon;
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
                      active ? 'bg-ink text-surface' : 'bg-card text-ink-soft hover:bg-line/60'
                    }`}
                  >
                    <Icon size={15} /> {CATEGORIES[c].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Puanlar */}
          <div className="grid grid-cols-1 gap-2">
            <div className={`flex items-center justify-between rounded-2xl bg-card px-4 py-2 ${errors.cleanliness ? 'ring-2 ring-red-300' : ''}`}>
              <span className="text-sm font-bold">Temizlik</span>
              <StarRating value={cleanliness} onChange={setCleanliness} size={24} label="Temizlik puanı" />
            </div>
            <div className={`flex items-center justify-between rounded-2xl bg-card px-4 py-2 ${errors.comfort ? 'ring-2 ring-red-300' : ''}`}>
              <span className="text-sm font-bold">Konfor</span>
              <StarRating value={comfort} onChange={setComfort} size={24} label="Konfor puanı" />
            </div>
            {(errors.cleanliness || errors.comfort) && (
              <p className="text-xs font-semibold text-red-600">{errors.cleanliness || errors.comfort}</p>
            )}
          </div>

          {/* Ücret: puanların hemen altında */}
          <div className={errors.fee ? 'rounded-2xl ring-2 ring-red-300' : ''}>
            <FeeVoteInput isPaid={isPaid} price={price} onChange={(p, v) => { setIsPaid(p); setPrice(v); }} />
          </div>
          {errors.fee && <p className="-mt-3 text-xs font-semibold text-red-600">{errors.fee}</p>}

          <div role="radiogroup" aria-label="Tuvalet tipi">
            <span className="mb-1.5 block text-sm font-bold">Tuvalet tipi <span className="font-medium text-ink-muted">(isteğe bağlı)</span></span>
            <div className="flex flex-wrap gap-2">
              {([['alafranga', 'Alafranga'], ['alaturka', 'Alaturka'], ['ikisi', 'İkisi de']] as [ToiletType, string][]).map(([t, l]) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={toiletType === t}
                  onClick={() => setToiletType(toiletType === t ? null : t)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${toiletType === t ? 'bg-night text-white' : 'bg-card text-ink-soft'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Ek bilgiler */}
          <div>
            <span className="mb-1.5 block text-sm font-bold">Ek bilgiler</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAccessible((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                  accessible ? 'bg-blue-600 text-white' : 'bg-card text-ink-soft'
                }`}
              >
                <Accessibility size={14} /> Engelli erişimi
              </button>
              <button
                type="button"
                onClick={() => setBabyChanging((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                  babyChanging ? 'bg-pink-600 text-white' : 'bg-card text-ink-soft'
                }`}
              >
                <Baby size={14} /> Bebek bakım
              </button>
            </div>
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Çalışma saatleri (örn. 09:00 – 22:00)"
              maxLength={40}
              className="mt-2 w-full rounded-2xl border-2 border-transparent bg-card px-4 py-3 text-sm font-medium outline-none focus:border-brand-dark focus:bg-surface"
            />
          </div>
        </div>

        <footer className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="submit"
            disabled={photoLoading || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-base font-extrabold text-onbrand shadow-float transition hover:bg-brand-dark active:scale-[.98] disabled:opacity-60"
          >
            <Send size={18} /> Onaya Gönder
          </button>
        </footer>
      </form>
    </div>
  );
}
