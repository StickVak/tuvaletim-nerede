import type { FilterChip, PlaceView, SortMode } from '../types';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const inRange = (from: number, to: number, now: number) => (from <= to ? now >= from && now < to : now >= from || now < to);

/** "Mo-Fr" / "Sa,Su" / "Mo" → gün indeksleri */
function parseDays(spec: string): number[] | null {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map((d) => DAYS.indexOf(d.trim()));
    if (a < 0 || (b !== undefined && b < 0)) return null;
    if (b === undefined) out.push(a);
    else for (let d = a; ; d = (d + 1) % 7) {
      out.push(d);
      if (d === b) break;
    }
  }
  return out;
}

/**
 * Çalışma saatine göre şu an açık mı? Bilinmeyen biçimde null.
 * Desteklenen: "10:00 – 22:00", "22:00-02:00", "24 saat", "24/7", OSM "Mo-Fr 09:00-18:00; Sa 10:00-14:00", "Mo off".
 */
export function isOpenNow(hours: string | null, now: Date = new Date()): boolean | null {
  if (!hours) return null;
  const h = hours.trim();
  if (/^(24\s*saat|24\/7)$/i.test(h)) return true;
  const minute = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  const yesterday = (today + 6) % 7;
  const RANGE = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g;

  // Gün belirtilmemiş basit aralık(lar)
  if (/^[\d:\s,–-]+$/.test(h)) {
    const ranges = [...h.matchAll(RANGE)];
    return ranges.length ? ranges.some((m) => inRange(toMin(m[1]), toMin(m[2]), minute)) : null;
  }

  let open = false;
  let understood = false;
  for (const rule of h.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = /^([A-Za-z,-]+)\s+(.+)$/.exec(rule);
    const days = m && parseDays(m[1]);
    if (!m || !days) return null;
    understood = true;
    if (/^off$/i.test(m[2])) {
      if (days.includes(today)) open = false;
      continue;
    }
    for (const r of m[2].matchAll(RANGE)) {
      const from = toMin(r[1]);
      const to = toMin(r[2]);
      if (days.includes(today) && (from <= to ? inRange(from, to, minute) : minute >= from)) open = true;
      // gece yarısını geçen dünkü aralık
      if (from > to && days.includes(yesterday) && minute < to) open = true;
    }
  }
  return understood ? open : null;
}

const CHIP_TEST: Record<FilterChip, (p: PlaceView, now: Date) => boolean> = {
  free: (p) => !p.stats.isPaid,
  accessible: (p) => p.accessible,
  baby: (p) => p.babyChanging,
  open: (p, now) => isOpenNow(p.hours, now) === true,
  public: (p) => p.publicAccess,
  alafranga: (p) => p.toiletType === 'alafranga' || p.toiletType === 'ikisi',
  alaturka: (p) => p.toiletType === 'alaturka' || p.toiletType === 'ikisi',
  favorites: (p) => p.isFavorite,
};

/** Seçili tüm çiplere uyan mekanlar (VE) */
export function applyFilters(places: PlaceView[], chips: FilterChip[], now: Date = new Date()): PlaceView[] {
  return places.filter((p) => chips.every((c) => CHIP_TEST[c](p, now)));
}

const byDistance = (a: PlaceView, b: PlaceView) =>
  a.distance !== null && b.distance !== null ? a.distance - b.distance : a.name.localeCompare(b.name, 'tr');

/** En ucuz: ücretsizler, sonra ortalama ücreti bilinen ücretliler (artan), en son ücreti bilinmeyenler */
const priceRank = (p: PlaceView) => (!p.stats.isPaid ? 0 : p.stats.avgPrice ?? Infinity);

export function sortPlaces(places: PlaceView[], sort: SortMode): PlaceView[] {
  const cmp: Record<SortMode, (a: PlaceView, b: PlaceView) => number> = {
    distance: byDistance,
    cleanliness: (a, b) => b.stats.cleanliness - a.stats.cleanliness || b.stats.voteCount - a.stats.voteCount || byDistance(a, b),
    cheapest: (a, b) => priceRank(a) - priceRank(b) || byDistance(a, b),
    popular: (a, b) => b.stats.voteCount - a.stats.voteCount || byDistance(a, b),
  };
  return [...places].sort(cmp[sort]);
}

export const SORT_LABELS: Record<SortMode, string> = {
  distance: 'En Yakın',
  cleanliness: 'En Temiz',
  cheapest: 'En Ucuz / Ücretsiz',
  popular: 'En Çok Oylanan',
};

export const CHIP_LABELS: Record<FilterChip, string> = {
  free: 'Ücretsiz',
  accessible: 'Engelli Erişimi',
  baby: 'Bebek Bakımı',
  open: 'Şu An Açık',
  public: 'Şifresiz / Herkese Açık',
  alafranga: 'Alafranga',
  alaturka: 'Alaturka',
  favorites: 'Favorilerim',
};
