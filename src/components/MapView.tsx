import { useEffect, useMemo } from 'react';
import L from 'leaflet';
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
  emergencyId: string | null;
  route: LatLng[] | null;
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
  emergencyId,
  route,
  picking,
  pickedLocation,
  fly,
  onSelect,
  onMapClick,
  onReady,
}: Props) {
  const routeLatLngs = useMemo(
    () => (route ? route.map((p) => [p.lat, p.lng] as [number, number]) : null),
    [route],
  );

  return (
    <div className={`absolute inset-0 z-0 ${picking ? 'picking' : ''}`}>
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

        {routeLatLngs && (
          <>
            <Polyline positions={routeLatLngs} pathOptions={{ color: '#2563EB', weight: 9, opacity: 0.3, lineCap: 'round' }} />
            <Polyline
              positions={routeLatLngs}
              pathOptions={{ color: '#FFC300', weight: 5, opacity: 1, dashArray: '2 12', lineCap: 'round' }}
            />
          </>
        )}

        {places.map((t) => (
          <Marker
            key={t.id}
            position={[t.lat, t.lng]}
            icon={toiletIcon(
              t.category,
              t.stats.isPaid ? 'paid' : 'free',
              t.id === emergencyId ? 'emergency' : t.id === selectedId ? 'selected' : 'normal',
            )}
            title={t.name}
            zIndexOffset={t.id === emergencyId ? 1000 : t.id === selectedId ? 500 : 0}
            eventHandlers={{
              click: (e) => {
                // Konum seçme modunda pine dokunmak da o noktayı seçer
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
