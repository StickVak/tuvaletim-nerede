/**
 * Türkiye il / ilçe listesi (81 il, 973 ilçe — src/data/turkiye.json) ve Türkçe harf/büyük-küçük/boşluk farklarına
 * duyarsız eşleştirme. Sunucudaki server/turkey.js aynı veriyi ve aynı trKey kuralını kullanır.
 */
import data from '../data/turkiye.json' with { type: 'json' };
import type { LatLng } from '../types';

export interface Province {
  il: string;
  plaka: string;
  lat: number;
  lng: number;
  ilceler: string[];
}

export const PROVINCES: Province[] = data;

/** Konum yokken harita: Türkiye geneli */
export const TURKEY_CENTER: LatLng = { lat: 39.0, lng: 35.2 };
export const TURKEY_ZOOM = 6;
/** Haritanın kaydırılabileceği alan (Türkiye + kıyı/kara sınırı payı) */
export const TURKEY_BOUNDS: [[number, number], [number, number]] = [[34.0, 23.5], [44.0, 47.0]];

/** "İZMİR", "izmir", " Izmir " → "izmir"; "Çiğli" → "cigli". Karşılaştırma anahtarı (görüntülenmez). */
export const trKey = (s: string | null | undefined) =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/[İIı]/g, 'i')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

const byKey = new Map(PROVINCES.map((p) => [trKey(p.il), p]));

export const findProvince = (name: string | null | undefined) => byKey.get(trKey(name)) ?? null;

/** İlin ilçeleri (alfabetik); il yoksa boş liste */
export const districtsOf = (province: string | null | undefined) => findProvince(province)?.ilceler ?? [];

/** Merkezi bu noktaya en yakın il (yeni mekan formunda il ön seçimi; sınır yakınında kullanıcı değiştirebilir) */
export function nearestProvince(p: LatLng): Province {
  const d = (q: Province) => (q.lat - p.lat) ** 2 + ((q.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2;
  return PROVINCES.reduce((a, b) => (d(a) <= d(b) ? a : b));
}

/** İl / ilçe filtresi: boşsa hepsi; eşleştirme büyük/küçük harf ve Türkçe karakter farkına duyarsız */
export function matchesLocation(place: { province?: string | null; district?: string | null }, province?: string, district?: string) {
  if (province && trKey(place.province) !== trKey(province)) return false;
  if (district && trKey(place.district) !== trKey(district)) return false;
  return true;
}
