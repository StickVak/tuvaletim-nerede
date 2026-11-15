import type { FeeType, LatLng, Place, ToiletCategory } from '../types';

/**
 * Soğuk başlangıç (seed) verileri.
 * Koordinatlar yaklaşık konumlardır; puanlar, oy sayıları ve saatler TEMSİLİDİR (gerçek kullanıcı verisi değildir).
 */

/** Konum izni yoksa / örnek verilere çok uzaksanız kullanılan demo konumu: İzmir, Alsancak */
export const DEMO_LOCATION: LatLng = { lat: 38.4362, lng: 27.1428 };
export const DEMO_LOCATION_LABEL = 'İzmir, Alsancak';

interface SeedRow {
  name: string;
  category: ToiletCategory;
  city: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
  fee: FeeType;
  price?: string;
  /** ortalama temizlik, ortalama konfor, oy sayısı */
  r: [number, number, number];
  hours: string;
  accessible?: boolean;
  baby?: boolean;
}

const AVM_HOURS = '10:00 – 22:00';

const ROWS: SeedRow[] = [
  // ---------------- İZMİR ----------------
  { name: 'Optimum AVM İzmir', category: 'avm', city: 'İzmir', district: 'Gaziemir', address: 'Akçay Cd., Gaziemir', lat: 38.3318, lng: 27.1345, fee: 'free', r: [4.6, 4.5, 214], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Forum Bornova', category: 'avm', city: 'İzmir', district: 'Bornova', address: 'Kazımdirik Mh., Bornova', lat: 38.4492, lng: 27.2105, fee: 'free', r: [4.5, 4.4, 187], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'İstinyePark İzmir', category: 'avm', city: 'İzmir', district: 'Balçova', address: 'Mithatpaşa Cd., Balçova', lat: 38.3906, lng: 27.0473, fee: 'free', r: [4.9, 4.8, 263], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Hilltown Karşıyaka', category: 'avm', city: 'İzmir', district: 'Karşıyaka', address: 'Örnekköy, Karşıyaka', lat: 38.4825, lng: 27.115, fee: 'free', r: [4.7, 4.6, 158], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Agora AVM', category: 'avm', city: 'İzmir', district: 'Balçova', address: 'Mithatpaşa Cd., Balçova', lat: 38.3887, lng: 27.0563, fee: 'free', r: [4.2, 4.1, 121], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Point Bornova', category: 'avm', city: 'İzmir', district: 'Bornova', address: 'Mustafa Kemal Cd., Bornova', lat: 38.4612, lng: 27.216, fee: 'free', r: [4.3, 4.0, 96], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Konak Pier', category: 'avm', city: 'İzmir', district: 'Konak', address: 'Atatürk Cd., Konak', lat: 38.4209, lng: 27.1268, fee: 'free', r: [4.4, 4.3, 88], hours: AVM_HOURS, accessible: true },
  { name: 'Mavibahçe AVM', category: 'avm', city: 'İzmir', district: 'Karşıyaka', address: 'Mavişehir, Karşıyaka', lat: 38.4692, lng: 27.082, fee: 'free', r: [4.5, 4.4, 134], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Starbucks Kıbrıs Şehitleri', category: 'kafe', city: 'İzmir', district: 'Konak', address: 'Kıbrıs Şehitleri Cd., Alsancak', lat: 38.4351, lng: 27.1442, fee: 'customers', r: [4.1, 3.9, 142], hours: '07:30 – 23:30' },
  { name: 'Kahve Dünyası Alsancak', category: 'kafe', city: 'İzmir', district: 'Konak', address: 'Kıbrıs Şehitleri Cd., Alsancak', lat: 38.4378, lng: 27.1433, fee: 'customers', r: [4.0, 3.8, 77], hours: '08:00 – 00:00' },
  { name: 'Espressolab Alsancak', category: 'kafe', city: 'İzmir', district: 'Konak', address: 'Talatpaşa Blv., Alsancak', lat: 38.4366, lng: 27.1468, fee: 'customers', r: [4.3, 4.2, 69], hours: '07:00 – 01:00' },
  { name: 'Kordon Gündoğdu Belediye WC', category: 'belediye', city: 'İzmir', district: 'Konak', address: 'Gündoğdu Meydanı, Kordon', lat: 38.4389, lng: 27.1389, fee: 'paid', price: '5 ₺', r: [3.4, 3.0, 203], hours: '07:00 – 23:00', accessible: true },
  { name: 'Konak Meydanı Belediye WC', category: 'belediye', city: 'İzmir', district: 'Konak', address: 'Saat Kulesi yanı, Konak', lat: 38.4189, lng: 27.1287, fee: 'paid', price: '5 ₺', r: [3.2, 2.9, 245], hours: '07:00 – 22:00', accessible: true },
  { name: 'Kemeraltı Kızlarağası Hanı Kafe', category: 'kafe', city: 'İzmir', district: 'Konak', address: 'Kızlarağası Hanı, Kemeraltı', lat: 38.4185, lng: 27.1335, fee: 'customers', r: [3.6, 3.4, 58], hours: '09:00 – 20:00' },
  { name: 'Kültürpark Belediye WC', category: 'park', city: 'İzmir', district: 'Konak', address: 'Kültürpark, Lozan Kapısı yanı', lat: 38.4296, lng: 27.1452, fee: 'free', r: [3.5, 3.1, 112], hours: '07:00 – 22:00', accessible: true },
  { name: 'Buca Hasanağa Bahçesi Belediye WC', category: 'park', city: 'İzmir', district: 'Buca', address: 'Hasanağa Bahçesi, Buca', lat: 38.3858, lng: 27.1738, fee: 'free', r: [3.8, 3.4, 97], hours: '08:00 – 22:00', accessible: true, baby: true },
  { name: 'Hasanağa Bahçesi Kafe', category: 'kafe', city: 'İzmir', district: 'Buca', address: 'Hasanağa Bahçesi, Buca', lat: 38.3864, lng: 27.1729, fee: 'customers', r: [4.0, 3.9, 64], hours: '08:00 – 23:00' },
  { name: 'Starbucks Buca', category: 'kafe', city: 'İzmir', district: 'Buca', address: 'Uğur Mumcu Cd., Buca', lat: 38.388, lng: 27.177, fee: 'customers', r: [4.2, 4.0, 53], hours: '07:30 – 23:00' },
  { name: 'Şirinyer İZBAN Durağı Kafe', category: 'kafe', city: 'İzmir', district: 'Buca', address: 'Şirinyer İZBAN istasyonu çevresi', lat: 38.395, lng: 27.15, fee: 'customers', r: [3.5, 3.2, 41], hours: '06:30 – 23:00' },
  { name: 'Espressolab Şirinyer', category: 'kafe', city: 'İzmir', district: 'Buca', address: 'Menderes Cd., Şirinyer', lat: 38.394, lng: 27.1515, fee: 'customers', r: [4.1, 4.0, 38], hours: '07:00 – 00:00' },
  { name: 'Kahve Dünyası Karşıyaka Çarşı', category: 'kafe', city: 'İzmir', district: 'Karşıyaka', address: 'Karşıyaka Çarşısı', lat: 38.456, lng: 27.1105, fee: 'customers', r: [3.9, 3.7, 71], hours: '08:00 – 23:30' },
  { name: 'Karşıyaka İskele Belediye WC', category: 'belediye', city: 'İzmir', district: 'Karşıyaka', address: 'Karşıyaka İskelesi', lat: 38.4552, lng: 27.117, fee: 'paid', price: '5 ₺', r: [3.3, 3.0, 118], hours: '07:00 – 23:00', accessible: true },
  { name: 'Starbucks Bornova Küçükpark', category: 'kafe', city: 'İzmir', district: 'Bornova', address: 'Küçükpark, Bornova', lat: 38.466, lng: 27.219, fee: 'customers', r: [4.0, 3.9, 66], hours: '07:30 – 23:30' },
  { name: 'Espressolab Göztepe', category: 'kafe', city: 'İzmir', district: 'Karabağlar', address: 'Mithatpaşa Cd., Göztepe', lat: 38.4002, lng: 27.0882, fee: 'customers', r: [4.2, 4.1, 47], hours: '07:00 – 01:00' },
  // ---------------- İSTANBUL ----------------
  { name: 'İstinyePark İstanbul', category: 'avm', city: 'İstanbul', district: 'Sarıyer', address: 'İstinye Bayırı Cd., Sarıyer', lat: 41.1103, lng: 29.0327, fee: 'free', r: [4.9, 4.8, 412], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Zorlu Center', category: 'avm', city: 'İstanbul', district: 'Beşiktaş', address: 'Levazım Mh., Beşiktaş', lat: 41.067, lng: 29.017, fee: 'free', r: [4.8, 4.7, 356], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Kanyon AVM', category: 'avm', city: 'İstanbul', district: 'Şişli', address: 'Büyükdere Cd., Levent', lat: 41.078, lng: 29.0108, fee: 'free', r: [4.6, 4.5, 298], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Cevahir AVM', category: 'avm', city: 'İstanbul', district: 'Şişli', address: 'Büyükdere Cd., Şişli', lat: 41.0627, lng: 28.9925, fee: 'free', r: [4.1, 4.0, 330], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Emaar Square Mall', category: 'avm', city: 'İstanbul', district: 'Üsküdar', address: 'Libadiye Cd., Çamlıca', lat: 41.0035, lng: 29.071, fee: 'free', r: [4.7, 4.6, 205], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Starbucks Kadıköy Bahariye', category: 'kafe', city: 'İstanbul', district: 'Kadıköy', address: 'Bahariye Cd., Kadıköy', lat: 40.989, lng: 29.0275, fee: 'customers', r: [3.9, 3.8, 121], hours: '07:30 – 00:00' },
  { name: 'Kahve Dünyası İstiklal', category: 'kafe', city: 'İstanbul', district: 'Beyoğlu', address: 'İstiklal Cd., Beyoğlu', lat: 41.035, lng: 28.98, fee: 'customers', r: [3.6, 3.5, 167], hours: '08:00 – 01:00' },
  { name: 'Espressolab Beşiktaş', category: 'kafe', city: 'İstanbul', district: 'Beşiktaş', address: 'Barbaros Blv., Beşiktaş', lat: 41.043, lng: 29.007, fee: 'customers', r: [4.1, 4.0, 89], hours: '07:00 – 01:00' },
  // ---------------- ANKARA ----------------
  { name: 'ANKAmall', category: 'avm', city: 'Ankara', district: 'Yenimahalle', address: 'Gazi Mh., Akköprü', lat: 39.95, lng: 32.832, fee: 'free', r: [4.3, 4.2, 241], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Armada AVM', category: 'avm', city: 'Ankara', district: 'Yenimahalle', address: 'Eskişehir Yolu, Söğütözü', lat: 39.913, lng: 32.809, fee: 'free', r: [4.6, 4.5, 198], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'CEPA AVM', category: 'avm', city: 'Ankara', district: 'Çankaya', address: 'Eskişehir Yolu, Çankaya', lat: 39.909, lng: 32.78, fee: 'free', r: [4.5, 4.4, 176], hours: AVM_HOURS, accessible: true, baby: true },
  { name: 'Starbucks Kızılay', category: 'kafe', city: 'Ankara', district: 'Çankaya', address: 'Atatürk Blv., Kızılay', lat: 39.9208, lng: 32.8541, fee: 'customers', r: [3.7, 3.6, 104], hours: '07:30 – 23:00' },
  { name: 'Espressolab Tunalı Hilmi', category: 'kafe', city: 'Ankara', district: 'Çankaya', address: 'Tunalı Hilmi Cd., Kavaklıdere', lat: 39.905, lng: 32.861, fee: 'customers', r: [4.2, 4.1, 62], hours: '07:00 – 01:00' },
  { name: 'Kuğulu Park Belediye WC', category: 'park', city: 'Ankara', district: 'Çankaya', address: 'Kuğulu Park, Kavaklıdere', lat: 39.9013, lng: 32.861, fee: 'paid', price: '5 ₺', r: [3.4, 3.1, 87], hours: '08:00 – 22:00', accessible: true },
];

function slug(s: string) {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function buildSeedPlaces(now = new Date()): Place[] {
  return ROWS.map((row, i) => {
    const [c, f, n] = row.r;
    const created = new Date(now.getTime() - (ROWS.length - i) * 86400000 * 3).toISOString();
    return {
      id: `seed-${slug(row.name)}`,
      name: row.name,
      category: row.category,
      city: row.city,
      district: row.district,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      fee: row.fee,
      price: row.price,
      hours: row.hours,
      accessible: row.accessible ?? false,
      babyChanging: row.baby ?? false,
      cleanlinessTotal: Math.round(c * n),
      comfortTotal: Math.round(f * n),
      ratingCount: n,
      source: 'seed',
      createdAt: created,
      updatedAt: created,
    };
  });
}
