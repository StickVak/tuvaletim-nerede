import { useState } from 'react';
import { Save, X } from 'lucide-react';
import type { ToiletCategory, ToiletType } from '../../src/types';
import { CATEGORIES, CATEGORY_ORDER } from '../../src/lib/categories';
import type { AdminPending } from './types';
import LocationEditor, { type LocationValue } from './LocationEditor';
import { OutdoorPhoto, inputCls } from './ui';

export interface PendingChanges extends LocationValue {
  name: string;
  category: ToiletCategory;
  hours: string | null;
  accessible: boolean;
  babyChanging: boolean;
  publicAccess: boolean | null;
  toiletType: ToiletType | null;
  isPaid: boolean;
  priceAmount: number | null;
}

/**
 * Başvuru düzenleme (onaydan önce): ad, tür, il/ilçe, adres, konum (harita), saatler, özellikler, ücret.
 * Başvuranın temizlik/konfor puanı ve yorumu değiştirilmez. Kaydedilen konum onaylanınca haritada yayınlanır.
 */
export default function PendingEditModal({ pending, onClose, onSave }: { pending: AdminPending; onClose: () => void; onSave: (c: PendingChanges) => Promise<unknown> }) {
  const [form, setForm] = useState<PendingChanges>({
    name: pending.name, category: pending.category, province: pending.province, district: pending.district, address: pending.address,
    lat: pending.lat, lng: pending.lng, hours: pending.hours, accessible: pending.accessible, babyChanging: pending.babyChanging,
    publicAccess: pending.publicAccess ?? null, toiletType: pending.vote.toiletType ?? null,
    isPaid: pending.vote.isPaid, priceAmount: pending.vote.priceAmount,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PendingChanges>(k: K, v: PendingChanges[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 3) return setError('Mekan adı en az 3 karakter olmalı.');
    if (!form.province || !form.district) return setError('İl ve ilçe seçin.');
    if (!Number.isFinite(form.lat) || !Number.isFinite(form.lng)) return setError('Geçerli bir konum seçin.');
    if (form.isPaid && form.priceAmount !== null && (form.priceAmount < 0 || form.priceAmount > 1000)) return setError('Ücret 0-1000 ₺ arasında olmalı.');
    setError('');
    setSaving(true);
    await onSave({ ...form, name: form.name.trim(), priceAmount: form.isPaid ? form.priceAmount : null });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Başvuruyu düzenle">
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} />
      <form onSubmit={save} className="relative flex max-h-[94dvh] w-full max-w-4xl animate-slide-up flex-col rounded-t-[28px] bg-surface shadow-2xl sm:rounded-[28px]">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-extrabold">Başvuruyu düzenle</h2>
            <p className="text-[11px] text-ink-muted">{pending.username ? `@${pending.username} · ` : ''}Onaylanınca bu bilgilerle haritada yayınlanır</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-full bg-card p-2 hover:bg-line/60"><X size={18} /></button>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-soft">Mekan adı</span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} maxLength={60} aria-label="Mekan adı" />
            </label>
            <div>
              <span className="mb-1 block text-xs font-bold text-ink-soft">Tür</span>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_ORDER.map((c: ToiletCategory) => (
                  <button key={c} type="button" onClick={() => set('category', c)} aria-pressed={form.category === c}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${form.category === c ? 'bg-ink text-surface' : 'bg-card text-ink-soft ring-1 ring-line'}`}>
                    {CATEGORIES[c].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink-soft">Ücret</span>
                <select value={form.isPaid ? '1' : '0'} onChange={(e) => set('isPaid', e.target.value === '1')} className={inputCls} aria-label="Ücret">
                  <option value="0">Ücretsiz</option>
                  <option value="1">Ücretli</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink-soft">Tutar (₺)</span>
                <input
                  type="number" min={0} max={1000} step="0.5" disabled={!form.isPaid}
                  value={form.isPaid ? (form.priceAmount ?? '') : ''}
                  onChange={(e) => set('priceAmount', e.target.value === '' ? null : Number(e.target.value))}
                  className={`${inputCls} disabled:opacity-50`} aria-label="Tutar"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink-soft">Tuvalet tipi</span>
                <select value={form.toiletType ?? ''} onChange={(e) => set('toiletType', (e.target.value || null) as ToiletType | null)} className={inputCls}>
                  <option value="">Bilinmiyor</option>
                  <option value="alafranga">Alafranga</option>
                  <option value="alaturka">Alaturka</option>
                  <option value="ikisi">İkisi de</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink-soft">Erişim</span>
                <select value={form.publicAccess == null ? '' : form.publicAccess ? '1' : '0'} onChange={(e) => set('publicAccess', e.target.value === '' ? null : e.target.value === '1')} className={inputCls}>
                  <option value="">Belirtilmemiş</option>
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
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.accessible} onChange={(e) => set('accessible', e.target.checked)} className="h-4 w-4 accent-ink" /> Engelli erişimi</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.babyChanging} onChange={(e) => set('babyChanging', e.target.checked)} className="h-4 w-4 accent-ink" /> Bebek bakım</label>
            </div>
            <OutdoorPhoto src={pending.photo} alt={`${pending.name} dış mekan fotoğrafı`} className="h-48" />
          </div>

          <LocationEditor
            value={form}
            category={form.category}
            legacyDistrict={!pending.province ? pending.district : null}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          />
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>
          <button type="submit" disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-extrabold text-onbrand hover:bg-brand-dark disabled:opacity-60">
            <Save size={16} /> Kaydet
          </button>
        </footer>
      </form>
    </div>
  );
}
