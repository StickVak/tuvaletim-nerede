import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { Check, Crosshair, ListFilter, MapPin, Settings as SettingsIcon, Siren, X } from 'lucide-react';
import type { Filters, LatLng, Place, PlaceDraft, PlaceView, ReportType, RouteState, ToastMessage } from './types';
import { api } from './api';
import { usePlaces } from './hooks/usePlaces';
import { useAuth } from './hooks/useAuth';
import { distanceMeters, IZMIR_CENTER, pickEmergency, toView } from './lib/geo';
import { applyFilters, SORT_LABELS, sortPlaces } from './lib/filters';
import { placesOnRoute } from './lib/corridor';
import { fetchWalkingRoute, WALK_SPEED_MPS } from './lib/route';
import { STORAGE_ERROR_EVENT, usePersistentState } from './hooks/usePersistentState';
import { useGeolocation } from './hooks/useGeolocation';
import { useElementHeight } from './hooks/useElementHeight';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useTheme } from './hooks/useTheme';
import MapView, { type FlyCommand } from './components/MapView';
import BottomSheet, { PEEK_HEIGHT, snapHeights, type SheetSnap } from './components/BottomSheet';
import FloatingControls from './components/FloatingControls';
import ToiletListItem from './components/ToiletListItem';
import PlaceDetail from './components/PlaceDetail';
import EmergencyCard from './components/EmergencyCard';
import RouteCard from './components/RouteCard';
import ArrivalModal from './components/ArrivalModal';
import SettingsDrawer from './components/SettingsDrawer';
import AddToiletModal from './components/AddToiletModal';
import Sidebar from './components/Sidebar';
import SearchBox from './components/SearchBox';
import Toasts from './components/Toasts';
import LocationBanner from './components/LocationBanner';
import AuthModal from './components/AuthModal';
import AccountButton from './components/AccountButton';
import ProfileModal from './components/ProfileModal';
import UserProfileModal from './components/UserProfileModal';

const DEFAULT_FILTERS: Filters = { sort: 'distance', chips: [] };
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
  const [theme, setTheme] = useTheme();
  const { places, error: placesError, replace: replacePlace } = usePlaces(auth.user?.id ?? null);
  const loading = places === undefined;

  // ---------- Kalıcı tercihler ----------
  const [filters, setFilters] = usePersistentState<Filters>('tn.filters.v2', DEFAULT_FILTERS);

  // ---------- UI durumu ----------
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewUserId, setViewUserId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [draftLocation, setDraftLocation] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<RouteState | null>(null);
  const [fly, setFly] = useState<FlyCommand | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const routeReq = useRef(0);

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
  // GPS yoksa kullanıcının haritada elle işaretlediği konum (yalnızca bu oturum)
  const [manualLocation, setManualLocation] = useState<LatLng | null>(null);
  const [remarking, setRemarking] = useState(false);
  const located = gps.position ?? manualLocation;
  const userLat = located?.lat;
  const userLng = located?.lng;
  const user = useMemo<LatLng | null>(() => (userLat != null && userLng != null ? { lat: userLat, lng: userLng } : null), [userLat, userLng]);

  const gpsUnavailable = !gps.position && (gps.status === 'denied' || gps.status === 'unsupported');
  const markingLocation = remarking || (gpsUnavailable && !manualLocation);

  // İlk GPS konumu gelince haritayı ona odakla
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!gps.position || focusedRef.current) return;
    focusedRef.current = true;
    setFly({ key: Date.now(), center: gps.position, zoom: 16, offset: desktop ? [SIDEBAR_SPACE / 2, 0] : [0, -PEEK_HEIGHT / 2] });
  }, [gps.position, desktop]);

  useEffect(() => {
    if (placesError) toast(placesError, 'error');
  }, [placesError, toast]);

  // ---------- Görünüm modeli ----------
  const views: PlaceView[] = useMemo(() => (places ?? []).map((p) => toView(p, user)), [places, user]);

  // Aktif rotaya 150 m yakın diğer tuvaletler ("Rota Üzerinde 📍")
  const [routeOnly, setRouteOnly] = useState(false);
  const onRouteIds = useMemo(
    () => (route && !route.loading ? placesOnRoute(views, route.points, route.placeId) : new Set<string>()),
    [views, route],
  );
  const routeFilter = (items: PlaceView[]) =>
    route && routeOnly ? items.filter((p) => onRouteIds.has(p.id) || p.id === route.placeId) : items;

  const listed = useMemo(() => {
    const q = normalize(query.trim());
    let items = routeFilter(applyFilters(views, filters.chips));
    if (q) items = items.filter((t) => normalize([t.name, t.district, t.address].filter(Boolean).join(' ')).includes(q));
    return sortPlaces(items, filters.sort);
  }, [views, filters, query, route, routeOnly, onRouteIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const markers = useMemo(() => {
    const base = routeFilter(applyFilters(views, filters.chips));
    const ensure = [route?.placeId, selectedId].filter(Boolean) as string[];
    const missing = ensure.filter((id) => !base.some((t) => t.id === id));
    return missing.length ? [...base, ...views.filter((t) => missing.includes(t.id))] : base;
  }, [views, filters.chips, route, selectedId, routeOnly, onRouteIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = selectedId ? views.find((t) => t.id === selectedId) ?? null : null;
  const routePlace = route ? views.find((t) => t.id === route.placeId) ?? null : null;

  // Varış ve değerlendirme: GPS hedefe 20 m girince (rota başına bir kez) ya da Rotayı Bitir
  const [arrivalId, setArrivalId] = useState<string | null>(null);
  const arrivedFor = useRef(0);
  useEffect(() => {
    if (!route || route.loading || !gps.position || !routePlace || arrivedFor.current === routeReq.current) return;
    if (distanceMeters(gps.position, routePlace) <= 20) {
      arrivedFor.current = routeReq.current;
      setArrivalId(route.placeId);
    }
  }, [route, routePlace, gps.position]);
  const arrivalPlace = arrivalId ? views.find((t) => t.id === arrivalId) ?? null : null;
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
    if (!gps.position) {
      // GPS yok: izni yeniden dene ve konumu haritada yeniden işaretlet
      gps.retry();
      if (manualLocation) setRemarking(true);
    }
    if (!user) return;
    setFly({
      key: Date.now(),
      center: user,
      zoom: 16,
      offset: desktop ? [SIDEBAR_SPACE / 2, 0] : [0, -(heights[sheetSnap === 'full' ? 'half' : sheetSnap] / 2) + 30],
    });
  };

  const zoom = (d: 1 | -1) => (d > 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut());

  /** Konum yok ya da hâlâ bekleniyor: elle işaretleme modunu aç */
  const promptLocation = () => {
    setRemarking(true);
    toast('Önce haritada konumunuzu işaretleyin.', 'error');
  };

  /** Kullanıcının konumundan hedefe uygulama içi yaya rotası (OSRM; yanıt yoksa kuş uçuşu) */
  const startRoute = async (target: PlaceView, mode: RouteState['mode']) => {
    if (!user) return promptLocation();
    const req = Date.now();
    routeReq.current = req;
    setRouteOnly(false);
    setSelectedId(null);
    setSheetSnap('peek');
    const straight = target.distance ?? 0;
    setRoute({ placeId: target.id, mode, points: [user, target], approximate: true, distance: straight, duration: Math.round(straight / WALK_SPEED_MPS), loading: true });
    const padding = desktop
      ? { top: 70, right: 90, bottom: 70, left: SIDEBAR_SPACE + 460 }
      : { top: mode === 'emergency' ? 290 : 200, right: 72, bottom: PEEK_HEIGHT + 50, left: 48 };
    setFly({ key: req, bounds: [user, target], padding });

    const r = await fetchWalkingRoute(user, target);
    if (routeReq.current !== req) return;
    setRoute((cur) => (cur ? { ...cur, ...r, loading: false } : cur));
    if (!r.approximate) setFly({ key: Date.now(), bounds: r.points, padding });
  };

  const startEmergency = () => {
    if (!user) return promptLocation();
    const target = pickEmergency(views);
    if (!target) {
      toast('Kayıtlı tuvalet bulunamadı.', 'error');
      return;
    }
    void startRoute(target, 'emergency');
  };

  const navigateTo = (id: string) => {
    const target = views.find((p) => p.id === id);
    if (target) void startRoute(target, 'navigate');
  };

  /** Favori: iyimser güncelleme, hata olursa geri alınır */
  const toggleFavorite = async (p: Place) => {
    if (!auth.requireAuth()) return;
    replacePlace({ ...p, isFavorite: !p.isFavorite });
    try {
      await api(`/favorites/${p.id}`, { method: p.isFavorite ? 'DELETE' : 'PUT' });
    } catch (e) {
      replacePlace(p);
      toast((e as Error).message, 'error');
    }
  };

  const reportStatus = async (id: string, type: ReportType) => {
    if (!auth.requireAuth()) return;
    try {
      const updated = await api<Place>(`/places/${id}/reports`, { method: 'POST', body: { type } });
      replacePlace(updated);
      toast(
        type === 'closed' && updated.status.closed
          ? 'Teşekkürler! Mekan geçici olarak kapalı işaretlendi.'
          : type === 'open'
            ? 'Teşekkürler! Mekanın açık olduğu bildirildi.'
            : 'Bildiriminiz alındı, teşekkürler!',
        'success',
      );
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  /** Profil pencerelerinden bir mekana geçiş */
  const openPlaceFromProfile = (id: string) => {
    setProfileOpen(false);
    setViewUserId(null);
    selectPlace(id);
  };

  const closeRoute = () => {
    routeReq.current = 0;
    setRoute(null);
    setRouteOnly(false);
  };

  const openAdd = () => {
    if (!auth.requireAuth()) return;
    closeRoute();
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
    if (markingLocation) {
      setManualLocation(p);
      setRemarking(false);
      toast('Konumunuz işaretlendi.', 'success');
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
      <ListFilter size={30} className="text-ink-muted/60" />
      <p className="mt-3 font-bold">{loading ? 'Veriler yükleniyor…' : 'Sonuç bulunamadı'}</p>
      {!loading && (
        <button
          type="button"
          onClick={() => {
            setFilters(DEFAULT_FILTERS);
            setQuery('');
          }}
          className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-bold text-onbrand"
        >
          Filtreleri temizle
        </button>
      )}
    </div>
  );

  const sortLabel = SORT_LABELS[filters.sort];

  return (
    <div ref={rootRef} className="relative h-[100dvh] w-full overflow-hidden bg-surface text-ink">
      <MapView
        initialCenter={IZMIR_CENTER}
        places={markers}
        user={user}
        selectedId={selectedId}
        routeTargetId={route?.placeId ?? null}
        routeMode={route?.mode ?? null}
        route={route?.points ?? null}
        routeApproximate={route?.approximate ?? false}
        onRouteIds={onRouteIds}
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
          filters={filters}
          onFiltersChange={setFilters}
          query={query}
          onQueryChange={setQuery}
          selectedId={selectedId}
          hasLocation={Boolean(user)}
          onSelect={selectPlace}
          onEmergency={startEmergency}
          onRoute={navigateTo}
          onToggleFavorite={toggleFavorite}
          onRouteIds={onRouteIds}
          onOpenProfile={() => setProfileOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {/* ---------------- MOBİL ---------------- */}
      {!desktop && !picking && !route && !selected && (
        // Boş orta alan haritaya dokunmayı engellemesin: yalnızca butonlar tıklanabilir
        <div className="pointer-events-none absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex items-center gap-2.5 [&>*]:pointer-events-auto">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Ayarlar"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-float transition active:scale-95"
          >
            <SettingsIcon size={21} />
          </button>
          <div className="ml-auto">
            <AccountButton variant="bar" onOpenProfile={() => setProfileOpen(true)} />
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
          hidden={!desktop && (sheetSnap === 'full' || Boolean(route) || Boolean(selected))}
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
                  {filters.chips.length > 0 && ` · ${filters.chips.length} filtre`}
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
              className="flex h-11 items-center gap-2 rounded-full bg-red-500 px-4 text-sm font-bold text-white transition-colors hover:bg-red-600"
            >
              <Siren size={18} /> Acil
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
                <ToiletListItem key={t.id} place={t} active={t.id === selectedId} onSelect={selectPlace} onRoute={navigateTo} onToggleFavorite={toggleFavorite} onRouteBadge={onRouteIds.has(t.id)} />
              ))}
            </ul>
          )}
        </BottomSheet>
      )}

      {/* Konum seçme modu */}
      {picking && (
        <div
          className={`absolute z-40 animate-slide-down rounded-3xl bg-night p-4 text-white shadow-float ${
            desktop ? 'left-1/2 top-4 w-[440px] -translate-x-1/2' : 'inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))]'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-onbrand">
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
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-bold text-onbrand disabled:opacity-40"
            >
              <Check size={15} /> Bu konumu kullan
            </button>
          </div>
        </div>
      )}

      {route && routePlace && !picking && route.mode === 'emergency' && (
        <EmergencyCard
          place={routePlace}
          route={route}
          desktop={desktop}
          onClose={closeRoute}
          onGo={() => setRoute((r) => (r ? { ...r, mode: 'navigate' } : r))}
          onDetails={() => {
            const id = routePlace.id;
            closeRoute();
            selectPlace(id);
          }}
        />
      )}

      {route && routePlace && !picking && route.mode === 'navigate' && (
        <RouteCard
          place={routePlace}
          route={route}
          desktop={desktop}
          onRouteCount={onRouteIds.size}
          routeOnly={routeOnly}
          onToggleRouteOnly={setRouteOnly}
          onFinish={() => setArrivalId(route.placeId)}
        />
      )}

      {selected && !picking && !addOpen && (
        <PlaceDetail key={selected.id} place={selected} desktop={desktop} onClose={closeDetail} onVoted={replacePlace} onRoute={navigateTo} onToggleFavorite={toggleFavorite} onReport={reportStatus} onOpenUser={setViewUserId} onToast={toast} />
      )}

      {markingLocation && !picking && !addOpen && !route && (
        <LocationBanner
          desktop={desktop}
          title={manualLocation ? 'Konumunuzu yeniden işaretleyin' : gpsUnavailable ? 'Konumunuza erişemedik.' : 'Konumunuz henüz alınamadı.'}
          onRetry={gps.retry}
          onCancel={remarking ? () => setRemarking(false) : undefined}
        />
      )}

      <Toasts toasts={toasts} desktop={desktop} />

      {arrivalPlace && (
        <ArrivalModal
          place={arrivalPlace}
          onSkip={() => {
            setArrivalId(null);
            closeRoute();
          }}
          onDone={(updated, contributions) => {
            replacePlace(updated);
            setArrivalId(null);
            closeRoute();
            toast(`Katkın için teşekkürler! 💧 Toplam katkın: ${contributions}`, 'success');
          }}
          onError={(msg) => toast(msg, 'error')}
        />
      )}

      <AuthModal onWelcome={(name) => toast(`Hoş geldin, ${name}!`, 'success')} />

      {profileOpen && auth.user && (
        <ProfileModal onClose={() => setProfileOpen(false)} onOpenPlace={openPlaceFromProfile} onOpenPublic={setViewUserId} onToast={toast} />
      )}
      {viewUserId !== null && <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} onOpenPlace={openPlaceFromProfile} />}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        placeCount={places?.length ?? 0}
        myVoteCount={places?.filter((p) => p.myVote).length ?? 0}
        theme={theme}
        onThemeChange={setTheme}
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
