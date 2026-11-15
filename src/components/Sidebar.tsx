import { ListFilter, MapPin, Navigation, Settings as SettingsIcon, Siren, Sparkles } from 'lucide-react';
import type { Filters, LatLng, PlaceView } from '../types';
import ToiletListItem from './ToiletListItem';
import SearchBox from './SearchBox';
import Logo from './Logo';
import { Toggle } from './FilterPanel';

interface Props {
  places: PlaceView[];
  user: LatLng;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  query: string;
  onQueryChange: (q: string) => void;
  selectedId: string | null;
  usingDemo: boolean;
  onSelect: (id: string) => void;
  onEmergency: () => void;
  onOpenSettings: () => void;
}

export default function Sidebar({
  places, user, filters, onFiltersChange, query, onQueryChange, selectedId, usingDemo, onSelect, onEmergency, onOpenSettings,
}: Props) {
  return (
    <aside className="absolute bottom-4 left-4 top-4 z-30 flex w-[400px] flex-col overflow-hidden rounded-[28px] bg-white shadow-float ring-1 ring-black/5">
      <header className="flex items-center gap-3 px-5 pb-3 pt-5">
        <Logo size={42} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold leading-tight">Tuvaletim Nerede?</h1>
          <p className="flex items-center gap-1 text-xs font-medium text-ink-muted">
            <MapPin size={12} className={usingDemo ? '' : 'text-blue-600'} /> {usingDemo ? 'Demo konumu' : 'Gerçek konumunuz'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Ayarlar"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink transition hover:bg-gray-100"
        >
          <SettingsIcon size={20} />
        </button>
      </header>

      <div className="px-5">
        <button
          type="button"
          onClick={onEmergency}
          aria-label="Acil: en uygun tuvaleti bul"
          className="sos-ring group flex w-full items-center gap-3 rounded-3xl bg-gradient-to-br from-red-500 to-red-600 px-4 py-3.5 text-left text-white transition hover:from-red-600 hover:to-red-700 active:scale-[.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20">
            <Siren size={24} />
          </span>
          <span className="flex-1">
            <span className="block text-xl font-extrabold tracking-wide">ACİL</span>
            <span className="block text-xs font-medium text-white/85">En yakın ücretsiz & temiz tuvalete git</span>
          </span>
        </button>

        <div className="mt-4">
          <SearchBox value={query} onChange={onQueryChange} />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="grid flex-1 grid-cols-2 gap-1 rounded-2xl bg-card p-1">
            {[
              { v: 'distance' as const, l: 'En yakın', i: Navigation },
              { v: 'cleanliness' as const, l: 'En temiz', i: Sparkles },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => onFiltersChange({ ...filters, sort: o.v })}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${
                  filters.sort === o.v ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <o.i size={14} /> {o.l}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl bg-card px-3 py-2 text-xs font-bold">
            Ücretsiz
            <Toggle on={filters.freeOnly} />
            <input
              type="checkbox"
              className="sr-only"
              checked={filters.freeOnly}
              onChange={(e) => onFiltersChange({ ...filters, freeOnly: e.target.checked })}
            />
          </label>
        </div>

        <p className="mt-4 pb-2 text-xs font-semibold text-ink-muted">{places.length} mekan listeleniyor</p>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {places.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <ListFilter size={30} className="text-gray-300" />
            <p className="mt-3 font-bold">Sonuç bulunamadı</p>
            <p className="mt-1 text-sm text-ink-muted">Aramayı veya filtreleri değiştirmeyi deneyin.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {places.map((p) => (
              <ToiletListItem key={p.id} place={p} user={user} active={p.id === selectedId} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
