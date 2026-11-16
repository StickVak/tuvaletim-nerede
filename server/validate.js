export const CATEGORIES = ['avm', 'kafe', 'belediye', 'park', 'diger'];
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
  const text = (k, max) => {
    if (!has(k)) return;
    const v = b[k] == null ? '' : String(b[k]).trim();
    if (v.length > max) throw `${k} en fazla ${max} karakter olabilir.`;
    out[k] = v || null;
  };
  try {
    if (has('name')) {
      const name = String(b.name ?? '').trim();
      if (name.length < 3 || name.length > 60) throw 'Mekan adı 3-60 karakter olmalı.';
      out.name = name;
    }
    if (has('category')) {
      if (!CATEGORIES.includes(b.category)) throw 'Geçersiz mekan türü.';
      out.category = b.category;
    }
    for (const [k, lim] of [['lat', 90], ['lng', 180]]) {
      if (!has(k)) continue;
      const n = typeof b[k] === 'number' ? b[k] : NaN;
      if (!Number.isFinite(n) || Math.abs(n) > lim) throw 'Geçerli bir konum seçin.';
      out[k] = n;
    }
    text('district', 60);
    text('address', 120);
    text('hours', 60);
    if (has('photo')) {
      const p = b.photo ?? null;
      if (p !== null && (typeof p !== 'string' || p.length > MAX_PHOTO_CHARS || !PHOTO_RE.test(p))) throw 'Fotoğraf JPEG, PNG, WebP ya da GIF olmalı (en fazla 5 MB).';
      out.photo = p;
    }
    for (const k of ['accessible', 'babyChanging']) if (has(k)) out[k] = !!b[k];
  } catch (msg) {
    return msg;
  }
  return out;
}
