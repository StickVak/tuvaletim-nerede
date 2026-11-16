import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { Check, Crosshair, ListFilter, MapPin, Settings as SettingsIcon, Siren, X } from 'lucide-react';
import type { EmergencyState, Filters, LatLng, PlaceDraft, PlaceView, ToastMessage } from './types';
import { api } from './api';
import { usePlaces } from './hooks/usePlaces';
import { useAuth } from './hooks/useAuth';
import { IZMIR_CENTER, pickEmergency, toView } from './lib/geo';
import { fetchWalkingRoute } from './lib/route';
import { STORAGE_ERROR_EVENT, usePersistentState } from './hooks/usePersistentState';
import { useGeolocation } from './hooks/useGeolocation';
import { useElementHeight } from './hooks/useElementHeight';
import { useMediaQuery } from './hooks/useMediaQuery';
import MapView, { type FlyCommand } from './components/MapView';
import BottomSheet, { PEEK_HEIGHT, snapHeights, type SheetSnap } from './components/BottomSheet';
import FloatingControls from './components/FloatingControls';
import ToiletListItem from './components/ToiletListItem';
import PlaceDetail from './components/PlaceDetail';
import EmergencyCard from './components/EmergencyCard';
import SettingsDrawer from './components/SettingsDrawer';
import AddToiletModal from './components/AddToiletModal';
import Sidebar from './components/Sidebar';
import SearchBox from './components/SearchBox';
import Toasts from './components/Toasts';
import Logo from './components/Logo';

const DEFAULT_FILTERS: Filters = { sort: 'distance', freeOnly: false };
/** Masaüstü: kenar panel (16 + 400 + 16) */
const SIDEBAR_SPACE = 432;
const DETAIL_WIDTH = 400;

function normalize(s: string) {
  return s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
}

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const rootHeight = useElementHeight(rootRef);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const mapRef = useRef<L.Map | null>(null);
  const onMapReady = useCallback((m: L.Map) => {
    mapRef.current = m;
  }, []);

  // ---------- Veriler (Express API) ----------
  const auth = useAuth();
  const { places, error: placesError, replace: replacePlace } = usePlaces(auth.user?.id ?? null);
  const loading = places === undefined;

  // ---------- Kalıcı tercihler ----------
  const [filters, setFilters] = usePersistentState<Filters>('tn.filters', DEFAULT_FILTERS);

  // ---------- UI durumu ----------
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draftLocation, setDraftLocation] = useState<LatLng | null>(null);
  const [emergency, setEmergency] = useState<EmergencyState | null>(null);
  const [fly, setFly] = useState<FlyCommand | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const emergencyReq = useRef(0);

  const toast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  useEffect(() => {
    const onErr = () => toast('Tarayıcı depolama alanı dolu.', 'error');
    window.addEventListener(STORAGE_ERROR_EVENT, onErr);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onErr);
  }, [toast]);

  // ---------- Konum ----------
  const gps = useGeolocation();
  const userLat = gps.position?.lat;
  const userLng = gps.position?.lng;
  const user = useMemo<LatLng | null>(() => (userLat != null && userLng != null ? { lat: userLat, lng: userLng } : null), [userLat, userLng]);

  // İlk GPS konumu gelince haritayı ona odakla
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!user || focusedRef.current) return;
    focusedRef.current = true;
    setFly({ key: Date.now(), center: user, zoom: 16, offset: desktop ? [SIDEBAR_SPACE / 2, 0] : [0, -PEEK_HEIGHT / 2] });
  }, [user, desktop]);

  useEffect(() => {
    if (placesError) toast(placesError, 'error');
  }, [placesError, toast]);

  // ---------- Görünüm modeli ----------
  const views: PlaceView[] = useMemo(() => (places ?? []).map((p) => toView(p, user)), [places, user]);

  const listed = useMemo(() => {
    const q = normalize(query.trim());
    let items = filters.freeOnly ? views.filter((t) => !t.stats.isPaid) : [...views];
    if (q) items = items.filter((t) => normalize([t.name, t.district, t.address].filter(Boolean).join(' ')).includes(q));
    const byName = (a: PlaceView, b: PlaceView) => a.name.localeCompare(b.name, 'tr');
    const byDistance = (a: PlaceView, b: PlaceView) => (a.distance !== null && b.distance !== null ? a.distance - b.distance : byName(a, b));
    items.sort((a, b) =>
      filters.sort === 'distance'
        ? byDistance(a, b)
        : b.stats.cleanliness - a.stats.cleanliness || b.stats.voteCount - a.stats.voteCount || byDistance(a, b),
    );
    return items;
  }, [views, filters, query]);

  const markers = useMemo(() => {
    const base = filters.freeOnly ? views.filter((t) => !t.stats.isPaid) : views;
    const ensure = [emergency?.placeId, selectedId].filter(Boolean) as string[];
    const missing = ensure.filter((id) => !base.some((t) => t.id === id));
    return missing.length ? [...base, ...views.filter((t) => missing.includes(t.id))] : base;
  }, [views, filters.freeOnly, emergency, selectedId]);

  const selected = selectedId ? views.find((t) => t.id === selectedId) ?? null : null;
  const emergencyPlace = emergency ? views.find((t) => t.id === emergency.placeId) ?? null : null;
  const H = rootHeight || window.innerHeight;
  const heights = snapHeights(H);

  // ---------- Eylemler ----------
  const selectPlace = useCallback(
    (id: string) => {
      const t = views.find((x) => x.id === id);
      if (!t) return;
      setSelectedId(id);
      if (!desktop) setSheetSnap('peek');
      setFly({
        key: Date.now(),
        center: t,
        zoom: 17,
        offset: desktop ? [(SIDEBAR_SPACE + DETAIL_WIDTH + 16) / 2, 0] : [0, -H * 0.38],
      });
    },
    [views, desktop, H],
  );

  const closeDetail = () => setSelectedId(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (addOpen && !picking) setAddOpen(false);
      else if (settingsOpen) setSettingsOpen(false);
      else setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addOpen, picking, settingsOpen]);

  const locateMe = () => {
    if (!user) {
      toast('Konumunuz henüz bilinmiyor.');
      return;
    }
    setFly({
      key: Date.now(),
      center: user,
      zoom: 16,
      offset: desktop ? [SIDEBAR_SPACE / 2, 0] : [0, -(heights[sheetSnap === 'full' ? 'half' : sheetSnap] / 2) + 30],
    });
  };

  const zoom = (d: 1 | -1) => (d > 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut());

  const startEmergency = async () => {
    if (!user) {
      toast('Önce haritada konumunuzu işaretleyin.', 'error');
      return;
    }
    const target = pickEmergency(views);
    if (!target) {
      toast('Kayıtlı tuvalet bulunamadı.', 'error');
      return;
    }
    const req = Date.now();
    emergencyReq.current = req;
    setSelectedId(null);
    setSheetSnap('peek');
    setEmergency({ placeId: target.id, route: [user, target], approximate: true });
    const padding = desktop
      ? { top: 70, right: 90, bottom: 70, left: SIDEBAR_SPACE + 460 }
      : { top: 290, right: 72, bottom: PEEK_HEIGHT + 50, left: 48 };
    setFly({ key: req, bounds: [user, target], padding });

    const r = await fetchWalkingRoute(user, target);
    if (emergencyReq.current !== req) return;
    setEmergency({ placeId: target.id, route: r.points, approximate: r.approximate, routeDistance: r.distance });
    if (!r.approximate) setFly({ key: Date.now(), bounds: r.points, padding });
  };

  const closeEmergency = () => {
    emergencyReq.current = 0;
    setEmergency(null);
  };

  const openAdd = () => {
    closeEmergency();
    setSelectedId(null);
    setDraftLocation(null);
    setAddOpen(true);
  };

  const closeAdd = () => {
    setAddOpen(false);
    setPicking(false);
    setDraftLocation(null);
    setSheetSnap('peek');
  };

  const handleMapClick = (p: LatLng) => {
    if (picking) {
      setDraftLocation(p);
      return;
    }
    if (desktop && selectedId) setSelectedId(null);
    if (sheetSnap === 'full' || sheetSnap === 'half') setSheetSnap('peek');
  };

  const submitDraft = async (draft: PlaceDraft) => {
    try {
      await api('/pending', { method: 'POST', body: draft });
      closeAdd();
      toast('Teşekkürler! Mekanınız incelendikten sonra haritada yayınlanacak.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  // ---------- Ortak parçalar ----------
  const emptyState = (
    <div className="flex flex-col items-center px-8 py-10 text-center">
      <ListFilter size={30} className="text-gray-300" />
      <p className="mt-3 font-bold">{loading ? 'Veriler yükleniyor…' : 'Sonuç bulunamadı'}</p>
      {!loading && (
        <button
          type="button"
          onClick={() => {
            setFilters(DEFAULT_FILTERS);
            setQuery('');
          }}
          className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-bold"
        >
          Filtreleri temizle
        </button>
      )}
    </div>
  );

  const sortLabel = filters.sort === 'distance' ? 'En yakın' : 'En temiz';

  return (
    <div ref={rootRef} className="relative h-[100dvh] w-full overflow-hidden bg-white">
      <MapView
        initialCenter={IZMIR_CENTER}
        places={markers}
        user={user}
        selectedId={selectedId}
        emergencyId={emergency?.placeId ?? null}
        route={emergency?.route ?? null}
        picking={picking}
        pickedLocation={addOpen ? draftLocation : null}
        fly={fly}
        onSelect={selectPlace}
        onMapClick={handleMapClick}
        onReady={onMapReady}
      />

      {/* ---------------- MASAÜSTÜ ---------------- */}
      {desktop && !picking && (
        <Sidebar
          places={listed}
          user={user}
          filters={filters}
          onFiltersChange={setFilters}
          query={query}
          onQueryChange={setQuery}
          selectedId={selectedId}
          hasLocation={Boolean(user)}
          onSelect={selectPlace}
          onEmergency={startEmergency}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {/* ---------------- MOBİL ---------------- */}
      {!desktop && !picking && !emergency && !selected && (
        <div className="absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Ayarlar"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-float transition active:scale-95"
          >
            <SettingsIcon size={21} />
          </button>
          <div className="flex h-12 min-w-0 items-center gap-2 rounded-full bg-white/95 pl-1.5 pr-4 shadow-float backdrop-blur">
            <Logo size={36} />
            <span className="truncate text-[15px] font-extrabold tracking-tight">Tuvaletim Nerede?</span>
          </div>
        </div>
      )}

      {!picking && (
        <FloatingControls
          desktop={desktop}
          filters={filters}
          onFiltersChange={setFilters}
          onLocate={locateMe}
          onAdd={openAdd}
          onZoom={zoom}
          bottom={(sheetSnap === 'full' ? heights.half : heights[sheetSnap]) + 16}
          hidden={!desktop && (sheetSnap === 'full' || Boolean(emergency) || Boolean(selected))}
        />
      )}

      {!desktop && (
        <BottomSheet
          snap={picking ? 'hidden' : sheetSnap}
          onSnapChange={setSheetSnap}
          containerHeight={H}
          header={
            <div className="flex items-end justify-between px-5 pb-3 pt-1">
              <div>
                <h2 className="text-lg font-extrabold leading-tight">Yakındaki Tuvaletler</h2>
                <p className="mt-0.5 text-xs font-medium text-ink-muted">
                  {listed.length} sonuç · {sortLabel}
                  {filters.freeOnly && ' · Sadece ücretsiz'}
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-ink-soft">
                <MapPin size={12} className={user ? 'text-blue-600' : 'text-ink-muted'} /> {user ? 'Konumunuz' : 'Konum yok'}
              </span>
            </div>
          }
          tab={
            <button
              type="button"
              onClick={startEmergency}
              aria-label="Acil: en uygun tuvaleti bul"
              className="sos-ring flex h-12 items-center gap-2 rounded-full bg-gradient-to-br from-red-500 to-red-600 pl-3.5 pr-5 text-base font-extrabold tracking-wide text-white ring-4 ring-white transition hover:from-red-600 hover:to-red-700 active:scale-95"
            >
              <Siren size={20} /> ACİL
            </button>
          }
        >
          <div className="px-4 pb-3">
            <SearchBox value={query} onChange={setQuery} />
          </div>
          {listed.length === 0 ? (
            emptyState
          ) : (
            <ul className="space-y-2.5 px-4 pb-6">
              {listed.map((t) => (
                <ToiletListItem key={t.id} place={t} user={user} active={t.id === selectedId} onSelect={selectPlace} />
              ))}
            </ul>
          )}
        </BottomSheet>
      )}

      {/* Konum seçme modu */}
      {picking && (
        <div
          className={`absolute z-40 animate-slide-down rounded-3xl bg-ink p-4 text-white shadow-float ${
            desktop ? 'left-1/2 top-4 w-[440px] -translate-x-1/2' : 'inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))]'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-ink">
              <Crosshair size={20} />
            </span>
            <div className="flex-1">
              <p className="font-bold">Konumu seçin</p>
              <p className="text-xs text-white/70">
                {draftLocation ? 'İsterseniz başka bir noktaya dokunarak değiştirin.' : 'Tuvaletin bulunduğu noktaya haritada dokunun.'}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPicking(false)} className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 text-sm font-bold">
              <X size={15} /> Geri
            </button>
            <button
              type="button"
              disabled={!draftLocation}
              onClick={() => setPicking(false)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-bold text-ink disabled:opacity-40"
            >
              <Check size={15} /> Bu konumu kullan
            </button>
          </div>
        </div>
      )}

      {emergency && emergencyPlace && !picking && (
        <EmergencyCard
          place={emergencyPlace}
          emergency={emergency}
          user={user}
          desktop={desktop}
          onClose={closeEmergency}
          onDetails={() => {
            const id = emergencyPlace.id;
            closeEmergency();
            selectPlace(id);
          }}
        />
      )}

      {selected && !picking && !addOpen && (
        <PlaceDetail key={selected.id} place={selected} user={user} desktop={desktop} onClose={closeDetail} onVoted={replacePlace} onToast={toast} />
      )}

      <Toasts toasts={toasts} desktop={desktop} />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        placeCount={places?.length ?? 0}
        myVoteCount={places?.filter((p) => p.myVote).length ?? 0}
      />

      {addOpen && (
        <AddToiletModal
          visible={!picking}
          desktop={desktop}
          location={draftLocation}
          onRequestPick={() => setPicking(true)}
          onUseMyLocation={() => (user ? setDraftLocation({ ...user }) : toast('Konumunuz henüz bilinmiyor; haritadan seçin.'))}
          onClose={closeAdd}
          onSubmit={submitDraft}
        />
      )}
    </div>
  );
}
