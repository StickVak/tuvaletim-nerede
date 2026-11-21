/**
 * Türkiye il / ilçe listesi (81 il, 973 ilçe — src/data/turkiye.json) ve Türkçe harf/büyük-küçük/boşluk farklarına
 * duyarsız eşleştirme. İstemcideki src/lib/turkey.ts aynı veriyi ve aynı trKey kuralını kullanır.
 */
import { readFileSync } from 'node:fs';

export const PROVINCES = JSON.parse(readFileSync(new URL('../src/data/turkiye.json', import.meta.url), 'utf8'));

/** "İZMİR", "izmir", " Izmir " → "izmir"; "Çiğli" → "cigli". Karşılaştırma anahtarı (görüntülenmez). */
export const trKey = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/[İIı]/g, 'i')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

const byKey = new Map(PROVINCES.map((p) => [trKey(p.il), p]));
/** İlçe anahtarı → bu adı taşıyan iller (ör. "Merkez" 51 ilde) */
const districtIndex = new Map();
for (const p of PROVINCES) for (const d of p.ilceler) {
  const k = trKey(d);
  if (!districtIndex.has(k)) districtIndex.set(k, []);
  districtIndex.get(k).push(p);
}

export const findProvince = (name) => byKey.get(trKey(name)) ?? null;
export const findDistrict = (province, name) => province?.ilceler.find((d) => trKey(d) === trKey(name)) ?? null;

const dist2 = (a, b) => (a.lat - b.lat) ** 2 + ((a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) ** 2;

/**
 * İl/ilçe adlarını listedeki yazıma çevirir → { province, district } (boşlar null) ya da hata metni.
 * - İl verilmişse listede olmalı; ilçe verilmişse o ile ait olmalı.
 * - Yalnızca ilçe verilmişse (eski kayıtlar) il, ilçe adından çıkarılır; aynı ad birden çok ilde varsa
 *   near (kaydın konumu) verilmişse merkezi en yakın il seçilir, verilmemişse "İl seçin" hatası.
 */
export function resolveLocation({ province, district, near = null }) {
  const pv = typeof province === 'string' ? province.trim() : '';
  const dv = typeof district === 'string' ? district.trim() : '';
  if (!pv && !dv) return { province: null, district: null };
  if (pv) {
    const p = findProvince(pv);
    if (!p) return 'Geçersiz il.';
    if (!dv) return { province: p.il, district: null };
    const d = findDistrict(p, dv);
    return d ? { province: p.il, district: d } : `Seçilen ilçe ${p.il} iline ait değil.`;
  }
  const candidates = districtIndex.get(trKey(dv)) ?? [];
  if (!candidates.length) return 'Geçersiz ilçe.';
  if (candidates.length > 1 && !near) return 'İl seçin.';
  const p = candidates.length === 1 ? candidates[0] : candidates.reduce((a, b) => (dist2(near, a) <= dist2(near, b) ? a : b));
  return { province: p.il, district: findDistrict(p, dv) };
}
