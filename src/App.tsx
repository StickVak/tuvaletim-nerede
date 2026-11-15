import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crosshair, ListFilter, MapPin, Settings as SettingsIcon, Siren, X } from 'lucide-react';
import type { EmergencyState, Filters, LatLng, Settings, ToastMessage, Toilet, ToiletWithDistance } from './types';
import { DEMO_LOCATION, SEED_TOILETS } from './data/seed';
import { avgRating, distanceMeters, pickEmergency } from './lib/geo';
import { fetchWalkingRoute } from './lib/route';
import { STORAGE_ERROR_EVENT, usePersistentState } from './hooks/usePersistentState';
import { useGeolocation } from './hooks/useGeolocation';
import { useElementHeight } from './hooks/useElementHeight';
import MapView, { type FlyCommand } from './components/MapView';
import BottomSheet, { PEEK_HEIGHT, snapHeights, type SheetSnap } from './components/BottomSheet';
import FloatingControls from './components/FloatingControls';
import ToiletListItem from './components/ToiletListItem';
import ToiletDetail from './components/ToiletDetail';
import EmergencyCard from './components/EmergencyCard';
import SettingsDrawer from './components/SettingsDrawer';
import AddToiletModal from './components/AddToiletModal';
import Toasts from './components/Toasts';
import Logo from './components/Logo';

const DEFAULT_SETTINGS: Settings = { mapStyle: 'voyager', forceDemoLocation: false };
const DEFAULT_FILTERS: Filters = { sort: 'distance', freeOnly: false };
/** GPS konumu örnek verilere bu mesafeden uzaksa demo konumuna düşülür */
const FAR_THRESHOLD_M = 30000;

export default function App() {
  const frameRef = useRef<HTMLDivElement>(null);
  const frameHeight = useElementHeight(frameRef);

  // ---------- Kalıcı veriler ----------
  const [approved, setApproved] = usePersistentState<Toilet[]>('tn.toilets.approved', []);
  const [pending, setPending] = usePersistentState<Toilet[]>('tn.toilets.pending', []);
  const [settings, setSettings] = usePersistentState<Settings>('tn.settings', DEFAULT_SETTINGS);
  const [filters, setFilters] = usePersistentState<Filters>('tn.filters', DEFAULT_FILTERS);

  // ---------- UI durumu ----------
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
    const onErr = () => toast('Depolama alanı dolu. Daha küçük bir fotoğraf deneyin.', 'error');
    window.addEventListener(STORAGE_ERROR_EVENT, onErr);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onErr);
  }, [toast]);

  // ---------- Konum ----------
  const gps = useGeolocation();
  const allToilets = useMemo(() => [...SEED_TOILETS, ...approved], [approved]);

  const gpsFar = useMemo(() => {
    if (!gps.position) return false;
    return Math.min(...allToilets.map((t) => distanceMeters(gps.position!, t))) > FAR_THRESHOLD_M;
  }, [gps.position, allToilets]);

  const usingDemo = settings.forceDemoLocation || !gps.position || gpsFar;
  const user: LatLng = usingDemo ? DEMO_LOCATION : gps.position!;
  const locationLabel = usingDemo ? 'Demo (Kadıköy)' : 'Gerçek GPS';

  // Konum kaynağı netleşince bir kez bilgi ver / haritayı odakla
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current || settings.forceDemoLocation) return;
    if (gps.status === 'pending') return;
    notifiedRef.current = true;
    if (gps.status === 'granted' && !gpsFar) {
      setFly({ key: Date.now(), center: gps.position!, zoom: 16 });
    } else if (gps.status === 'granted' && gpsFar) {
      toast('Örnek tuvaletler Kadıköy’de. Test için demo konumu kullanılıyor.');
    } else {
      toast('Konum izni alınamadı, demo konumu (Kadıköy) kullanılıyor.');
    }
  }, [gps.status, gps.position, gpsFar, settings.forceDemoLocation, toast]);

  // ---------- Mesafe, filtre, sıralama ----------
  const withDistance: ToiletWithDistance[] = useMemo(
    () => allToilets.map((t) => ({ ...t, distance: distanceMeters(user, t) })),
    [allToilets, user.lat, user.lng], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const listed = useMemo(() => {
    const items = filters.freeOnly ? withDistance.filter((t) => t.isFree) : [...withDistance];
    items.sort((a, b) =>
      filters.sort === 'distance'
        ? a.distance - b.distance
        : b.cleanliness - a.cleanliness || avgRating(b) - avgRating(a) || a.distance - b.distance,
    );
    return items;
  }, [withDistance, filters]);

  const markers = useMemo(() => {
    if (!emergency || listed.some((t) => t.id === emergency.toiletId)) return listed;
    const extra = withDistance.find((t) => t.id === emergency.toiletId);
    return extra ? [...listed, extra] : listed;
  }, [listed, withDistance, emergency]);

  const selected = selectedId ? withDistance.find((t) => t.id === selectedId) ?? null : null;
  const emergencyToilet = emergency ? withDistance.find((t) => t.id === emergency.toiletId) ?? null : null;
  const heights = snapHeights(frameHeight || 800);

  // ---------- Eylemler ----------
  const selectToilet = useCallback(
    (id: string) => {
      const t = withDistance.find((x) => x.id === id);
      if (!t) return;
      setSelectedId(id);
      setSheetSnap('half');
      setFly({ key: Date.now(), center: t, zoom: 17, offsetY: heights.half / 2 - 20 });
    },
    [withDistance, heights.half],
  );

  const locateMe = () => {
    setFly({ key: Date.now(), center: user, zoom: 16, offsetY: sheetSnap === 'half' ? heights.half / 2 - 20 : 40 });
    if (usingDemo && !settings.forceDemoLocation && gps.status !== 'granted') {
      toast('Konum izni yok; demo konumuna odaklanıldı.');
    }
  };

  const startEmergency = async () => {
    const target = pickEmergency(withDistance);
    if (!target) {
      toast('Yakında kayıtlı tuvalet bulunamadı.', 'error');
      return;
    }
    const req = Date.now();
    emergencyReq.current = req;
    setSelectedId(null);
    setSheetSnap('peek');
    setEmergency({ toiletId: target.id, route: [user, target], approximate: true });
    const flyOpts = { paddingTop: 270, paddingBottom: PEEK_HEIGHT + 50 };
    setFly({ key: req, bounds: [user, target], ...flyOpts });

    const r = await fetchWalkingRoute(user, target);
    if (emergencyReq.current !== req) return;
    setEmergency({ toiletId: target.id, route: r.points, approximate: r.approximate, routeDistance: r.distance });
    if (!r.approximate) setFly({ key: Date.now(), bounds: r.points, ...flyOpts });
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

  const startPicking = () => {
    setPicking(true);
    setSheetSnap('hidden');
  };

  const confirmPick = () => {
    setPicking(false);
    setSheetSnap('peek');
  };

  const handleMapClick = (p: LatLng) => {
    if (picking) {
      setDraftLocation(p);
      return;
    }
    if (sheetSnap === 'full' || sheetSnap === 'half') setSheetSnap('peek');
  };

  const submitToilet = (t: Toilet) => {
    setPending((p) => [t, ...p]);
    closeAdd();
    toast('Teşekkürler! Kaydınız “Onay Bekliyor” listesine eklendi. Ayarlar › Admin Paneli’nden onaylayabilirsiniz.', 'success');
  };

  const approve = (id: string) => {
    const t = pending.find((x) => x.id === id);
    if (!t) return;
    setPending((p) => p.filter((x) => x.id !== id));
    setApproved((a) => [...a, t]);
    setSettingsOpen(false);
    setSelectedId(t.id);
    setSheetSnap('half');
    setFly({ key: Date.now(), center: t, zoom: 17, offsetY: heights.half / 2 - 20 });
    toast(`“${t.name}” onaylandı ve haritaya eklendi.`, 'success');
  };

  const reject = (id: string) => {
    setPending((p) => p.filter((x) => x.id !== id));
    toast('Başvuru reddedildi.');
  };

  const resetData = () => {
    setApproved([]);
    setPending([]);
    setSelectedId(null);
    closeEmergency();
    toast('Kullanıcı verileri sıfırlandı.', 'success');
  };

  // ---------- Panel içeriği ----------
  const sortLabel = filters.sort === 'distance' ? 'En yakın' : 'En temiz';
  const sheetHeader = selected ? (
    <div className="px-5 pb-2">
      <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Tuvalet detayı</p>
    </div>
  ) : (
    <div className="flex items-end justify-between px-5 pb-3 pt-1">
      <div>
        <h2 className="text-lg font-extrabold leading-tight">Yakındaki Tuvaletler</h2>
        <p className="mt-0.5 text-xs font-medium text-ink-muted">
          {listed.length} sonuç · {sortLabel}
          {filters.freeOnly && ' · Sadece ücretsiz'}
        </p>
      </div>
      <span className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-ink-soft">
        <MapPin size={12} className={usingDemo ? 'text-ink-muted' : 'text-blue-600'} /> {usingDemo ? 'Demo' : 'GPS'}
      </span>
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center md:bg-[radial-gradient(circle_at_20%_20%,#FFF3B0_0,transparent_40%),radial-gradient(circle_at_80%_80%,#FFE680_0,transparent_35%)] md:p-6">
      <div
        ref={frameRef}
        className="relative h-[100dvh] w-full max-w-md overflow-hidden bg-white md:h-[min(calc(100dvh-48px),880px)] md:rounded-[44px] md:border-[10px] md:border-ink md:shadow-2xl"
      >
        <MapView
          initialCenter={DEMO_LOCATION}
          toilets={markers}
          user={user}
          selectedId={selectedId}
          emergencyId={emergency?.toiletId ?? null}
          route={emergency?.route ?? null}
          picking={picking}
          pickedLocation={addOpen ? draftLocation : null}
          mapStyle={settings.mapStyle}
          fly={fly}
          onSelect={selectToilet}
          onMapClick={handleMapClick}
        />

        {/* Üst bar: Ayarlar butonu + marka */}
        {!picking && !emergency && (
          <div className="absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Ayarlar"
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-float transition active:scale-95"
            >
              <SettingsIcon size={21} />
              {pending.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white">
                  {pending.length}
                </span>
              )}
            </button>
            <div className="flex h-12 items-center gap-2 rounded-full bg-white/95 pl-1.5 pr-4 shadow-float backdrop-blur">
              <Logo size={36} />
              <span className="text-[15px] font-extrabold tracking-tight">Tuvaletim Nerede?</span>
            </div>
          </div>
        )}

        {/* Konum seçme modu */}
        {picking && (
          <>
            <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 animate-slide-down rounded-3xl bg-ink p-4 text-white shadow-float">
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
                <button type="button" onClick={confirmPick} className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 text-sm font-bold">
                  <X size={15} /> Geri
                </button>
                <button
                  type="button"
                  disabled={!draftLocation}
                  onClick={confirmPick}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-bold text-ink disabled:opacity-40"
                >
                  <Check size={15} /> Bu konumu kullan
                </button>
              </div>
            </div>
          </>
        )}

        {!picking && (
          <FloatingControls
            filters={filters}
            onFiltersChange={setFilters}
            onLocate={locateMe}
            onAdd={openAdd}
            bottom={(sheetSnap === 'full' ? heights.half : heights[sheetSnap]) + 16}
            hidden={sheetSnap === 'full' || Boolean(emergency)}
          />
        )}

        <BottomSheet
          snap={picking ? 'hidden' : sheetSnap}
          onSnapChange={setSheetSnap}
          containerHeight={frameHeight || 800}
          header={sheetHeader}
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
          {selected ? (
            <ToiletDetail toilet={selected} user={user} onBack={() => setSelectedId(null)} />
          ) : listed.length === 0 ? (
            <div className="flex flex-col items-center px-8 py-10 text-center">
              <ListFilter size={30} className="text-gray-300" />
              <p className="mt-3 font-bold">Filtreye uygun tuvalet yok</p>
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-bold"
              >
                Filtreleri temizle
              </button>
            </div>
          ) : (
            <ul className="space-y-2.5 px-4 pb-6">
              {listed.map((t) => (
                <ToiletListItem key={t.id} toilet={t} user={user} onSelect={selectToilet} />
              ))}
            </ul>
          )}
        </BottomSheet>

        {emergency && emergencyToilet && !picking && (
          <EmergencyCard
            toilet={emergencyToilet}
            emergency={emergency}
            user={user}
            onClose={closeEmergency}
            onDetails={() => {
              const id = emergencyToilet.id;
              closeEmergency();
              selectToilet(id);
            }}
          />
        )}

        <Toasts toasts={toasts} />

        <SettingsDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onSettingsChange={setSettings}
          pending={pending}
          approvedCount={approved.length}
          locationLabel={locationLabel}
          onApprove={approve}
          onReject={reject}
          onResetData={resetData}
        />

        {addOpen && (
          <AddToiletModal
            visible={!picking}
            location={draftLocation}
            onRequestPick={startPicking}
            onUseMyLocation={() => setDraftLocation({ ...user })}
            onClose={closeAdd}
            onSubmit={submitToilet}
          />
        )}
      </div>
    </div>
  );
}
