import { useMemo, useState } from 'react';
import { ExternalLink, MapPinOff, Pencil, Search, Trash2 } from 'lucide-react';
import type { FeeType, Place, Review, ToiletCategory } from '../types';
import { deletePlace } from '../db/repo';
import { CATEGORIES, CATEGORY_ORDER, FEE_LABELS, placePhoto } from '../lib/categories';
import { formatScore, placeAverages } from '../lib/geo';
import { PriceBadge } from '../components/Badges';
import PlaceEditModal from './PlaceEditModal';
import { ConfirmDialog, EmptyState, PageHeader, selectCls } from './ui';

export default function PlacesPage({ places, reviews, onToast }: { places: Place[]; reviews: Review[]; onToast: (t: string) => void }) {
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState<ToiletCategory | ''>('');
  const [fee, setFee] = useState<FeeType | ''>('');
  const [source, setSource] = useState<'' | 'seed' | 'user'>('');
  const [editing, setEditing] = useState<Place | null>(null);
  const [deleting, setDeleting] = useState<Place | null>(null);

  const cities = useMemo(() => [...new Set(places.map((p) => p.city).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'tr')), [places]);
  const reviewCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reviews) m.set(r.placeId, (m.get(r.placeId) ?? 0) + 1);
    return m;
  }, [reviews]);

  const items = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return places
      .filter((p) => !city || p.city === city)
      .filter((p) => !category || p.category === category)
      .filter((p) => !fee || p.fee === fee)
      .filter((p) => !source || p.source === source)
      .filter((p) => !needle || [p.name, p.city, p.district, p.address].join(' ').toLocaleLowerCase('tr-TR').includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [places, q, city, category, fee, source]);

  return (
    <>
      <PageHeader title="Tüm Mekanlar" subtitle={`${items.length} / ${places.length} mekan gösteriliyor`} />

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-brand-dark">
          <Search size={16} className="text-ink-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, ilçe, adres ara" className="w-full bg-transparent text-sm outline-none" />
        </label>
        <select value={city} onChange={(e) => setCity(e.target.value)} className={selectCls} aria-label="Şehir">
          <option value="">Tüm şehirler</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value as ToiletCategory | '')} className={selectCls} aria-label="Tür">
          <option value="">Tüm türler</option>
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
        </select>
        <select value={fee} onChange={(e) => setFee(e.target.value as FeeType | '')} className={selectCls} aria-label="Ücret">
          <option value="">Tüm ücretler</option>
          {(Object.keys(FEE_LABELS) as FeeType[]).map((f) => <option key={f} value={f}>{FEE_LABELS[f]}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value as '' | 'seed' | 'user')} className={selectCls} aria-label="Kaynak">
          <option value="">Tüm kaynaklar</option>
          <option value="seed">Örnek veri</option>
          <option value="user">Topluluk</option>
        </select>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={MapPinOff} title="Mekan bulunamadı" text="Arama veya filtreleri değiştirin." />
      ) : (
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
          <ul className="divide-y divide-gray-100">
            {items.map((p) => {
              const avg = placeAverages(p);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-card/60">
                  <img src={placePhoto(p)} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-gray-200 object-cover" />
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{p.name}</span>
                      {p.source === 'user' && <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">Topluluk</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {CATEGORIES[p.category].label} · {[p.district, p.city].filter(Boolean).join(', ') || '—'}
                    </div>
                  </div>
                  <PriceBadge place={p} />
                  <div className="w-36 text-xs">
                    <div className="font-bold">
                      {p.ratingCount ? formatScore(avg.rating) : '–'} <span className="font-medium text-ink-muted">({p.ratingCount} oy)</span>
                    </div>
                    <div className="text-ink-muted">T {formatScore(avg.cleanliness)} · K {formatScore(avg.comfort)}</div>
                  </div>
                  <div className="flex gap-1">
                    <a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`} target="_blank" rel="noreferrer"
                      className="rounded-xl p-2.5 text-ink-soft hover:bg-card" aria-label="Haritada aç" title="Haritada aç">
                      <ExternalLink size={16} />
                    </a>
                    <button type="button" onClick={() => setEditing(p)} className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold hover:bg-card">
                      <Pencil size={15} /> Düzenle
                    </button>
                    <button type="button" onClick={() => setDeleting(p)} className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50">
                      <Trash2 size={15} /> Sil
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing && (
        <PlaceEditModal
          place={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            onToast('Mekan güncellendi.');
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Mekanı kalıcı olarak sil"
          text={
            <>
              <b>“{deleting.name}”</b> ve ona ait {reviewCount.get(deleting.id) ?? 0} puan/yorum kaydı veritabanından kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </>
          }
          confirmLabel="Kalıcı olarak sil"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await deletePlace(deleting.id);
            onToast(`“${deleting.name}” silindi.`);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
