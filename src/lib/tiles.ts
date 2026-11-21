/**
 * Harita karo sağlayıcıları. Görünüm: OpenStreetMap'in standart haritası (kullanıcıların alıştığı stil).
 * - OSM karo sunucusu Referer göndermeyen tarayıcı isteklerini "403 Access blocked" görseliyle reddeder; yönetim paneli
 *   güvenlik için genel olarak Referer göndermez (Referrer-Policy: no-referrer). Bu yüzden karo isteklerinde
 *   referrerPolicy yalnızca karolar için açıkça "strict-origin-when-cross-origin" (yalnızca köken gönderilir) yapılır.
 * - OSM'ye hiç ulaşılamazsa (ağ/HTTP hatası) yedek olarak Esri World Street Map kullanılır.
 */
export interface TileProvider {
  id: string;
  url: string;
  subdomains?: string;
  maxZoom: number;
  attribution: string;
}

/** Karo isteklerinde gönderilecek Referer politikası (OSM karo kullanım kuralı geçerli bir Referer ister) */
export const TILE_REFERRER_POLICY = 'strict-origin-when-cross-origin';

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları';

export const TILE_PROVIDERS: TileProvider[] = [
  {
    id: 'osm',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: OSM_ATTRIBUTION,
  },
  {
    id: 'esri-street',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: `Karolar &copy; Esri — ${OSM_ATTRIBUTION}`,
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
