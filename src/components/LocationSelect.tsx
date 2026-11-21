import { useId } from 'react';
import { PROVINCES, districtsOf } from '../lib/turkey';

/**
 * İl → İlçe seçimi. İl değişince ilçe sıfırlanır ve ilçe listesi o ilin ilçeleriyle güncellenir.
 * mode="filter": "Tüm İller" / "Tüm İlçeler" seçenekleri (boş = filtre yok).
 * mode="form": "İl seçin" / "İlçe seçin" (zorunlu alanlar için).
 * Yerel <select>: telefonda sistem seçicisi açılır, klavyede harfe basınca ilgili ile atlar.
 */
export default function LocationSelect({
  province,
  district,
  onChange,
  mode = 'form',
  className = 'w-full cursor-pointer rounded-2xl border-2 border-transparent bg-card px-3 py-3 text-sm font-semibold text-ink outline-none focus:border-brand-dark disabled:cursor-not-allowed disabled:opacity-60',
  error,
}: {
  province: string;
  district: string;
  onChange: (v: { province: string; district: string }) => void;
  mode?: 'form' | 'filter';
  className?: string;
  /** Formda gösterilecek hata (il/ilçe seçilmedi vb.) */
  error?: string;
}) {
  const id = useId();
  const districts = districtsOf(province);
  const all = mode === 'filter';
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={province}
          onChange={(e) => onChange({ province: e.target.value, district: '' })}
          aria-label="İl"
          aria-invalid={Boolean(error) && !province}
          aria-describedby={error ? `${id}-err` : undefined}
          className={className}
        >
          <option value="">{all ? 'Tüm İller' : 'İl seçin'}</option>
          {PROVINCES.map((p) => (
            <option key={p.plaka} value={p.il}>
              {p.il}
            </option>
          ))}
        </select>
        <select
          value={district}
          onChange={(e) => onChange({ province, district: e.target.value })}
          disabled={!province}
          aria-label="İlçe"
          aria-invalid={Boolean(error) && Boolean(province) && !district}
          aria-describedby={error ? `${id}-err` : undefined}
          className={className}
        >
          <option value="">{!province ? 'Önce il seçin' : all ? 'Tüm İlçeler' : 'İlçe seçin'}</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 px-1 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
