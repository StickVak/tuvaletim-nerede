/**
 * İzmir seed verisini OpenStreetMap / Nominatim'den üretir.
 *   node scripts/geocode-seed.mjs > server/seed-places.json
 * Nominatim kullanım kuralı: saniyede en fazla 1 istek, tanımlayıcı User-Agent. Yanıtlar
 * scripts/.nominatim-cache.json'da önbelleğe alınır; rapor stderr'e yazılır.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const UA = 'tuvaletim-nerede-seed/1.0 (https://github.com/stickvak/tuvaletim-nerede)';
const CACHE_FILE = new URL('./.nominatim-cache.json', import.meta.url);
const PROVINCE = { west: 26.2, south: 37.8, east: 28.5, north: 39.45 };
const METRO = '26.95,38.55,27.35,38.25';
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
const log = (...a) => console.error(...a);

let last = 0;
async function search(params) {
  const qs = new URLSearchParams({ format: 'jsonv2', countrycodes: 'tr', addressdetails: '1', extratags: '1', limit: '40', ...params });
  const url = `https://nominatim.openstreetmap.org/search?${qs}`;
  if (cache[url]) return cache[url];
  let res;
  for (let attempt = 1; ; attempt++) {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status !== 429 || attempt > 3) break;
    log(`429 — ${attempt * 30} sn bekleniyor`);
    await new Promise((r) => setTimeout(r, attempt * 30000));
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  cache[url] = await res.json();
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
  return cache[url];
}

const box = (lat, lng, m) => {
  const d = m / 111000;
  const dl = d / Math.cos((lat * Math.PI) / 180);
  return `${lng - dl},${lat + d},${lng + dl},${lat - d}`;
};
const dist = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
const pt = (x) => ({ lat: Number(x.lat), lng: Number(x.lon) });
const short = (s) => (s ?? '').replace(/ Mahallesi$/, '');
const inIzmir = (x) => x.address?.province === 'İzmir';

function toPlace(x, overrides) {
  const a = x.address ?? {};
  const t = x.extratags ?? {};
  return {
    id: `osm-${x.osm_type[0]}${x.osm_id}`,
    name: x.name,
    category: 'diger',
    district: a.town || a.city_district || a.county || null,
    address: [a.road, a.suburb].filter(Boolean).join(', ') || null,
    lat: Math.round(Number(x.lat) * 1e7) / 1e7,
    lng: Math.round(Number(x.lon) * 1e7) / 1e7,
    hours: t.opening_hours ?? null,
    accessible: t.wheelchair === 'yes',
    babyChanging: t.changing_table === 'yes' || t.diaper === 'yes',
    // OSM toilets:position → alafranga (seated) / alaturka (squat) / ikisi
    toiletType: (() => {
      const pos = t['toilets:position'] ?? '';
      const seated = pos.includes('seated');
      const squat = pos.includes('squat');
      return seated && squat ? 'ikisi' : seated ? 'alafranga' : squat ? 'alaturka' : null;
    })(),
    // Şifresiz / herkese açık: OSM access; bilinmiyorsa null (sunucu tür varsayılanını kullanır)
    publicAccess: ['yes', 'permissive', 'public'].includes(t.access) ? true : ['customers', 'private', 'no'].includes(t.access) ? false : null,
    osm: { type: x.osm_type, id: x.osm_id, display_name: x.display_name },
    approximate: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------- 1) Adı verilen 24 nokta
const NAMED = [
  { id: 'seed-optimum-avm', name: 'İzmir Optimum AVM', category: 'avm', q: 'İzmir Optimum' },
  { id: 'seed-forum-bornova', name: 'Forum Bornova', category: 'avm', q: 'Forum Bornova' },
  { id: 'seed-istinyepark-izmir', name: 'İstinyePark İzmir', category: 'avm', q: 'İstinyePark İzmir' },
  { id: 'seed-agora-avm', name: 'Agora AVM', category: 'avm', q: 'Agora AVM' },
  { id: 'seed-hilltown-karsiyaka', name: 'Hilltown Karşıyaka', category: 'avm', q: 'Hilltown Karşıyaka' },
  { id: 'seed-mavibahce-avm', name: 'MaviBahçe AVM', category: 'avm', q: 'MaviBahçe' },
  { id: 'seed-konak-pier', name: 'Konak Pier', category: 'avm', q: 'Konak Pier' },
  { id: 'seed-point-bornova', name: 'Point Bornova', category: 'avm', q: 'Point Bornova' },
  { id: 'seed-ege-perla', name: 'Ege Perla', category: 'avm', q: 'Ege Perla' },
  { id: 'seed-starbucks-buca-tinaztepe', name: 'Starbucks Buca (Tınaztepe çevresi)', category: 'kafe', q: 'Starbucks', near: 'Dokuz Eylül Üniversitesi Tınaztepe', radius: 3000 },
  { id: 'seed-sirinyer-izban-kafe', name: 'Şirinyer İZBAN Çevresi Kafe', category: 'kafe', q: 'cafe', near: 'Şirinyer İstasyonu', radius: 500, keepOsmName: true },
  { id: 'seed-starbucks-kibris-sehitleri', name: 'Starbucks Alsancak Kıbrıs Şehitleri', category: 'kafe', q: 'Starbucks', near: 'Kıbrıs Şehitleri Caddesi', radius: 500 },
  { id: 'seed-starbucks-konak-pier', name: 'Starbucks Konak Pier', category: 'kafe', q: 'Starbucks', near: 'Konak Pier', radius: 300 },
  { id: 'seed-starbucks-bornova-kucukpark', name: 'Starbucks Bornova Küçükpark', category: 'kafe', q: 'Starbucks', near: 'Küçükpark, Bornova', radius: 700 },
  { id: 'seed-starbucks-karsiyaka-carsi', name: 'Starbucks Karşıyaka Çarşı', category: 'kafe', q: 'Starbucks', near: 'Karşıyaka Çarşı', radius: 600 },
  { id: 'seed-starbucks-bostanli', name: 'Starbucks Bostanlı Sahil', category: 'kafe', q: 'Starbucks', near: 'Bostanlı Vapur İskelesi', nearType: 'ferry_terminal', radius: 1000 },
  { id: 'seed-wc-buca-hasanaga', name: 'Buca Hasanağa Bahçesi Belediye WC', category: 'belediye', q: 'toilets', near: 'Hasanağa Parkı', nearType: 'park', radius: 500 },
  { id: 'seed-wc-sirinyer', name: 'Şirinyer Parkı / İZBAN Belediye WC', category: 'belediye', q: 'toilets', near: 'Şirinyer Parkı', radius: 600 },
  { id: 'seed-wc-konak-kemeralti', name: 'Konak Meydanı / Kemeraltı Girişi Belediye WC', category: 'belediye', q: 'toilets', near: 'Konak Meydanı', radius: 400 },
  { id: 'seed-wc-alsancak-gundogdu', name: 'Alsancak Kordon / Gündoğdu Belediye WC', category: 'belediye', q: 'toilets', near: 'Gündoğdu Meydanı', radius: 500 },
  { id: 'seed-wc-kulturpark', name: 'Kültürpark (Fuar) Belediye WC', category: 'belediye', q: 'toilets', near: 'Kültürpark', radius: 600 },
  { id: 'seed-wc-bornova-meydan', name: 'Bornova Merkez Meydan Belediye WC', category: 'belediye', q: 'toilets', near: 'Bornova Cumhuriyet Meydanı', radius: 500 },
  { id: 'seed-wc-karsiyaka-iskele', name: 'Karşıyaka İskele / Çarşı Belediye WC', category: 'belediye', q: 'toilets', near: 'Karşıyaka Vapur İskelesi', nearType: 'ferry_terminal', radius: 500 },
  { id: 'seed-wc-bostanli-sahil', name: 'Bostanlı Sahil Belediye WC', category: 'belediye', q: 'toilets', near: 'Bostanlı Vapur İskelesi', nearType: 'ferry_terminal', radius: 800 },
];

const named = [];
const usedOsm = new Set();
for (const n of NAMED) {
  let chosen = null;
  let landmark = null;
  let landmarkDistrict = null;
  if (n.near) {
    const lm = (await search({ q: n.near, viewbox: METRO, bounded: '1' })).find((x) => inIzmir(x) && (!n.nearType || x.type === n.nearType));
    if (!lm) throw new Error(`Referans noktası bulunamadı: ${n.near}`);
    landmark = pt(lm);
    landmarkDistrict = lm.address?.town || lm.address?.city_district || null;
    const hits = (await search({ q: n.q, viewbox: box(landmark.lat, landmark.lng, n.radius), bounded: '1' }))
      .filter((x) => inIzmir(x) && !usedOsm.has(`${x.osm_type}${x.osm_id}`) && (n.q !== 'cafe' || x.name))
      .sort((a, b) => dist(landmark, pt(a)) - dist(landmark, pt(b)));
    chosen = hits[0] ?? null;
  } else {
    chosen = (await search({ q: n.q, viewbox: METRO, bounded: '1' })).find(inIzmir) ?? null;
  }
  const base = { id: n.id, name: n.name, category: n.category };
  if (chosen) {
    usedOsm.add(`${chosen.osm_type}${chosen.osm_id}`);
    const p = toPlace(chosen, base);
    if (n.keepOsmName && chosen.name) p.name = `${chosen.name} (Şirinyer İZBAN)`;
    named.push(p);
    log(`✓ ${n.id.padEnd(34)} ${chosen.category}/${chosen.type} "${chosen.name}" ${landmark ? Math.round(dist(landmark, pt(chosen))) + ' m' : ''}  ${chosen.display_name.slice(0, 70)}`);
  } else if (landmark) {
    // Kullanıcı detayda konumun kesin olmadığını görsün
    named.push({ ...base, district: landmarkDistrict, address: `${n.near} çevresi (yaklaşık konum)`, lat: landmark.lat, lng: landmark.lng, hours: null, accessible: false, babyChanging: false, toiletType: null, publicAccess: null, osm: null, approximate: true });
    log(`~ ${n.id.padEnd(34)} OSM'de yakında "${n.q}" yok → referans noktası "${n.near}" kullanıldı (YAKLAŞIK)`);
  } else {
    throw new Error(`Bulunamadı: ${n.q}`);
  }
}

// ---------------------------------------------------------------- 2) İl geneli tarama
// shop=mall etiketli ama AVM olmayan kayıtlar (Türkçe 'İ' /i ile eşleşmediği için [iİ])
// "iş merkezi" yalnızca kelime başında: "Alışveriş Merkezi" elenmesin
const MALL_DENY = /(^|\s)[iİ]ş ?han|(^|\s)[iİ]ş merkezi|pazar|pasaj|çarşı|kültür merkezi|koçtaş|mektup|kidsmall|pirinç center|sanayi/i;
const normName = (s) => s.toLocaleLowerCase('tr').replace(/avm|alışveriş merkezi|izmir|\s+/g, '');
const TILE = 0.25;
const scanned = [];
for (let west = PROVINCE.west; west < PROVINCE.east; west += TILE) {
  for (let south = PROVINCE.south; south < PROVINCE.north; south += TILE) {
    const viewbox = `${west},${south + TILE},${west + TILE},${south}`;
    for (const q of ['mall', 'Starbucks', 'toilets']) {
      const exclude = [];
      for (let page = 0; page < 10; page++) {
        const res = await search({ q, viewbox, bounded: '1', ...(exclude.length ? { exclude_place_ids: exclude.join(',') } : {}) });
        for (const x of res) {
          exclude.push(x.place_id);
          if (inIzmir(x)) scanned.push({ q, x });
        }
        if (res.length < 40) break;
      }
    }
  }
}

const out = [...named];
const near = (p, category, m) => out.some((o) => o.category === category && dist(o, p) < m);
for (const { q, x } of scanned) {
  const key = `${x.osm_type}${x.osm_id}`;
  if (usedOsm.has(key)) continue;
  const p = pt(x);
  const a = x.address ?? {};
  const t = x.extratags ?? {};
  let place = null;
  const dupMall = () =>
    near(p, 'avm', 100) || out.some((o) => o.category === 'avm' && normName(o.name) === normName(x.name) && dist(o, p) < 1000);
  if (q === 'mall' && x.category === 'shop' && x.type === 'mall' && x.name && !MALL_DENY.test(x.name) && !dupMall()) {
    // Migros'un işlettiği AVM'ler (eski Kipa) OSM'de yalnızca "Migros" adıyla kayıtlı
    const district = a.town || a.city_district || a.county || '';
    place = toPlace(x, { category: 'avm', ...(/^migros$/i.test(x.name) ? { name: `Migros AVM ${district}`.trim() } : {}) });
  } else if (q === 'Starbucks' && /starbucks/i.test(x.name ?? '') && !near(p, 'kafe', 60)) {
    place = toPlace(x, { category: 'kafe', name: `Starbucks ${a.town ?? ''} – ${short(a.suburb) || a.road || ''}`.trim() });
  } else if (q === 'toilets' && x.type === 'toilets' && !['private', 'no', 'customers'].includes(t.access) && !out.some((o) => dist(o, p) < 25)) {
    const municipal = /belediye/i.test(`${t.operator ?? ''} ${x.name ?? ''}`);
    place = toPlace(x, {
      category: municipal ? 'belediye' : 'diger',
      name: x.name || `${municipal ? 'Belediye Tuvaleti' : 'Umumi Tuvalet'} – ${short(a.suburb) || a.town || 'İzmir'}`,
    });
  }
  if (place) {
    usedOsm.add(key);
    out.push(place);
  }
}

// Aynı adı taşıyan farklı tuvaletleri ayırt et
const seen = new Map();
for (const p of out) {
  const n = (seen.get(p.name) ?? 0) + 1;
  seen.set(p.name, n);
  if (n > 1) p.name = `${p.name} (${n})`;
}

const count = (c) => out.filter((p) => p.category === c).length;
log(`\nToplam ${out.length} mekan · AVM ${count('avm')} · Kafe ${count('kafe')} · Belediye ${count('belediye')} · Diğer ${count('diger')}`);
log(`Yaklaşık konum: ${out.filter((p) => p.approximate).map((p) => p.id).join(', ') || 'yok'}`);
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
