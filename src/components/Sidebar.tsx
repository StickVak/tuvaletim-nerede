import { ListFilter, MapPin, Settings as SettingsIcon, Siren } from 'lucide-react';
import type { Filters, PlaceView } from '../types';
import ToiletListItem from './ToiletListItem';
import SearchBox from './SearchBox';
import AccountButton from './AccountButton';
import FilterPanel from './FilterPanel';

interface Props {
  places: PlaceView[];
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  query: string;
  onQueryChange: (q: string) => void;
  selectedId: string | null;
  hasLocation: boolean;
  onSelect: (id: string) => void;
  onEmergency: () => void;
  onRoute: (id: string) => void;
  onToggleFavorite: (place: PlaceView) => void;
  onRouteIds: Set<string>;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

export default function Sidebar({
  places, filters, onFiltersChange, query, onQueryChange, selectedId, hasLocation, onSelect, onEmergency, onRoute, onToggleFavorite, onRouteIds, onOpenProfile, onOpenSettings,
}: Props) {
  return (
    <aside className="absolute bottom-4 left-4 top-4 z-30 flex w-[400px] flex-col overflow-hidden rounded-[28px] bg-surface shadow-float ring-1 ring-line">
      <header className="flex items-center gap-2 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <AccountButton variant="sidebar" onOpenProfile={onOpenProfile} />
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Ayarlar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-card text-ink transition hover:bg-line/60"
        >
          <SettingsIcon size={19} />
        </button>
      </header>

      <div className="px-5">
        <button
          type="button"
          onClick={onEmergency}
          aria-label="Acil: en uygun tuvaleti bul"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 py-3 text-base font-bold text-white transition-colors hover:bg-red-600"
        >
          <Siren size={19} /> Acil
        </button>

        <div className="mt-4">
          <SearchBox value={query} onChange={onQueryChange} />
        </div>

        <div className="mt-3">
          <FilterPanel filters={filters} onChange={onFiltersChange} compact />
        </div>

        <p className="mt-4 flex items-center justify-between gap-2 pb-2 text-xs font-semibold text-ink-muted">
          <span>{places.length} mekan listeleniyor</span>
          <span className="flex items-center gap-1 font-medium">
            <MapPin size={12} className={hasLocation ? 'text-blue-600' : ''} /> {hasLocation ? 'Konumunuz belirlendi' : 'Konum bekleniyor'}
          </span>
        </p>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {places.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <ListFilter size={30} className="text-ink-muted/60" />
            <p className="mt-3 font-bold">Sonuç bulunamadı</p>
            <p className="mt-1 text-sm text-ink-muted">Aramayı veya filtreleri değiştirmeyi deneyin.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {places.map((p) => (
              <ToiletListItem key={p.id} place={p} active={p.id === selectedId} onSelect={onSelect} onRoute={onRoute} onToggleFavorite={onToggleFavorite} onRouteBadge={onRouteIds.has(p.id)} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
