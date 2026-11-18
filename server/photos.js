/**
 * Fotoğraf deposu (mekan dış mekan fotoğrafları ve profil fotoğrafları).
 *
 * - CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET tanımlıysa görsel Cloudinary'ye
 *   imzalı istekle yüklenir ve veritabanına kalıcı `secure_url` yazılır; silmede Cloudinary'den de silinir.
 * - Tanımlı değilse yerel diske (server/data/photos, server/data/avatars) rastgele adla yazılır.
 * Her iki durumda da içerik baytları bildirilen görsel türüyle eşleşmeli (SVG/HTML reddedilir).
 * Veritabanında iki tür referans bir arada bulunabilir (yerel dosya adı ya da https://res.cloudinary.com/... adresi).
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHOTO_RE } from './validate.js';

const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' };
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
/** Yerel dosya adı: [kullanıcıId-]rastgeleHex.uzantı */
export const LOCAL_FILE_RE = /^(\d+-)?[a-f0-9]{16,32}\.(jpg|png|webp|gif)$/;
const CLOUD_RE = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//;

/** İlk baytlar bildirilen türle eşleşmeli (uzantısı değiştirilmiş betik/HTML reddedilir) */
export function magicOk(type, buf) {
  if (type === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'png') return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (type === 'gif') return buf.subarray(0, 4).toString('latin1') === 'GIF8';
  if (type === 'webp') return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

export class PhotoError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** data URL'yi doğrular → { type, buf } */
export function decodePhoto(dataUrl, maxBytes) {
  if (typeof dataUrl !== 'string' || !PHOTO_RE.test(dataUrl)) throw new PhotoError('Fotoğraf JPEG, PNG, WebP ya da GIF olmalı.');
  const type = dataUrl.match(/^data:image\/(\w+);/)[1];
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (!buf.length) throw new PhotoError('Fotoğraf boş.');
  if (buf.length > maxBytes) throw new PhotoError(`Fotoğraf en fazla ${Math.round(maxBytes / 1024 / 1024)} MB olabilir.`, 413);
  if (!magicOk(type, buf)) throw new PhotoError('Dosya içeriği bir görsel değil.');
  return { type, buf };
}

/** CLOUDINARY_* üçü de varsa Cloudinary ayarı, yoksa null */
export function cloudinaryConfig(env = process.env) {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

/** İmzaya girmeyen parametreler (Cloudinary belgesi) */
const UNSIGNED = new Set(['file', 'api_key', 'cloud_name', 'resource_type']);

/** Cloudinary imzası: file/api_key/cloud_name/resource_type hariç parametreler alfabetik, k=v&… + api_secret → SHA-1 */
export function cloudinarySignature(params, apiSecret) {
  const base = Object.keys(params)
    .filter((k) => !UNSIGNED.has(k) && params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(base + apiSecret).digest('hex');
}

/** secure_url → public_id (…/image/upload/v123/klasor/ad.jpg → klasor/ad) */
export function publicIdFromUrl(url) {
  const m = String(url).match(/\/image\/upload\/(?:[^/]*,[^/]*\/)*(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i);
  return m ? m[1] : null;
}

/**
 * @param dir   yerel klasör (Cloudinary yoksa)
 * @param folder Cloudinary klasörü, ör. "tuvaletim/places"
 * @param cloudinary cloudinaryConfig() sonucu ya da null
 */
export function createPhotoStore({ dir, folder, cloudinary = null, maxBytes = 5 * 1024 * 1024, fetchImpl = fetch, log = console }) {
  const isCloud = (ref) => typeof ref === 'string' && CLOUD_RE.test(ref);
  const isLocal = (ref) => typeof ref === 'string' && LOCAL_FILE_RE.test(ref);

  async function cloudCall(action, params) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = { ...params, timestamp };
    const form = new FormData();
    for (const [k, v] of Object.entries(signed)) form.append(k, String(v));
    form.append('api_key', cloudinary.apiKey);
    form.append('signature', cloudinarySignature(signed, cloudinary.apiSecret));
    const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinary.cloudName)}/image/${action}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Cloudinary ${action} ${res.status}: ${body?.error?.message ?? ''}`);
    return body;
  }

  return {
    kind: cloudinary ? 'cloudinary' : 'local',
    isCloud,

    /** Doğrular ve kaydeder; referans döner (yerel dosya adı ya da Cloudinary secure_url). prefix yalnızca yerel adlarda. */
    async save(dataUrl, { prefix = '' } = {}) {
      const { type, buf } = decodePhoto(dataUrl, maxBytes);
      const id = randomBytes(16).toString('hex');
      if (cloudinary) {
        try {
          // Görsel olduğu doğrulanmış data URL doğrudan yüklenir; public_id bizim üretimimiz (tahmin edilemez)
          const r = await cloudCall('upload', { file: dataUrl, public_id: `${folder}/${prefix}${id}`, overwrite: 'false' });
          if (!isCloud(r.secure_url)) throw new Error('Cloudinary secure_url dönmedi.');
          return r.secure_url;
        } catch (e) {
          log.error?.('[foto] Cloudinary yükleme hatası:', e.message);
          throw new PhotoError('Fotoğraf yüklenemedi. Lütfen biraz sonra tekrar deneyin.', 502);
        }
      }
      mkdirSync(dir, { recursive: true });
      const file = `${prefix}${id}.${EXT[type]}`;
      writeFileSync(join(dir, file), buf, { mode: 0o644 });
      return file;
    },

    /** En iyi çabayla siler (hata işlemi durdurmaz, loglanır) */
    async remove(ref) {
      if (!ref) return;
      if (isCloud(ref)) {
        if (!cloudinary) return log.warn?.('[foto] Cloudinary ayarı yok; uzak görsel silinemedi:', ref);
        const publicId = publicIdFromUrl(ref);
        if (!publicId) return;
        try {
          await cloudCall('destroy', { public_id: publicId, invalidate: 'true' });
        } catch (e) {
          log.error?.('[foto] Cloudinary silme hatası:', e.message);
        }
        return;
      }
      if (isLocal(ref) && existsSync(join(dir, ref))) unlinkSync(join(dir, ref));
    },

    /** Yerel dosyayı nosniff ile sunar; Cloudinary görselini (otomatik biçim/kalite ile) oraya yönlendirir */
    send(res, ref, cache = 'public, max-age=86400') {
      if (isCloud(ref)) {
        res.set('Cache-Control', cache);
        return res.redirect(302, ref.replace('/image/upload/', '/image/upload/f_auto,q_auto/'));
      }
      if (!isLocal(ref) || !existsSync(join(dir, ref))) return res.status(404).json({ error: 'Fotoğraf yok.' });
      res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': cache });
      res.type(MIME[ref.split('.').pop()]).sendFile(join(dir, ref));
    },
  };
}

/** Eski sürümlerde places/pending_places.photo sütununa gömülü base64 görselleri depoya taşır */
export async function migrateInlinePhotos(db, store) {
  for (const table of ['places', 'pending_places']) {
    const rows = await db.all(`SELECT id, photo FROM ${table} WHERE photo IS NOT NULL`);
    for (const row of rows) {
      let ref = null;
      try {
        ref = await store.save(row.photo);
      } catch {
        /* geçersiz eski görsel: atılır */
      }
      await db.run(`UPDATE ${table} SET photo = NULL, photo_file = ? WHERE id = ?`, [ref, row.id]);
    }
  }
}
