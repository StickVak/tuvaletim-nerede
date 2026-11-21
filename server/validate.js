/**
 * Sunucu tarafı girdi doğrulama yardımcıları. İstemci doğrulaması yalnızca kolaylıktır; buradakiler bağlayıcıdır.
 * Hata metinleri kullanıcıya gösterilir: neyin yanlış olduğunu söyler, iç ayrıntı (SQL, yığın izi) içermez.
 */

/** Görünmez/kontrol karakterleri: C0/C1 kontrol, sıfır genişlikli, yön değiştirme (bidi) işaretleri, BOM */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/**
 * Metin alanını temizler: yalnızca string kabul edilir (sayı/dizi/nesne → null), Unicode NFC, görünmez karakterler
 * atılır, satır sonları multiline değilse boşluğa çevrilir, baş/son boşluk kırpılır.
 */
export function cleanText(v, { multiline = false } = {}) {
  if (typeof v !== 'string') return null;
  let s = v.normalize('NFC').replace(INVISIBLE, '');
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/[\t\r\n]+/g, ' ');
  return s.trim();
}

/**
 * İsteğe bağlı metin alanı: undefined/null/"" → null; string değilse ya da çok uzunsa hata metni (throw).
 * label: kullanıcıya gösterilecek alan adı.
 */
export function optionalText(v, max, label, opts) {
  if (v === undefined || v === null || v === '') return null;
  const s = cleanText(v, opts);
  if (s === null) throw `${label} metin olmalı.`;
  if (s.length > max) throw `${label} en fazla ${max} karakter olabilir.`;
  return s || null;
}

/** E-posta biçimi (RFC 5321 uzunlukları; pratik karakter kümesi). Küçük harfe çevrilmiş değer beklenir. */
export const EMAIL_FORMAT = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const isEmail = (v) => typeof v === 'string' && v.length <= 254 && EMAIL_FORMAT.test(v);

export const PASSWORD_MIN = 6;
/** scrypt'e çok uzun girdi verilip CPU harcatılmasın */
export const PASSWORD_MAX = 128;
export const PASSWORD_LENGTH = `Şifre ${PASSWORD_MIN}-${PASSWORD_MAX} karakter olmalı.`;
export const validPassword = (v) => typeof v === 'string' && v.length >= PASSWORD_MIN && v.length <= PASSWORD_MAX;

/** Mekan kimliği (seed: "osm-node-123", kullanıcı: "user-…") */
export const PLACE_ID_RE = /^[A-Za-z0-9_.:-]{1,100}$/;
/** Pozitif tamsayı kimlik (kullanıcı, cihaz) */
export const isPositiveInt = (v) => /^[1-9]\d{0,15}$/.test(String(v));

/** Express router.param işleyicileri: biçimi bozuk yol parametresi → 400 (veritabanına hiç gitmez) */
export const placeIdParam = (_req, res, next, v) => (PLACE_ID_RE.test(v) ? next() : res.status(400).json({ error: 'Geçersiz mekan kimliği.' }));
export const intIdParam = (_req, res, next, v) => (isPositiveInt(v) ? next() : res.status(400).json({ error: 'Geçersiz kimlik.' }));

import { readFileSync } from 'node:fs';
import { resolveLocation } from './turkey.js';

/** Türkiye + kıyı/kara sınırı payı (enlem/boylam) */
export const TURKEY_BOX = { south: 35.5, north: 42.5, west: 25.5, east: 45.0 };

/** Mekan türleri: tek kaynak src/data/categories.json (istemci de aynı dosyayı kullanır) */
export const CATEGORIES = JSON.parse(readFileSync(new URL('../src/data/categories.json', import.meta.url), 'utf8')).map((c) => c.id);
const MAX_PHOTO_CHARS = 7_000_000; // ~5 MB base64
/** Yalnızca raster görseller: SVG aynı kökenden sunulunca betik çalıştırabilir */
export const PHOTO_RE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/**
 * Mekan alanlarını doğrular. Hata metni ya da temizlenmiş alanlar döner.
 * partial=true: yalnızca gönderilen alanlar doğrulanır ve döner (admin düzenleme).
 */
export function parsePlaceFields(body, { partial = false } = {}) {
  const b = body ?? {};
  const has = (k) => !partial || b[k] !== undefined;
  const out = {};
  const LABELS = { address: 'Adres', hours: 'Çalışma saatleri' };
  const text = (k, max) => {
    if (!has(k)) return;
    out[k] = optionalText(b[k], max, LABELS[k] ?? k);
  };
  try {
    if (has('name')) {
      const name = cleanText(b.name);
      if (name === null || name.length < 3 || name.length > 60) throw 'Mekan adı 3-60 karakter olmalı.';
      out.name = name;
    }
    if (has('category')) {
      if (!CATEGORIES.includes(b.category)) throw 'Geçersiz mekan türü.';
      out.category = b.category;
    }
    // Konum: sayı olmalı ve Türkiye sınırları (+ kıyı payı) içinde olmalı
    for (const [k, min, max] of [['lat', TURKEY_BOX.south, TURKEY_BOX.north], ['lng', TURKEY_BOX.west, TURKEY_BOX.east]]) {
      if (!has(k)) continue;
      const n = typeof b[k] === 'number' ? b[k] : NaN;
      if (!Number.isFinite(n)) throw 'Geçerli bir konum seçin.';
      if (n < min || n > max) throw 'Konum Türkiye sınırları içinde olmalı.';
      out[k] = n;
    }
    // İl / ilçe: listeden (src/data/turkiye.json); büyük/küçük harf ve Türkçe karakter farkı tolere edilir, listedeki yazıma çevrilir
    if (has('province') || has('district')) {
      for (const k of ['province', 'district']) if (b[k] != null && typeof b[k] !== 'string') throw 'Geçersiz il/ilçe.';
      const loc = resolveLocation({ province: b.province, district: b.district, near: typeof b.lat === 'number' ? { lat: b.lat, lng: b.lng } : null });
      if (typeof loc === 'string') throw loc;
      out.province = loc.province;
      out.district = loc.district;
    }
    text('address', 120);
    text('hours', 60);
    if (has('photo')) {
      const p = b.photo ?? null;
      if (p !== null && (typeof p !== 'string' || p.length > MAX_PHOTO_CHARS || !PHOTO_RE.test(p))) throw 'Fotoğraf JPEG, PNG, WebP ya da GIF olmalı (en fazla 5 MB).';
      out.photo = p;
    }
    for (const k of ['accessible', 'babyChanging']) {
      if (!has(k)) continue;
      if (b[k] != null && typeof b[k] !== 'boolean') throw 'Geçersiz seçim.';
      out[k] = !!b[k];
    }
    if (b.publicAccess != null && typeof b.publicAccess !== 'boolean') throw 'Geçersiz seçim.';
    if (b.publicAccess !== undefined || !partial) out.publicAccess = b.publicAccess == null ? null : !!b.publicAccess;
    if (b.toiletType !== undefined) {
      if (b.toiletType !== null && !['alafranga', 'alaturka', 'ikisi'].includes(b.toiletType)) throw 'Geçersiz tuvalet tipi.';
      out.toiletType = b.toiletType;
    }
  } catch (msg) {
    return msg;
  }
  return out;
}
