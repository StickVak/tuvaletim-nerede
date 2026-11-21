import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import '../lib/leafletGlobal';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { MapContainer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng, PlaceView } from '../types';
import { toiletIcon, userIcon } from '../lib/mapIcons';
import BaseTiles from './BaseTiles';

export interface FlyCommand {
  key: number;
  center?: LatLng;
  zoom?: number;
  bounds?: LatLng[];
  /** Hedefi ekranda kaydırmak için piksel ofseti (panellerin kapattığı alanı telafi eder) */
  offset?: [number, number];
  padding?: { top: number; right: number; bottom: number; left: number };
}

function Controller({ fly, onReady }: { fly: FlyCommand | null; onReady?: (map: L.Map) => void }) {
  const map = useMap();

  useEffect(() => {
    onReady?.(map);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map, onReady]);

  useEffect(() => {
    if (!fly) return;
    if (fly.bounds && fly.bounds.length > 1) {
      const pad = fly.padding ?? { top: 60, right: 72, bottom: 60, left: 48 };
      map.flyToBounds(L.latLngBounds(fly.bounds.map((p) => [p.lat, p.lng])), {
        paddingTopLeft: [pad.left, pad.top],
        paddingBottomRight: [pad.right, pad.bottom],
        maxZoom: 17,
        duration: 0.9,
      });
      return;
    }
    if (fly.center) {
      const zoom = fly.zoom ?? Math.max(map.getZoom(), 16);
      let target = L.latLng(fly.center.lat, fly.center.lng);
      if (fly.offset) {
        // Hedefin görünür alanın ortasında kalması için harita merkezini ters yönde kaydır
        const pt = map.project(target, zoom).subtract(fly.offset);
        target = map.unproject(pt, zoom);
      }
      map.flyTo(target, zoom, { duration: 0.8 });
    }
  }, [fly, map]);

  return null;
}

/** Pinleri uzaklaştırınca kümeleyen katman (sarı-siyah sayı baloncukları) */
function ClusterLayer({ places, onRouteIds, picking, onSelect, onPick }: { places: PlaceView[]; onRouteIds: Set<string>; picking: boolean; onSelect: (id: string) => void; onPick: (p: LatLng) => void }) {
  const map = useMap();
  const group = useRef<L.MarkerClusterGroup | null>(null);
  // Tıklama işleyicileri her render'da değişir; pinleri yeniden kurmamak için ref ile okunur
  const handlers = useRef({ picking, onSelect, onPick });
  handlers.current = { picking, onSelect, onPick };

  useEffect(() => {
    const g = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      disableClusteringAtZoom: 17,
      iconCreateFunction: (c) =>
        L.divIcon({ html: `<div class="tn-cluster"><span>${c.getChildCount()}</span></div>`, className: '', iconSize: [44, 44] }),
    });
    map.addLayer(g);
    group.current = g;
    return () => {
      map.removeLayer(g);
    };
  }, [map]);

  // Yalnızca pinin görünümünü etkileyen alanlar değişince yeniden kur (konum güncellemesinde değil)
  const signature = places.map((p) => `${p.id}|${p.category}|${p.stats.isPaid}|${p.status.closed}|${onRouteIds.has(p.id)}`).join(',');
  const placesRef = useRef(places);
  placesRef.current = places;
  const onRouteIdsRef = useRef(onRouteIds);
  onRouteIdsRef.current = onRouteIds;

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const places = placesRef.current;
    g.clearLayers();
    g.addLayers(
      places.map((p) => {
        const m = L.marker([p.lat, p.lng], {
          icon: toiletIcon(p.category, p.stats.isPaid ? 'paid' : 'free', 'normal', p.status.closed, onRouteIdsRef.current.has(p.id)),
          title: p.name,
        });
        m.on('click', (e: L.LeafletMouseEvent) =>
          handlers.current.picking ? handlers.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) : handlers.current.onSelect(p.id),
        );
        return m;
      }),
    );
  }, [signature]);

  return null;
}

function ClickHandler({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

interface Props {
  initialCenter: LatLng;
  initialZoom: number;
  /** Haritanın kaydırılabileceği alan: [[güney, batı], [kuzey, doğu]] */
  maxBounds?: [[number, number], [number, number]];
  places: PlaceView[];
  user: LatLng | null;
  selectedId: string | null;
  /** Rota hedefi; Acil modunda kırmızı, yol tarifinde seçili pin */
  routeTargetId: string | null;
  routeMode: 'emergency' | 'navigate' | null;
  route: LatLng[] | null;
  /** true: kuş uçuşu (kesikli) çizgi */
  routeApproximate: boolean;
  /** Rota çizgisine 150 m yakın tuvaletler */
  onRouteIds: Set<string>;
  picking: boolean;
  pickedLocation: LatLng | null;
  fly: FlyCommand | null;
  onSelect: (id: string) => void;
  onMapClick: (p: LatLng) => void;
  onReady?: (map: L.Map) => void;
}

export default function MapView({
  initialCenter,
  initialZoom,
  maxBounds,
  places,
  user,
  selectedId,
  routeTargetId,
  routeMode,
  route,
  routeApproximate,
  onRouteIds,
  picking,
  pickedLocation,
  fly,
  onSelect,
  onMapClick,
  onReady,
}: Props) {
  // Seçili, rota hedefi ve rota üzerindekiler kümeye girmez: rozetleriyle her zaman görünür
  const isHighlighted = (id: string) => id === selectedId || id === routeTargetId || onRouteIds.has(id);
  const clustered = useMemo(() => places.filter((p) => !isHighlighted(p.id)), [places, selectedId, routeTargetId, onRouteIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const highlighted = useMemo(() => places.filter((p) => isHighlighted(p.id)), [places, selectedId, routeTargetId, onRouteIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const routeLatLngs = useMemo(
    () => (route ? route.map((p) => [p.lat, p.lng] as [number, number]) : null),
    [route],
  );

  return (
    <div className={`absolute inset-0 z-0 ${picking ? 'picking' : ''} ${route ? 'routing' : ''}`}>
      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={initialZoom}
        minZoom={5}
        maxBounds={maxBounds}
        maxBoundsViscosity={0.8}
        zoomControl={false}
        attributionControl
        className="h-full w-full"
      >
        <BaseTiles />
        <Controller fly={fly} onReady={onReady} />
        <ClickHandler onClick={onMapClick} />

        {routeLatLngs &&
          (routeApproximate ? (
            // Rota servisi yanıt vermedi: kesikli kuş uçuşu çizgi
            <Polyline positions={routeLatLngs} pathOptions={{ color: '#2563EB', weight: 4, opacity: 0.9, dashArray: '6 10', lineCap: 'round' }} />
          ) : (
            <>
              <Polyline positions={routeLatLngs} pathOptions={{ color: '#FFFFFF', weight: 10, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
              <Polyline positions={routeLatLngs} pathOptions={{ color: '#2563EB', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
            </>
          ))}

        <ClusterLayer places={clustered} onRouteIds={onRouteIds} picking={picking} onSelect={onSelect} onPick={onMapClick} />

        {/* Seçili pin ve rota hedefi kümeye girmez: her zaman görünür */}
        {highlighted.map((t) => (
          <Marker
            key={t.id}
            position={[t.lat, t.lng]}
            icon={toiletIcon(
              t.category,
              t.stats.isPaid ? 'paid' : 'free',
              t.id === routeTargetId ? (routeMode === 'emergency' ? 'emergency' : 'selected') : t.id === selectedId ? 'selected' : 'normal',
              t.status.closed,
              onRouteIds.has(t.id),
            )}
            title={t.name}
            zIndexOffset={t.id === routeTargetId ? 1000 : t.id === selectedId ? 500 : 300}
            eventHandlers={{
              click: (e) => {
                if (picking) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
                else onSelect(t.id);
              },
            }}
          />
        ))}

        {pickedLocation && (
          <Marker position={[pickedLocation.lat, pickedLocation.lng]} icon={toiletIcon('diger', 'paid', 'new')} zIndexOffset={2000} />
        )}

        {user && <Marker position={[user.lat, user.lng]} icon={userIcon} zIndexOffset={1500} interactive={false} />}
      </MapContainer>
    </div>
  );
}
