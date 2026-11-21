/**
 * Türkiye geneli seed: İzmir dışındaki illerde bilinen merkezi noktaları (meydan, AVM, gar/otogar, park/sahil)
 * OpenStreetMap / Nominatim ile konumlandırır ve server/seed-places.json'a id ile birleştirir (tekrar çalıştırılabilir:
 * aynı id güncellenir, çift kayıt oluşmaz). Ayrıca mevcut kayıtlara il (province) alanını ekler.
 *   node scripts/geocode-turkey-seed.mjs
 * Her sonuç doğrulanır: Nominatim'in döndürdüğü il beklenen il olmalı ve ilçe src/data/turkiye.json listesinde olmalı;
 * olmazsa kayıt eklenmez ve stderr'e yazılır. Nominatim kuralı: saniyede en fazla 1 istek; yanıtlar önbelleğe alınır.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { findProvince, resolveLocation, trKey } from '../server/turkey.js';

const UA = 'tuvaletim-nerede-seed/1.0 (https://github.com/stickvak/tuvaletim-nerede)';
const SEED = new URL('../server/seed-places.json', import.meta.url);
const CACHE_FILE = new URL('./.nominatim-cache.json', import.meta.url);
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
const log = (...a) => console.error(...a);

/** [il, kayıt adı, Nominatim sorgusu, kategori] — meydan → belediye WC, gar/otogar → diğer */
const PLACES = [
  ['İstanbul', 'Taksim Meydanı Belediye WC', 'Taksim Meydanı, Beyoğlu, İstanbul', 'belediye'],
  ['İstanbul', 'Sirkeci Garı', 'Sirkeci Garı, Fatih, İstanbul', 'diger'],
  ['İstanbul', 'Kadıköy İskelesi', 'Kadıköy İskelesi, Kadıköy, İstanbul', 'diger'],
  ['İstanbul', 'Cevahir AVM', 'Cevahir, Şişli, İstanbul', 'avm'],
  ['İstanbul', 'Forum İstanbul AVM', 'Forum İstanbul, Bayrampaşa, İstanbul', 'avm'],
  ['İstanbul', 'Emirgan Korusu', 'Emirgan Korusu, Sarıyer, İstanbul', 'park'],
  ['Ankara', 'Kızılay Meydanı Belediye WC', 'Kızılay Meydanı, Çankaya, Ankara', 'belediye'],
  ['Ankara', 'Ankara Garı', 'Ankara Garı, Altındağ, Ankara', 'diger'],
  ['Ankara', 'AŞTİ Otogarı', 'AŞTİ, Ankara', 'diger'],
  ['Ankara', 'ANKAmall AVM', 'ANKAmall, Yenimahalle, Ankara', 'avm'],
  ['Ankara', 'Gençlik Parkı', 'Gençlik Parkı, Altındağ, Ankara', 'park'],
  ['Ankara', 'Kentpark AVM', 'Kentpark, Çankaya, Ankara', 'avm'],
  ['Antalya', 'Cumhuriyet Meydanı Belediye WC', 'Cumhuriyet Meydanı, Muratpaşa, Antalya', 'belediye'],
  ['Antalya', 'Konyaaltı Plajı', 'Konyaaltı Plajı, Antalya', 'park'],
  ['Antalya', 'MarkAntalya AVM', 'MarkAntalya, Muratpaşa, Antalya', 'avm'],
  ['Antalya', 'Antalya Otogarı', 'Antalya Otogarı, Kepez, Antalya', 'diger'],
  ['Antalya', 'Karaalioğlu Parkı', 'Karaalioğlu Parkı, Muratpaşa, Antalya', 'park'],
  ['Bursa', 'Heykel (Cumhuriyet Alanı) Belediye WC', 'Heykel, Osmangazi, Bursa', 'belediye'],
  ['Bursa', 'Zafer Plaza AVM', 'Zafer Plaza, Osmangazi, Bursa', 'avm'],
  ['Bursa', 'Bursa Otogarı', 'Bursa Şehirlerarası Otobüs Terminali, Bursa', 'diger'],
  ['Bursa', 'Kültürpark', 'Kültürpark, Osmangazi, Bursa', 'park'],
  ['Bursa', 'Kent Meydanı AVM', 'Kent Meydanı, Osmangazi, Bursa', 'avm'],
  ['Konya', 'Mevlana Meydanı Belediye WC', 'Mevlana Müzesi, Karatay, Konya', 'belediye'],
  ['Konya', 'Alaaddin Tepesi', 'Alaaddin Tepesi, Selçuklu, Konya', 'park'],
  ['Konya', 'Kent Plaza AVM', 'Kent Plaza, Selçuklu, Konya', 'avm'],
  ['Konya', 'Konya Garı', 'Konya Garı', 'diger'],
  ['Konya', 'Kulesite AVM', 'Kulesite AVM', 'avm'],
  ['Adana', 'Merkez Park', 'Merkez Park, Seyhan, Adana', 'park'],
  ['Adana', 'Taşköprü Belediye WC', 'Taşköprü, Seyhan, Adana', 'belediye'],
  ['Adana', 'Optimum Adana AVM', 'Optimum, Yüreğir, Adana', 'avm'],
  ['Adana', 'M1 Adana AVM', 'M1 Adana, Seyhan, Adana', 'avm'],
  ['Trabzon', 'Meydan Parkı Belediye WC', 'Meydan Parkı, Ortahisar, Trabzon', 'belediye'],
  ['Trabzon', 'Forum Trabzon AVM', 'Forum Trabzon, Ortahisar, Trabzon', 'avm'],
  ['Trabzon', 'Trabzon Otogarı', 'Trabzon Otobüs Terminali, Trabzon', 'diger'],
  ['Trabzon', 'Boztepe Seyir Terası', 'Boztepe, Ortahisar, Trabzon', 'park'],
  ['Trabzon', 'Trabzon Sahil Parkı', 'Ganita, Ortahisar, Trabzon', 'park'],
  ['Eskişehir', 'Adalar', 'Adalar, Odunpazarı, Eskişehir', 'park'],
  ['Eskişehir', 'Espark AVM', 'Espark, Tepebaşı, Eskişehir', 'avm'],
  ['Eskişehir', 'Sazova Parkı', 'Sazova Parkı, Eskişehir', 'park'],
  ['Eskişehir', 'Kentpark Eskişehir', 'Kentpark, Tepebaşı, Eskişehir', 'park'],
];

let last = 0;
async function search(q) {
  const qs = new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'tr', addressdetails: '1', limit: '5' });
  const url = `https://nominatim.openstreetmap.org/search?${qs}`;
  if (cache[url]) return cache[url];
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  cache[url] = await res.json();
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
  return cache[url];
}

const slug = (s) => trKey(s).slice(0, 40);

const seed = JSON.parse(readFileSync(SEED, 'utf8'));
// Mevcut kayıtlar: il eklenir, ilçe yazımı listedeki biçime getirilir
for (const p of seed) {
  if (p.province && p.district) continue;
  const loc = resolveLocation({ district: p.district, near: p });
  if (typeof loc === 'string') log(`il çıkarılamadı: ${p.id} (${p.district}) — ${loc}`);
  else Object.assign(p, loc);
}

let added = 0;
for (const [il, name, q, category] of PLACES) {
  const province = findProvince(il);
  const hits = await search(q);
  // İlk sonuçlardan ili tutan ve ilçesi listede olan
  const hit = hits.find((h) => Object.values(h.address ?? {}).some((v) => trKey(v) === trKey(il)));
  const district = hit && Object.values(hit.address).map((v) => province.ilceler.find((d) => trKey(d) === trKey(v))).find(Boolean);
  if (!hit || !district) {
    log(`ATLANDI: ${il} / ${name} — sorgu: "${q}" (${hits.length} sonuç, il/ilçe doğrulanamadı)`);
    continue;
  }
  const id = `seed-tr-${slug(il)}-${slug(name)}`;
  const entry = {
    id, name, category, province: province.il, district,
    address: [hit.address.road, hit.address.suburb ?? hit.address.neighbourhood].filter(Boolean).join(', ') || null,
    lat: Number(Number(hit.lat).toFixed(7)), lng: Number(Number(hit.lon).toFixed(7)),
    hours: null, accessible: false, babyChanging: false, toiletType: null, publicAccess: null,
    osm: { type: hit.osm_type, id: hit.osm_id, display_name: hit.display_name }, approximate: false,
  };
  const i = seed.findIndex((p) => p.id === id);
  if (i >= 0) seed[i] = entry;
  else {
    seed.push(entry);
    added++;
  }
  log(`ok: ${il} / ${district} — ${name} (${entry.lat}, ${entry.lng})`);
}

writeFileSync(SEED, `${JSON.stringify(seed, null, 1)}\n`); // mevcut dosyanın biçimi (1 boşluk girinti)
log(`toplam ${seed.length} kayıt, ${added} yeni`);
