import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng, ToiletCategory } from '../types';
import { OSM_TILE, toiletIcon } from '../lib/mapIcons';

function Recenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
  }, [center.lat, center.lng, map]);
  return null;
}

function Picker({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

interface Props {
  center: LatLng;
  category?: ToiletCategory;
  className?: string;
  onPick?: (p: LatLng) => void;
}

/** Admin panelinde konum önizleme / düzenleme için küçük harita */
export default function MiniMap({ center, category = 'diger', className = 'h-48', onPick }: Props) {
  return (
    <div className={`relative z-0 overflow-hidden rounded-2xl ring-1 ring-line ${className}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={16}
        zoomControl={false}
        scrollWheelZoom={Boolean(onPick)}
        dragging={Boolean(onPick)}
        attributionControl={false}
        className="h-full w-full"
      >
        <TileLayer url={OSM_TILE.url} maxZoom={19} />
        <Recenter center={center} />
        {onPick && <Picker onPick={onPick} />}
        <Marker position={[center.lat, center.lng]} icon={toiletIcon(category, 'paid', 'selected')} interactive={false} />
      </MapContainer>
      <span className="pointer-events-none absolute bottom-1.5 right-2 z-[400] rounded bg-white/80 px-1.5 text-[9px] text-ink-muted">
        © OpenStreetMap
      </span>
    </div>
  );
}
