import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import type { LeafletEventHandlerFnMap } from 'leaflet';
import type { LatLng, ToiletCategory } from '../../src/types';
import { toiletIcon } from '../../src/lib/mapIcons';
import BaseTiles from '../../src/components/BaseTiles';

/** İşaretçi değişince görünümü ona kaydırır (yakınlaştırma korunur) */
function Recenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
  }, [center.lat, center.lng, map]);
  return null;
}

/** Görünümü işaretçiyi taşımadan bir bölgeye götürür (il/ilçe/adres seçimi) */
function Focus({ focus }: { focus?: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], focus.zoom, { duration: 0.6 });
  }, [focus, map]);
  return null;
}

function Picker({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export interface MapFocus extends LatLng {
  zoom: number;
  /** Aynı noktaya yeniden odaklanmak için değişen anahtar */
  key: number;
}

interface Props {
  center: LatLng;
  category?: ToiletCategory;
  className?: string;
  /** Verilirse düzenleme modu: haritaya tıklama ve işaretçiyi sürükleme konumu değiştirir */
  onPick?: (p: LatLng) => void;
  focus?: MapFocus | null;
}

/** Admin panelinde konum önizleme / düzenleme için küçük harita */
export default function MiniMap({ center, category = 'diger', className = 'h-48', onPick, focus }: Props) {
  const editable = Boolean(onPick);
  const dragHandlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      dragend: (e) => {
        const p = (e.target as L.Marker).getLatLng();
        onPick?.({ lat: p.lat, lng: p.lng });
      },
    }),
    [onPick],
  );
  return (
    <div className={`relative z-0 overflow-hidden rounded-2xl ring-1 ring-line ${className}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={16}
        zoomControl={false}
        scrollWheelZoom={editable}
        dragging={editable}
        attributionControl={false}
        className="h-full w-full"
      >
        <BaseTiles compact />
        <Recenter center={center} />
        <Focus focus={focus} />
        {editable && <Picker onPick={onPick!} />}
        <Marker
          position={[center.lat, center.lng]}
          icon={toiletIcon(category, 'paid', 'selected')}
          interactive={editable}
          draggable={editable}
          eventHandlers={editable ? dragHandlers : undefined}
          keyboard={false}
        />
      </MapContainer>
      <span className="pointer-events-none absolute bottom-1.5 right-2 z-[400] rounded bg-white/80 px-1.5 text-[9px] text-ink-muted">
        © OpenStreetMap
      </span>
    </div>
  );
}
