import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng, MapStyle, Toilet, ToiletCategory } from '../types';
import { CATEGORIES } from '../lib/categories';

export interface FlyCommand {
  key: number;
  center?: LatLng;
  zoom?: number;
  bounds?: LatLng[];
  /** Alt panel haritanın bir kısmını kapattığında hedefi yukarı kaydırmak için (px) */
  offsetY?: number;
  paddingTop?: number;
  paddingBottom?: number;
}

const TILES: Record<MapStyle, { url: string; attribution: string }> = {
  voyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  positron: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
};

const iconCache = new Map<string, L.DivIcon>();

function toiletIcon(category: ToiletCategory, isFree: boolean, state: 'normal' | 'selected' | 'emergency' | 'new') {
  const key = `${category}-${isFree}-${state}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const Icon = CATEGORIES[category].icon;
  const svg = renderToStaticMarkup(<Icon strokeWidth={2.6} />);
  const html = `<div class="tn-pin ${state !== 'normal' ? `is-${state}` : ''}">
    <span class="tn-pin-shadow"></span>
    <div class="tn-pin-body"><div class="tn-pin-inner">${svg}</div></div>
    ${isFree && state !== 'new' ? '<span class="tn-pin-free">Ücretsiz</span>' : ''}
  </div>`;
  const icon = L.divIcon({ html, className: '', iconSize: [44, 54], iconAnchor: [22, 52] });
  iconCache.set(key, icon);
  return icon;
}

const userIcon = L.divIcon({
  html: '<div class="tn-user"><span class="tn-user-pulse"></span><span class="tn-user-dot"></span></div>',
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function Controller({ fly }: { fly: FlyCommand | null }) {
  const map = useMap();

  useEffect(() => {
    // Mobil çerçeve boyutu değiştiğinde haritanın yeniden ölçülmesi
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  useEffect(() => {
    if (!fly) return;
    if (fly.bounds && fly.bounds.length > 1) {
      map.flyToBounds(L.latLngBounds(fly.bounds.map((p) => [p.lat, p.lng])), {
        paddingTopLeft: [48, fly.paddingTop ?? 60],
        paddingBottomRight: [72, fly.paddingBottom ?? 60],
        maxZoom: 17,
        duration: 0.9,
      });
      return;
    }
    if (fly.center) {
      const zoom = fly.zoom ?? Math.max(map.getZoom(), 16);
      let target = L.latLng(fly.center.lat, fly.center.lng);
      if (fly.offsetY) {
        const pt = map.project(target, zoom).add([0, fly.offsetY]);
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
  toilets: Toilet[];
  user: LatLng;
  selectedId: string | null;
  emergencyId: string | null;
  route: LatLng[] | null;
  picking: boolean;
  pickedLocation: LatLng | null;
  mapStyle: MapStyle;
  fly: FlyCommand | null;
  onSelect: (id: string) => void;
  onMapClick: (p: LatLng) => void;
}

export default function MapView({
  initialCenter,
  toilets,
  user,
  selectedId,
  emergencyId,
  route,
  picking,
  pickedLocation,
  mapStyle,
  fly,
  onSelect,
  onMapClick,
}: Props) {
  const tile = TILES[mapStyle];
  const routeLatLngs = useMemo(
    () => (route ? route.map((p) => [p.lat, p.lng] as [number, number]) : null),
    [route],
  );

  return (
    <div className={`absolute inset-0 z-0 ${picking ? 'picking' : ''}`}>
      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={15}
        zoomControl={false}
        attributionControl
        className="h-full w-full"
      >
        <TileLayer key={mapStyle} url={tile.url} attribution={tile.attribution} subdomains="abcd" maxZoom={19} />
        <Controller fly={fly} />
        <ClickHandler onClick={onMapClick} />

        {routeLatLngs && (
          <>
            <Polyline positions={routeLatLngs} pathOptions={{ color: '#2563EB', weight: 9, opacity: 0.25, lineCap: 'round' }} />
            <Polyline
              positions={routeLatLngs}
              pathOptions={{ color: '#FFC300', weight: 5, opacity: 1, dashArray: '2 12', lineCap: 'round' }}
            />
          </>
        )}

        {toilets.map((t) => (
          <Marker
            key={t.id}
            position={[t.lat, t.lng]}
            icon={toiletIcon(
              t.category,
              t.isFree,
              t.id === emergencyId ? 'emergency' : t.id === selectedId ? 'selected' : 'normal',
            )}
            zIndexOffset={t.id === emergencyId ? 1000 : t.id === selectedId ? 500 : 0}
            eventHandlers={{
              click: () => {
                if (!picking) onSelect(t.id);
              },
            }}
          />
        ))}

        {pickedLocation && (
          <Marker position={[pickedLocation.lat, pickedLocation.lng]} icon={toiletIcon('diger', false, 'new')} zIndexOffset={2000} />
        )}

        <Marker position={[user.lat, user.lng]} icon={userIcon} zIndexOffset={1500} interactive={false} />
      </MapContainer>
    </div>
  );
}
