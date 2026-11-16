import { useMemo, useState } from 'react';
import { ExternalLink, MapPinOff, Pencil, Search, Trash2 } from 'lucide-react';
import type { Place, ToiletCategory } from '../types';
import type { AdminVote } from './types';
import { api } from '../api';
import { CATEGORIES, CATEGORY_ORDER, placePhoto } from '../lib/categories';
import { formatScore } from '../lib/geo';
import { PriceBadge } from '../components/Badges';
import PlaceEditModal from './PlaceEditModal';
import { ConfirmDialog, EmptyState, PageHeader, selectCls } from './ui';

type Act = (fn: () => Promise<unknown>, success: string) => Promise<boolean>;

export default function PlacesPage({ places, votes, act }: { places: Place[]; votes: AdminVote[]; act: Act }) {
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [category, setCategory] = useState<ToiletCategory | ''>('');
  const [fee, setFee] = useState<'' | 'paid' | 'free'>('');
  const [source, setSource] = useState<'' | 'seed' | 'user'>('');
  const [editing, setEditing] = useState<Place | null>(null);
  const [deleting, setDeleting] = useState<Place | null>(null);

  const districts = useMemo(() => [...new Set(places.map((p) => p.district).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'tr')), [places]);
  const reviewCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of votes) m.set(v.placeId, (m.get(v.placeId) ?? 0) + 1);
    return m;
  }, [votes]);

  const items = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return places
      .filter((p) => !district || p.district === district)
      .filter((p) => !category || p.category === category)
      .filter((p) => !fee || p.stats.isPaid === (fee === 'paid'))
      .filter((p) => !source || p.source === source)
      .filter((p) => !needle || [p.name, p.district, p.address].join(' ').toLocaleLowerCase('tr-TR').includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [places, q, district, category, fee, source]);

  return (
    <>
      <PageHeader title="Tüm Mekanlar" subtitle={`${items.length} / ${places.length} mekan gösteriliyor`} />

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl bg-surface px-3.5 py-2.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-brand-dark">
          <Search size={16} className="text-ink-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, ilçe, adres ara" className="w-full bg-transparent text-sm outline-none" />
        </label>
        <select value={district} onChange={(e) => setDistrict(e.target.value)} className={selectCls} aria-label="İlçe">
          <option value="">Tüm ilçeler</option>
          {districts.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value as ToiletCategory | '')} className={selectCls} aria-label="Tür">
          <option value="">Tüm türler</option>
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
        </select>
        <select value={fee} onChange={(e) => setFee(e.target.value as '' | 'paid' | 'free')} className={selectCls} aria-label="Ücret">
          <option value="">Tüm ücretler</option>
          <option value="paid">Ücretli</option>
          <option value="free">Ücretsiz</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value as '' | 'seed' | 'user')} className={selectCls} aria-label="Kaynak">
          <option value="">Tüm kaynaklar</option>
          <option value="seed">Başlangıç (OSM)</option>
          <option value="user">Topluluk</option>
        </select>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={MapPinOff} title="Mekan bulunamadı" text="Arama veya filtreleri değiştirin." />
      ) : (
        <div className="overflow-hidden rounded-3xl bg-surface shadow-sm ring-1 ring-line">
          <ul className="divide-y divide-line">
            {items.map((p) => {
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-card/60">
                  <img src={placePhoto(p)} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-card object-cover" />
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{p.name}</span>
                      {p.source === 'user' && <span className="rounded-md bg-[#1A1A1A] px-1.5 py-0.5 text-[10px] font-bold text-white">Topluluk</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {CATEGORIES[p.category].label} · {p.district || '—'}
                    </div>
                  </div>
                  <PriceBadge stats={p.stats} />
                  <div className="w-36 text-xs">
                    <div className="font-bold">
                      {p.stats.voteCount ? formatScore(p.stats.rating) : '–'} <span className="font-medium text-ink-muted">({p.stats.voteCount} oy)</span>
                    </div>
                    <div className="text-ink-muted">{p.stats.voteCount ? `T ${formatScore(p.stats.cleanliness)} · K ${formatScore(p.stats.comfort)}` : 'Henüz puanlanmadı'}</div>
                  </div>
                  <div className="flex gap-1">
                    <a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`} target="_blank" rel="noreferrer"
                      className="rounded-xl p-2.5 text-ink-soft hover:bg-card" aria-label="Haritada aç" title="Haritada aç">
                      <ExternalLink size={16} />
                    </a>
                    <button type="button" onClick={() => setEditing(p)} className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold hover:bg-card">
                      <Pencil size={15} /> Düzenle
                    </button>
                    <button type="button" onClick={() => setDeleting(p)} className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-500/10">
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
          onSave={(changes) => act(() => api(`/admin/places/${editing.id}`, { method: 'PATCH', body: changes }), 'Mekan güncellendi.').then((ok) => ok && setEditing(null))}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Mekanı kalıcı olarak sil"
          text={
            <>
              <b>“{deleting.name}”</b> ve ona ait {reviewCount.get(deleting.id) ?? 0} oy kaydı veritabanından kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </>
          }
          confirmLabel="Kalıcı olarak sil"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const { id, name } = deleting;
            setDeleting(null);
            void act(() => api(`/admin/places/${id}`, { method: 'DELETE' }), `“${name}” silindi.`);
          }}
        />
      )}
    </>
  );
}
