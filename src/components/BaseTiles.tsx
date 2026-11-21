import { useMemo, useRef, useState } from 'react';
import { TileLayer } from 'react-leaflet';
import type { TileEvent } from 'leaflet';
import { MapPinOff, RotateCw } from 'lucide-react';
import { BLANK_TILE, TILE_PROVIDERS, providerFailed } from '../lib/tiles';

/**
 * Taban harita katmanı: sağlayıcı çalışmazsa sıradakine otomatik geçer; hiçbiri yüklenemezse haritanın üstünde
 * küçük, tıklamayı engellemeyen bir bilgi kutusu gösterir. Harita (kaydırma, yakınlaştırma, işaretçiler, konum seçimi)
 * her durumda çalışmaya devam eder. Yüklenemeyen karo yerine saydam görsel konur.
 */
export default function BaseTiles({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0);
  const stats = useRef({ loaded: 0, failed: 0 });
  const provider = TILE_PROVIDERS[index];
  const exhausted = index >= TILE_PROVIDERS.length;

  // Olaylar katman başına sayılır: sağlayıcı değiştikten sonra eski katmanın geç gelen hataları yenisine yazılmaz
  const current = useRef(index);
  current.current = index;
  const handlers = useMemo(() => {
    const mine = index;
    return {
      // Hatalı karonun yerine konan saydam görsel de "load" tetikler: başarı sayılmaz
      tileload: (e: TileEvent) => {
        if (mine === current.current && e.tile.getAttribute('src') !== BLANK_TILE) stats.current.loaded++;
      },
      tileerror: () => {
        if (mine !== current.current) return;
        stats.current.failed++;
        if (providerFailed(stats.current)) {
          stats.current = { loaded: 0, failed: 0 };
          setIndex(mine + 1);
        }
      },
    };
  }, [index]);

  const retry = () => {
    stats.current = { loaded: 0, failed: 0 };
    setIndex(0);
  };

  return (
    <>
      {!exhausted && (
        <TileLayer
          key={provider.id}
          url={provider.url}
          subdomains={provider.subdomains ?? 'abc'}
          maxZoom={provider.maxZoom}
          attribution={provider.attribution}
          errorTileUrl={BLANK_TILE}
          eventHandlers={handlers}
        />
      )}
      {exhausted && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[450] flex -translate-y-1/2 justify-center px-4">
          <div
            role="status"
            className={`pointer-events-auto flex items-center gap-2 rounded-2xl bg-surface/95 text-ink shadow-float ring-1 ring-line ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}`}
          >
            <MapPinOff size={compact ? 14 : 18} className="shrink-0 text-ink-muted" />
            <span>
              <b>Harita görüntüsü yüklenemedi.</b>
              {!compact && <span className="block text-xs text-ink-muted">İşaretçiler ve konum seçimi çalışmaya devam ediyor.</span>}
            </span>
            <button type="button" onClick={retry} className="ml-1 flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs font-bold hover:bg-line/60">
              <RotateCw size={12} /> Tekrar dene
            </button>
          </div>
        </div>
      )}
    </>
  );
}
