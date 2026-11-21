import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock3, Loader2, MapPin, RotateCcw, Save, X } from 'lucide-react';
import type { ToiletCategory, ToiletType } from '../../src/types';
import { CATEGORIES, CATEGORY_ORDER } from '../../src/lib/categories';
import StarRating from '../../src/components/StarRating';
import type { AdminPending } from './types';
import LocationEditor, { type LocationValue } from './LocationEditor';
import { OutdoorPhoto, inputCls, relTime } from './ui';

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

const fromPending = (p: AdminPending): PendingChanges => ({
  name: p.name, category: p.category, province: p.province, district: p.district, address: p.address,
  lat: p.lat, lng: p.lng, hours: p.hours, accessible: p.accessible, babyChanging: p.babyChanging,
  publicAccess: p.publicAccess ?? null, toiletType: p.vote.toiletType ?? null,
  isPaid: p.vote.isPaid, priceAmount: p.vote.isPaid ? p.vote.priceAmount : null,
});

/** Kaydetmeden önce istemci tarafı kontrol (sunucu da aynılarını doğrular) — hata metni ya da null */
function validate(f: PendingChanges): string | null {
  if (f.name.trim().length < 3) return 'Mekan adı en az 3 karakter olmalı.';
  if (!f.province || !f.district) return 'İl ve ilçe seçin.';
  if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng)) return 'Geçerli bir konum seçin.';
  if (f.isPaid && f.priceAmount !== null && (f.priceAmount < 0 || f.priceAmount > 1000)) return 'Ücret 0-1000 ₺ arasında olmalı.';
  return null;
}

/**
 * Başvuru kartı: tüm alanlar kartın içinde düzenlenir (açılır pencere yok). Haritaya tıklama / işaretçiyi sürükleme
 * konumu değiştirir. "Değişiklikleri Kaydet" yalnızca değişiklik varsa etkin; "Onayla" kaydedilmemiş değişiklik varsa
 * önce onları kaydeder, sonra mekanı haritada yayınlar.
 */
export default function PendingCard({
  pending,
  onSave,
  onApprove,
  onReject,
}: {
  pending: AdminPending;
  onSave: (changes: PendingChanges) => Promise<boolean>;
  onApprove: () => Promise<boolean>;
  onReject: () => void;
}) {
  const initial = useMemo(() => fromPending(pending), [pending]);
  const [form, setForm] = useState<PendingChanges>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'save' | 'approve' | null>(null);
  // Kendi kaydımızdan sonra gelen yeni veriyle formu eşitle (sunucu yazımı düzeltmiş olabilir). Başka bir kartın
  // işlemiyle gelen yeniden yüklemeler kaydedilmemiş düzenlemeleri silmez.
  const syncAfterSave = useRef(false);
  useEffect(() => {
    if (!syncAfterSave.current) return;
    syncAfterSave.current = false;
    setForm(initial);
  }, [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = <K extends keyof PendingChanges>(k: K, v: PendingChanges[K]) => setForm((f) => ({ ...f, [k]: v }));
  const Cat = CATEGORIES[form.category].icon;

  const save = async () => {
    const err = validate(form);
    if (err) {
      setError(err);
      return false;
    }
    setError('');
    syncAfterSave.current = true;
    const ok = await onSave({ ...form, name: form.name.trim(), priceAmount: form.isPaid ? form.priceAmount : null });
    if (!ok) syncAfterSave.current = false;
    return ok;
  };

  const run = async (kind: 'save' | 'approve') => {
    setBusy(kind);
    try {
      if (kind === 'save') await save();
      else if (!dirty || (await save())) await onApprove();
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="animate-slide-up overflow-hidden rounded-3xl bg-surface shadow-sm ring-1 ring-line" aria-label={`Başvuru: ${pending.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1 font-semibold text-ink-soft"><Cat size={13} /> {CATEGORIES[form.category].label}</span>
          <span className="flex items-center gap-1"><Clock3 size={12} /> {relTime(pending.submittedAt)}</span>
          {pending.username && <span className="font-semibold">@{pending.username}</span>}
          <span className="flex items-center gap-1 font-mono"><MapPin size={12} /> {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</span>
        </p>
        {dirty && <span className="rounded-full bg-brand/25 px-2.5 py-1 text-xs font-bold text-ink">Kaydedilmemiş değişiklik</span>}
      </div>

      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
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
              <select value={form.toiletType ?? ''} onChange={(e) => set('toiletType', (e.target.value || null) as ToiletType | null)} className={inputCls} aria-label="Tuvalet tipi">
                <option value="">Bilinmiyor</option>
                <option value="alafranga">Alafranga</option>
                <option value="alaturka">Alaturka</option>
                <option value="ikisi">İkisi de</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-soft">Erişim</span>
              <select value={form.publicAccess == null ? '' : form.publicAccess ? '1' : '0'} onChange={(e) => set('publicAccess', e.target.value === '' ? null : e.target.value === '1')} className={inputCls} aria-label="Erişim">
                <option value="">Belirtilmemiş</option>
                <option value="1">Şifresiz / herkese açık</option>
                <option value="0">Müşteriye şifreli</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-soft">Çalışma saatleri</span>
            <input value={form.hours ?? ''} onChange={(e) => set('hours', e.target.value || null)} maxLength={60} className={inputCls} aria-label="Çalışma saatleri" />
          </label>
          <div className="flex gap-4 text-sm font-semibold">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.accessible} onChange={(e) => set('accessible', e.target.checked)} className="h-4 w-4 accent-ink" /> Engelli erişimi</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.babyChanging} onChange={(e) => set('babyChanging', e.target.checked)} className="h-4 w-4 accent-ink" /> Bebek bakım</label>
          </div>
          <OutdoorPhoto src={pending.photo} alt={`${pending.name} dış mekan fotoğrafı`} className="h-56" />
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl bg-card p-3">
              <dt className="text-xs font-semibold text-ink-muted">Temizlik (başvuran)</dt>
              <dd className="mt-1"><StarRating value={pending.vote.cleanliness} size={14} /></dd>
            </div>
            <div className="rounded-2xl bg-card p-3">
              <dt className="text-xs font-semibold text-ink-muted">Konfor (başvuran)</dt>
              <dd className="mt-1"><StarRating value={pending.vote.comfort} size={14} /></dd>
            </div>
            {pending.vote.comment && <div className="col-span-2 rounded-2xl bg-card p-3 text-ink-soft">“{pending.vote.comment}”</div>}
          </dl>
        </div>

        <LocationEditor
          value={form}
          category={form.category}
          legacyDistrict={!pending.province ? pending.district : null}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        />
      </div>

      {error && <p role="alert" className="px-5 pb-3 text-sm font-semibold text-red-600">{error}</p>}

      <div className="grid grid-cols-3 border-t border-line">
        <button type="button" onClick={onReject} disabled={busy !== null} className="flex items-center justify-center gap-1.5 py-3.5 text-sm font-bold text-red-600 hover:bg-red-500/10 disabled:opacity-50">
          <X size={16} /> Reddet
        </button>
        <div className="flex border-x border-line">
          <button type="button" onClick={() => void run('save')} disabled={!dirty || busy !== null} className="flex flex-1 items-center justify-center gap-1.5 py-3.5 text-sm font-bold text-ink hover:bg-card disabled:text-ink-muted disabled:hover:bg-transparent">
            {busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Değişiklikleri Kaydet
          </button>
          {dirty && (
            <button type="button" onClick={() => { setForm(initial); setError(''); }} disabled={busy !== null} aria-label="Değişiklikleri geri al" title="Değişiklikleri geri al" className="px-3 text-ink-muted hover:bg-card hover:text-ink">
              <RotateCcw size={15} />
            </button>
          )}
        </div>
        <button type="button" onClick={() => void run('approve')} disabled={busy !== null} className="flex items-center justify-center gap-1.5 bg-brand py-3.5 text-sm font-extrabold text-onbrand hover:bg-brand-dark disabled:opacity-60">
          {busy === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {dirty ? 'Kaydet ve Onayla' : 'Onayla (Haritaya Ekle)'}
        </button>
      </div>
    </article>
  );
}
