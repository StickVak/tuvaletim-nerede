import { useRef, useState } from 'react';
import { Camera, Save, Trash2, X } from 'lucide-react';
import type { Place, ToiletCategory, ToiletType } from '../../src/types';
import { CATEGORIES, CATEGORY_ORDER, placePhoto } from '../../src/lib/categories';
import { readImageAsDataUrl } from '../../src/lib/image';
import { TURKEY_CENTER } from '../../src/lib/turkey';
import LocationEditor from './LocationEditor';
import { inputCls, Lightbox } from './ui';

type EditFields = Pick<Place, 'name' | 'category' | 'province' | 'district' | 'address' | 'lat' | 'lng' | 'hours' | 'accessible' | 'babyChanging' | 'toiletType' | 'publicAccess'> & {
  /** undefined: değişmedi · null: kaldır · string: yeni fotoğraf */
  photo?: string | null;
};

/** place verilmezse yeni mekan oluşturma modu */
export default function PlaceEditModal({ place, onClose, onSave }: { place?: Place | null; onClose: () => void; onSave: (changes: EditFields) => Promise<unknown> }) {
  const [form, setForm] = useState<EditFields>(
    place
      ? {
          name: place.name, category: place.category, province: place.province, district: place.district, address: place.address,
          lat: place.lat, lng: place.lng, hours: place.hours,
          accessible: place.accessible, babyChanging: place.babyChanging,
          toiletType: place.toiletType, publicAccess: place.publicAccess,
        }
      : {
          name: '', category: 'belediye', province: null, district: null, address: null, lat: TURKEY_CENTER.lat, lng: TURKEY_CENTER.lng, hours: null,
          accessible: false, babyChanging: false, toiletType: null, publicAccess: true, photo: null,
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const set = <K extends keyof EditFields>(k: K, v: EditFields[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 3) return setError('Mekan adı en az 3 karakter olmalı.');
    if (!Number.isFinite(form.lat) || !Number.isFinite(form.lng) || Math.abs(form.lat) > 90 || Math.abs(form.lng) > 180)
      return setError('Geçerli bir koordinat girin.');
    if (!form.province || !form.district) return setError('İl ve ilçe seçin.');
    setSaving(true);
    await onSave({ ...form, name: form.name.trim() });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={place ? 'Mekanı düzenle' : 'Yeni mekan'}>
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} />
      <form onSubmit={save} className="relative flex max-h-[94dvh] w-full max-w-3xl animate-slide-up flex-col rounded-t-[28px] bg-surface shadow-2xl sm:rounded-[28px]">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-extrabold">{place ? 'Mekanı düzenle' : 'Yeni mekan ekle'}</h2>
            <p className="font-mono text-[11px] text-ink-muted">{place ? place.id : 'Haritaya tıklayarak konumu seçin'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-full bg-card p-2 hover:bg-line/60"><X size={18} /></button>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-soft">Mekan adı</span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} maxLength={60} />
            </label>
            <div>
              <span className="mb-1 block text-xs font-bold text-ink-soft">Tür</span>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_ORDER.map((c: ToiletCategory) => (
                  <button key={c} type="button" onClick={() => set('category', c)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${form.category === c ? 'bg-ink text-surface' : 'bg-card text-ink-soft'}`}>
                    {CATEGORIES[c].label}
                  </button>
                ))}
              </div>
            </div>
            <p className="rounded-xl bg-card px-3 py-2 text-xs text-ink-muted">Ücret durumu ve puanlar kullanıcı oylarıyla belirlenir; buradan düzenlenmez.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink-soft">Tuvalet tipi (başlangıç)</span>
                <select value={form.toiletType ?? ''} onChange={(e) => set('toiletType', (e.target.value || null) as ToiletType | null)} className={inputCls}>
                  <option value="">Bilinmiyor</option>
                  <option value="alafranga">Alafranga</option>
                  <option value="alaturka">Alaturka</option>
                  <option value="ikisi">İkisi de</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink-soft">Erişim</span>
                <select value={form.publicAccess ? '1' : '0'} onChange={(e) => set('publicAccess', e.target.value === '1')} className={inputCls}>
                  <option value="1">Şifresiz / herkese açık</option>
                  <option value="0">Müşteriye şifreli</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-soft">Çalışma saatleri</span>
              <input value={form.hours ?? ''} onChange={(e) => set('hours', e.target.value || null)} maxLength={60} className={inputCls} />
            </label>
            <div className="flex gap-4 text-sm font-semibold">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.accessible} onChange={(e) => set('accessible', e.target.checked)} className="h-4 w-4 accent-ink" /> Engelli erişimi</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.babyChanging} onChange={(e) => set('babyChanging', e.target.checked)} className="h-4 w-4 accent-ink" /> Bebek bakım</label>
            </div>
          </div>

          <div className="space-y-3">

            <LocationEditor
              value={form}
              category={form.category}
              moveOnProvince={!place}
              legacyDistrict={place && !place.province ? place.district : null}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            />
            <div>
              <span className="mb-1 block text-xs font-bold text-ink-soft">Dış mekan fotoğrafı (giriş / bina cephesi)</span>
              <div className="relative overflow-hidden rounded-2xl">
                {(() => {
                  const hasReal = form.photo ? true : form.photo === undefined && !!place?.hasPhoto;
                  const src = form.photo === undefined && place ? placePhoto(place) : placePhoto({ ...form, photo: form.photo ?? null });
                  return hasReal ? (
                    <button type="button" onClick={() => setZoom(src)} className="block w-full" aria-label="Fotoğrafı büyüt">
                      <img src={src} alt="Dış mekan fotoğrafı" className="h-64 w-full bg-card object-cover" />
                    </button>
                  ) : (
                    <img src={src} alt="" className="h-40 w-full bg-card object-cover opacity-70" />
                  );
                })()}
                <div className="absolute bottom-2 right-2 flex gap-1.5">
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-onbrand shadow">
                    <Camera size={13} /> Değiştir
                  </button>
                  {(form.photo || (form.photo === undefined && place?.hasPhoto)) && (
                    <button type="button" onClick={() => set('photo', null)} aria-label="Fotoğrafı kaldır" className="rounded-full bg-white/95 p-1.5 text-red-600 shadow">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) set('photo', await readImageAsDataUrl(f));
              }} />
            </div>
          </div>
        </div>

        {zoom && <Lightbox src={zoom} alt="Dış mekan fotoğrafı" onClose={() => setZoom(null)} />}
        <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <p className="text-sm font-semibold text-red-600">{error}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl bg-card px-4 py-2.5 text-sm font-bold">Vazgeç</button>
            <button type="submit" disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-extrabold hover:bg-brand-dark disabled:opacity-60 text-onbrand">
              <Save size={15} /> {place ? 'Kaydet' : 'Mekanı ekle'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
