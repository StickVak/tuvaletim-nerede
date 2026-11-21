import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { LatLng, ToiletCategory } from '../../src/types';
import LocationSelect from '../../src/components/LocationSelect';
import { districtsOf, findProvince } from '../../src/lib/turkey';
import { api } from './api';
import MiniMap, { type MapFocus } from './MiniMap';
import { inputCls } from './ui';

export interface LocationValue extends LatLng {
  province: string | null;
  district: string | null;
  address: string | null;
}

type GeoResult = { result: (LatLng & { label: string }) | null };

/**
 * Konum düzenleyici (mekan ve başvuru düzenleme): il → ilçe, adres, etkileşimli harita, koordinatlar.
 * - Haritaya tıklama ya da işaretçiyi sürükleme konumu değiştirir.
 * - İl/ilçe seçilince harita o bölgeye odaklanır (işaretçi yerinde kalır; doğru noktayı admin seçer).
 * - "Adresten bul": adres + ilçe + il aranır, işaretçi bulunan noktaya taşınır.
 * moveOnProvince: yeni kayıtta il seçilince işaretçi de il merkezine taşınır.
 */
export default function LocationEditor({
  value,
  category,
  onChange,
  moveOnProvince = false,
  legacyDistrict,
}: {
  value: LocationValue;
  category: ToiletCategory;
  onChange: (patch: Partial<LocationValue>) => void;
  moveOnProvince?: boolean;
  /** Listede olmayan eski serbest metin ilçe (bilgi olarak gösterilir) */
  legacyDistrict?: string | null;
}) {
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const geocode = async (q: string) => (await api<GeoResult>(`/geocode?q=${encodeURIComponent(q)}`)).result;

  /** İl/ilçe seçilince haritayı oraya götür: ilçe aranır, bulunamazsa il merkezi */
  const focusRegion = async (province: string, district: string) => {
    const il = findProvince(province);
    if (!il) return;
    setFocus({ lat: il.lat, lng: il.lng, zoom: 10, key: Date.now() });
    if (!district) return;
    try {
      const r = await geocode(`${district}, ${il.il}`);
      if (r) setFocus({ lat: r.lat, lng: r.lng, zoom: 13, key: Date.now() });
    } catch {
      /* il merkezinde kalınır */
    }
  };

  const findAddress = async () => {
    const q = [value.address, value.district, value.province].filter(Boolean).join(', ');
    if (!value.address?.trim()) return setNote({ tone: 'err', text: 'Önce adresi yazın.' });
    setBusy(true);
    setNote(null);
    try {
      const r = await geocode(q);
      if (!r) return setNote({ tone: 'err', text: 'Adres bulunamadı. Konumu haritaya tıklayarak seçin.' });
      onChange({ lat: r.lat, lng: r.lng });
      setFocus({ lat: r.lat, lng: r.lng, zoom: 17, key: Date.now() });
      setNote({ tone: 'ok', text: `Bulundu: ${r.label}` });
    } catch (e) {
      setNote({ tone: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const legacy = legacyDistrict && !districtsOf(value.province).includes(legacyDistrict) ? legacyDistrict : null;

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-xs font-bold text-ink-soft">İl / İlçe</span>
        <LocationSelect
          province={value.province ?? ''}
          district={districtsOf(value.province).includes(value.district ?? '') ? (value.district ?? '') : ''}
          className={inputCls}
          onChange={(v) => {
            const il = findProvince(v.province);
            onChange({
              province: v.province || null,
              district: v.district || null,
              ...(moveOnProvince && il && v.province !== value.province ? { lat: il.lat, lng: il.lng } : {}),
            });
            void focusRegion(v.province, v.district);
          }}
        />
        {legacy && <p className="mt-1 text-xs text-ink-muted">Eski kayıt: “{legacy}” — listeden il ve ilçe seçin.</p>}
      </div>
      <div>
        <span className="mb-1 block text-xs font-bold text-ink-soft">Adres</span>
        <div className="flex gap-2">
          <input value={value.address ?? ''} onChange={(e) => onChange({ address: e.target.value || null })} maxLength={120} className={inputCls} aria-label="Adres" />
          <button
            type="button"
            onClick={() => void findAddress()}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-card px-3 text-xs font-bold ring-1 ring-line hover:bg-line/60 disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Adresten bul
          </button>
        </div>
        {note && <p role="status" className={`mt-1 text-xs ${note.tone === 'ok' ? 'text-green-700 dark:text-green-400' : 'font-semibold text-red-600'}`}>{note.text}</p>}
      </div>
      <div>
        <span className="mb-1 block text-xs font-bold text-ink-soft">Konum — haritaya tıklayın ya da işaretçiyi sürükleyin</span>
        <MiniMap center={value} category={category} className="h-64" focus={focus} onPick={(p) => onChange(p)} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input type="number" step="0.00001" value={value.lat} onChange={(e) => onChange({ lat: parseFloat(e.target.value) })} className={`${inputCls} font-mono`} aria-label="Enlem" />
          <input type="number" step="0.00001" value={value.lng} onChange={(e) => onChange({ lng: parseFloat(e.target.value) })} className={`${inputCls} font-mono`} aria-label="Boylam" />
        </div>
      </div>
    </div>
  );
}
