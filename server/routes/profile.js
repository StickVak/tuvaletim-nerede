import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword, publicUser, requireUser, verifyPassword } from '../auth.js';
import { PHOTO_RE } from '../validate.js';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' };
const AVATAR_FILE_RE = /^\d+-[a-f0-9]+\.(jpg|png|webp|gif)$/;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/** İlk baytlar bildirilen türle eşleşmeli (uzantısı değiştirilmiş betik/HTML reddedilir) */
function magicOk(type, buf) {
  if (type === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'png') return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (type === 'gif') return buf.subarray(0, 4).toString('latin1') === 'GIF8';
  if (type === 'webp') return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

const avatarPath = (dir, url) => (url && url.startsWith('/api/avatars/') ? join(dir, url.split('/').pop()) : null);

function removeAvatar(dir, url) {
  const p = avatarPath(dir, url);
  if (p && existsSync(p)) unlinkSync(p);
}

function profileUser(u) {
  return { ...publicUser(u), bio: u.bio ?? '', createdAt: u.created_at, isDemo: !!u.is_demo };
}

function counts(db, id) {
  const n = (sql) => db.get(sql, [id]).n;
  return {
    votes: n('SELECT COUNT(*) AS n FROM votes WHERE user_id = ?'),
    comments: n('SELECT COUNT(*) AS n FROM votes WHERE user_id = ? AND comment IS NOT NULL'),
    placesAdded: n('SELECT COUNT(*) AS n FROM places WHERE added_by = ?'),
  };
}

const reviewJson = (v) => ({
  placeId: v.place_id,
  placeName: v.place_name,
  cleanliness: v.cleanliness,
  comfort: v.comfort,
  isPaid: !!v.is_paid,
  priceAmount: v.price_amount,
  comment: v.comment,
  updatedAt: v.updated_at,
});

export function profileRoutes(db, { avatarDir, writeLimit }) {
  const r = Router();
  r.use(requireUser);
  const me = (req) => db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);

  r.get('/', (req, res) => {
    const id = req.user.id;
    const at = (row, kind, extra = {}) => ({ kind, placeId: row.place_id, placeName: row.place_name, at: row.at, ...extra });
    const activity = [
      ...db.all(`SELECT v.*, p.name AS place_name, v.updated_at AS at FROM votes v JOIN places p ON p.id = v.place_id WHERE v.user_id = ?`, [id])
        .map((v) => at(v, 'vote', { cleanliness: v.cleanliness, comfort: v.comfort, isPaid: !!v.is_paid, priceAmount: v.price_amount, comment: v.comment })),
      ...db.all(`SELECT s.*, p.name AS place_name, s.created_at AS at FROM status_reports s JOIN places p ON p.id = s.place_id WHERE s.user_id = ?`, [id])
        .map((s) => at(s, 'report', { reportType: s.report_type })),
      ...db.all(`SELECT f.place_id, p.name AS place_name, f.created_at AS at FROM favorites f JOIN places p ON p.id = f.place_id WHERE f.user_id = ?`, [id])
        .map((f) => at(f, 'favorite')),
      ...db.all(`SELECT id AS place_id, name AS place_name, created_at AS at FROM places WHERE added_by = ?`, [id]).map((p) => at(p, 'place')),
      ...db.all(`SELECT id AS place_id, name AS place_name, submitted_at AS at FROM pending_places WHERE user_id = ?`, [id]).map((p) => at(p, 'pending')),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 30);
    res.json({
      user: profileUser(me(req)),
      stats: {
        ...counts(db, id),
        pending: db.get('SELECT COUNT(*) AS n FROM pending_places WHERE user_id = ?', [id]).n,
        favorites: db.get('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?', [id]).n,
      },
      activity,
    });
  });

  r.patch('/', writeLimit, (req, res) => {
    const b = req.body ?? {};
    const sets = {};
    if (b.displayName !== undefined) {
      const v = String(b.displayName).trim();
      if (v.length < 1 || v.length > 40) return res.status(400).json({ error: 'Görünen ad 1-40 karakter olmalı.' });
      sets.display_name = v;
    }
    if (b.bio !== undefined) {
      const v = String(b.bio ?? '').trim();
      if (v.length > 160) return res.status(400).json({ error: 'Biyografi en fazla 160 karakter olabilir.' });
      sets.bio = v || null;
    }
    const keys = Object.keys(sets);
    if (keys.length) db.run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => sets[k]), req.user.id]);
    res.json({ user: profileUser(me(req)) });
  });

  r.post('/password', writeLimit, (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!verifyPassword(currentPassword ?? '', me(req).password_hash)) return res.status(400).json({ error: 'Mevcut şifre hatalı.' });
    if (String(newPassword ?? '').length < 6) return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı.' });
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(String(newPassword)), req.user.id]);
    res.status(204).end();
  });

  r.put('/avatar', writeLimit, (req, res) => {
    const image = req.body?.image;
    if (typeof image !== 'string' || !PHOTO_RE.test(image)) return res.status(400).json({ error: 'Profil fotoğrafı JPEG, PNG, WebP ya da GIF olmalı.' });
    const type = image.match(/^data:image\/(\w+);/)[1];
    const buf = Buffer.from(image.split(',')[1], 'base64');
    if (buf.length > MAX_AVATAR_BYTES) return res.status(413).json({ error: 'Profil fotoğrafı en fazla 2 MB olabilir.' });
    if (!magicOk(type, buf)) return res.status(400).json({ error: 'Dosya içeriği bir görsel değil.' });
    mkdirSync(avatarDir, { recursive: true });
    const file = `${req.user.id}-${randomBytes(8).toString('hex')}.${EXT[type]}`;
    writeFileSync(join(avatarDir, file), buf);
    removeAvatar(avatarDir, me(req).avatar_url);
    db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [`/api/avatars/${file}`, req.user.id]);
    res.json({ user: profileUser(me(req)) });
  });

  r.delete('/avatar', writeLimit, (req, res) => {
    removeAvatar(avatarDir, me(req).avatar_url);
    db.run('UPDATE users SET avatar_url = NULL WHERE id = ?', [req.user.id]);
    res.json({ user: profileUser(me(req)) });
  });

  return r;
}

/** Herkese açık profil: şifre, e-posta, rol gibi hiçbir gizli alan dönmez */
export function userRoutes(db) {
  const r = Router();
  r.get('/:id', (req, res) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', [Number(req.params.id)]);
    if (!u) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const reviews = db.all(
      `SELECT v.*, p.name AS place_name FROM votes v JOIN places p ON p.id = v.place_id WHERE v.user_id = ? ORDER BY v.updated_at DESC LIMIT 50`,
      [u.id],
    );
    res.json({
      id: u.id,
      username: u.username,
      displayName: u.display_name || u.username,
      avatarUrl: u.avatar_url ?? null,
      bio: u.bio ?? '',
      createdAt: u.created_at,
      isDemo: !!u.is_demo,
      stats: counts(db, u.id),
      reviews: reviews.map(reviewJson),
    });
  });
  return r;
}

/** Avatar dosyaları: yalnızca bilinen ad kalıbı, nosniff */
export function avatarRoutes(avatarDir) {
  const r = Router();
  r.get('/:file', (req, res) => {
    const file = req.params.file;
    if (!AVATAR_FILE_RE.test(file) || !existsSync(join(avatarDir, file))) return res.status(404).json({ error: 'Bulunamadı.' });
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.type(MIME[file.split('.').pop()]).sendFile(join(avatarDir, file));
  });
  return r;
}
