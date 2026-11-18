/**
 * Mekan fotoğrafları diskte (server/data/photos) rastgele adlarla saklanır; veritabanında yalnızca dosya adı tutulur.
 * İstemci görseli tarayıcıda küçültüp JPEG'e sıkıştırarak data URL olarak gönderir (bkz. src/lib/image.ts).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHOTO_RE } from './validate.js';

export const PHOTO_FILE_RE = /^[a-f0-9]{32}\.(jpg|png|webp|gif)$/;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' };
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/** İlk baytlar bildirilen türle eşleşmeli (uzantısı değiştirilmiş betik/HTML reddedilir) */
export function magicOk(type, buf) {
  if (type === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'png') return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (type === 'gif') return buf.subarray(0, 4).toString('latin1') === 'GIF8';
  if (type === 'webp') return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

export class PhotoError extends Error {}

/** data URL'yi doğrulayıp dosyaya yazar; dosya adını döner. Geçersizse PhotoError. */
export function savePhoto(dir, dataUrl) {
  if (typeof dataUrl !== 'string' || !PHOTO_RE.test(dataUrl)) throw new PhotoError('Fotoğraf JPEG, PNG, WebP ya da GIF olmalı.');
  const type = dataUrl.match(/^data:image\/(\w+);/)[1];
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (!buf.length || buf.length > MAX_PHOTO_BYTES) throw new PhotoError('Fotoğraf en fazla 5 MB olabilir.');
  if (!magicOk(type, buf)) throw new PhotoError('Dosya içeriği bir görsel değil.');
  mkdirSync(dir, { recursive: true });
  const file = `${randomBytes(16).toString('hex')}.${EXT[type]}`;
  writeFileSync(join(dir, file), buf, { mode: 0o644 });
  return file;
}

export function removePhoto(dir, file) {
  if (file && PHOTO_FILE_RE.test(file) && existsSync(join(dir, file))) unlinkSync(join(dir, file));
}

/** Yalnızca bilinen ad kalıbındaki dosyalar, nosniff ile */
export function sendPhoto(res, dir, file, cache = 'public, max-age=86400') {
  if (!file || !PHOTO_FILE_RE.test(file) || !existsSync(join(dir, file))) return res.status(404).json({ error: 'Fotoğraf yok.' });
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': cache });
  res.type(MIME[file.split('.').pop()]).sendFile(join(dir, file));
}

/** Eski sürümlerde places/pending_places.photo sütununa gömülü base64 görselleri dosyaya taşır */
export function migrateInlinePhotos(db, dir) {
  for (const table of ['places', 'pending_places']) {
    const rows = db.all(`SELECT id, photo FROM ${table} WHERE photo IS NOT NULL`);
    for (const row of rows) {
      let file = null;
      try {
        file = savePhoto(dir, row.photo);
      } catch {
        /* geçersiz eski görsel: atılır */
      }
      db.run(`UPDATE ${table} SET photo = NULL, photo_file = ? WHERE id = ?`, [file, row.id]);
    }
  }
}
