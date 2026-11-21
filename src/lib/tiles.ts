/**
 * Harita karo sağlayıcıları (sırayla denenir; ilki çalışmazsa sıradakine geçilir).
 * - tile.openstreetmap.org kullanılmaz: OSM'nin kendi sunucuları yalnızca sınırlı kullanım içindir; Referer göndermeyen
 *   ya da yoğun kullanan uygulamalara "403 Access blocked" görseli döndürür.
 * - CARTO basemaps kullanılmaz: anahtarsız isteklere artık her yakınlaştırmada "API KEY REQUIRED" görseli (HTTP 200)
 *   döndürüyor; bu hata olarak algılanamaz.
 * Esri World Street Map anahtarsız çalışır ve Türkçe etiketlidir; yedek olarak OpenStreetMap Fransa topluluk sunucusu.
 */
export interface TileProvider {
  id: string;
  label: string;
  url: string;
  subdomains?: string;
  maxZoom: number;
  attribution: string;
}

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları';

export const TILE_PROVIDERS: TileProvider[] = [
  {
    id: 'esri-street',
    label: 'Esri',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Karolar &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> — Esri, HERE, Garmin, USGS, ' + OSM,
  },
  {
    id: 'osm-fr',
    label: 'OpenStreetMap France',
    url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 19,
    attribution: `${OSM} — karolar <a href="https://www.openstreetmap.fr" target="_blank" rel="noopener">OpenStreetMap France</a>`,
  },
];

/** Yüklenemeyen karonun yerine: 1×1 saydam GIF (bozuk görsel / hata resmi görünmez) */
export const BLANK_TILE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Sağlayıcı sağlık durumu: ilk karolardan hiçbiri yüklenemezse (ERROR_LIMIT hata, 0 başarı) sağlayıcı "çalışmıyor"
 * sayılır. Ara sıra düşen tek tük karolar sağlayıcı değiştirmez.
 */
export const ERROR_LIMIT = 6;
export function providerFailed(stats: { loaded: number; failed: number }) {
  return stats.loaded === 0 && stats.failed >= ERROR_LIMIT;
}
