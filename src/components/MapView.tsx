import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import '../lib/leafletGlobal';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng, PlaceView } from '../types';
import { OSM_TILE, toiletIcon, userIcon } from '../lib/mapIcons';

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

/** İzmir genelindeki pinleri uzaklaştırınca kümeleyen katman (sarı-siyah sayı baloncukları) */
function ClusterLayer({ places, picking, onSelect, onPick }: { places: PlaceView[]; picking: boolean; onSelect: (id: string) => void; onPick: (p: LatLng) => void }) {
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

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    g.clearLayers();
    g.addLayers(
      places.map((p) => {
        const m = L.marker([p.lat, p.lng], {
          icon: toiletIcon(p.category, p.stats.isPaid ? 'paid' : 'free', 'normal', p.status.closed),
          title: p.name,
        });
        m.on('click', (e: L.LeafletMouseEvent) =>
          handlers.current.picking ? handlers.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) : handlers.current.onSelect(p.id),
        );
        return m;
      }),
    );
  }, [places]);

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
  places: PlaceView[];
  user: LatLng | null;
  selectedId: string | null;
  /** Rota hedefi; Acil modunda kırmızı, yol tarifinde seçili pin */
  routeTargetId: string | null;
  routeMode: 'emergency' | 'navigate' | null;
  route: LatLng[] | null;
  /** true: kuş uçuşu (kesikli) çizgi */
  routeApproximate: boolean;
  picking: boolean;
  pickedLocation: LatLng | null;
  fly: FlyCommand | null;
  onSelect: (id: string) => void;
  onMapClick: (p: LatLng) => void;
  onReady?: (map: L.Map) => void;
}

export default function MapView({
  initialCenter,
  places,
  user,
  selectedId,
  routeTargetId,
  routeMode,
  route,
  routeApproximate,
  picking,
  pickedLocation,
  fly,
  onSelect,
  onMapClick,
  onReady,
}: Props) {
  const isHighlighted = (id: string) => id === selectedId || id === routeTargetId;
  const clustered = useMemo(() => places.filter((p) => !isHighlighted(p.id)), [places, selectedId, routeTargetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const highlighted = useMemo(() => places.filter((p) => isHighlighted(p.id)), [places, selectedId, routeTargetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const routeLatLngs = useMemo(
    () => (route ? route.map((p) => [p.lat, p.lng] as [number, number]) : null),
    [route],
  );

  return (
    <div className={`absolute inset-0 z-0 ${picking ? 'picking' : ''} ${route ? 'routing' : ''}`}>
      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={13}
        zoomControl={false}
        attributionControl
        className="h-full w-full"
      >
        <TileLayer url={OSM_TILE.url} attribution={OSM_TILE.attribution} maxZoom={19} />
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

        <ClusterLayer places={clustered} picking={picking} onSelect={onSelect} onPick={onMapClick} />

        {/* Seçili pin ve rota hedefi kümeye girmez: her zaman görünür */}
        {highlighted.map((t) => (
          <Marker
            key={t.id}
            position={[t.lat, t.lng]}
            icon={toiletIcon(
              t.category,
              t.stats.isPaid ? 'paid' : 'free',
              t.id === routeTargetId && routeMode === 'emergency' ? 'emergency' : 'selected',
              t.status.closed,
            )}
            title={t.name}
            zIndexOffset={t.id === routeTargetId ? 1000 : 500}
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
