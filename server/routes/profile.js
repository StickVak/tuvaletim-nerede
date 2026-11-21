import { existsSync } from 'node:fs';
import { PASSWORD_LENGTH, PASSWORD_MAX, cleanText, intIdParam, optionalText, validPassword } from '../validate.js';
import { join } from 'node:path';
import { asyncRouter } from '../async.js';
import { hashPassword, publicUser, requireUser, verifyPassword } from '../auth.js';
import { contributionsOf } from './places.js';
import { PhotoError } from '../photos.js';
import { USERNAME_INVALID, USERNAME_RE, conflictFromDbError, identityConflict, usernameKey } from '../identity.js';

const AVATAR_FILE_RE = /^\d+-[a-f0-9]+\.(jpg|png|webp|gif)$/;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

function profileUser(u) {
  return { ...publicUser(u), bio: u.bio ?? '', createdAt: u.created_at };
}

async function counts(db, id) {
  const n = async (sql) => (await db.get(sql, [id])).n;
  const [votes, comments, placesAdded] = await Promise.all([
    n('SELECT COUNT(*) AS n FROM votes WHERE user_id = ?'),
    n('SELECT COUNT(*) AS n FROM votes WHERE user_id = ? AND comment IS NOT NULL'),
    n('SELECT COUNT(*) AS n FROM places WHERE added_by = ?'),
  ]);
  return { votes, comments, placesAdded };
}

/** users.avatar_url → depo referansı (yerel: /api/avatars/<dosya> → <dosya>; Cloudinary: tam adres) */
const avatarRef = (url) => (url && url.startsWith('/api/avatars/') ? url.split('/').pop() : url);

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

/** avatars: createPhotoStore() — Cloudinary ya da server/data/avatars */
const pass = (_req, _res, next) => next();
export function profileRoutes(db, { avatars, writeLimit, uploadLimit = pass }) {
  const r = asyncRouter();
  r.use(requireUser);
  const me = (req) => db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);

  r.get('/', async (req, res) => {
    const id = req.user.id;
    const at = (row, kind, extra = {}) => ({ kind, placeId: row.place_id, placeName: row.place_name, at: row.at, ...extra });
    const [votes, reports, favorites, places, pending, user, c, pendingN, favoritesN, contributions] = await Promise.all([
      db.all(`SELECT v.*, p.name AS place_name, v.updated_at AS at FROM votes v JOIN places p ON p.id = v.place_id WHERE v.user_id = ?`, [id]),
      db.all(`SELECT s.*, p.name AS place_name, s.created_at AS at FROM status_reports s JOIN places p ON p.id = s.place_id WHERE s.user_id = ?`, [id]),
      db.all(`SELECT f.place_id, p.name AS place_name, f.created_at AS at FROM favorites f JOIN places p ON p.id = f.place_id WHERE f.user_id = ?`, [id]),
      db.all(`SELECT id AS place_id, name AS place_name, created_at AS at FROM places WHERE added_by = ?`, [id]),
      db.all(`SELECT id AS place_id, name AS place_name, submitted_at AS at FROM pending_places WHERE user_id = ?`, [id]),
      me(req),
      counts(db, id),
      db.get('SELECT COUNT(*) AS n FROM pending_places WHERE user_id = ?', [id]),
      db.get('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?', [id]),
      contributionsOf(db, id),
    ]);
    const activity = [
      ...votes.map((v) => at(v, 'vote', { cleanliness: v.cleanliness, comfort: v.comfort, isPaid: !!v.is_paid, priceAmount: v.price_amount, comment: v.comment })),
      ...reports.map((s) => at(s, 'report', { reportType: s.report_type })),
      ...favorites.map((f) => at(f, 'favorite')),
      ...places.map((p) => at(p, 'place')),
      ...pending.map((p) => at(p, 'pending')),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 30);
    res.json({
      user: profileUser(user),
      stats: { ...c, pending: pendingN.n, favorites: favoritesN.n, contributions },
      activity,
    });
  });

  r.patch('/', writeLimit, async (req, res) => {
    const b = req.body ?? {};
    const sets = {};
    if (b.username !== undefined) {
      // Kullanıcı adı değiştirme: biçim + benzersizlik (büyük/küçük harf duyarsız; kendi adının harf değişimi serbest)
      const v = cleanText(b.username);
      if (v === null || !USERNAME_RE.test(v)) return res.status(400).json({ error: USERNAME_INVALID, field: 'username' });
      const c = await identityConflict(db, { username: v, exceptUserId: req.user.id });
      if (c) return res.status(c.status).json({ error: c.error, field: c.field });
      sets.username = v;
      sets.username_key = usernameKey(v);
    }
    if (b.displayName !== undefined) {
      const v = cleanText(b.displayName);
      if (v === null || v.length < 1 || v.length > 40) return res.status(400).json({ error: 'Görünen ad 1-40 karakter olmalı.', field: 'displayName' });
      sets.display_name = v;
    }
    if (b.bio !== undefined) {
      try {
        sets.bio = optionalText(b.bio, 160, 'Biyografi', { multiline: true });
      } catch (msg) {
        return res.status(400).json({ error: msg, field: 'bio' });
      }
    }
    const keys = Object.keys(sets);
    if (keys.length) {
      try {
        await db.run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => sets[k]), req.user.id]);
      } catch (e) {
        const c = conflictFromDbError(e);
        if (c) return res.status(c.status).json({ error: c.error, field: c.field });
        throw e;
      }
    }
    res.json({ user: profileUser(await me(req)) });
  });

  r.post('/password', writeLimit, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || currentPassword.length > PASSWORD_MAX || !verifyPassword(currentPassword, (await me(req)).password_hash)) {
      return res.status(400).json({ error: 'Mevcut şifre hatalı.' });
    }
    if (!validPassword(newPassword)) return res.status(400).json({ error: `Yeni ${PASSWORD_LENGTH.charAt(0).toLowerCase()}${PASSWORD_LENGTH.slice(1)}` });
    // Güvenlik: şifre değişince bu cihaz dışındaki güvenilir cihazlar iptal edilir ve eski erişim belirteçleri geçersizleşir.
    // Bu cihaz (güvenilirse) istemcinin sessiz oturum tazelemesiyle kesintisiz devam eder.
    const now = new Date().toISOString();
    await db.batch([
      ['UPDATE users SET password_hash = ?, tokens_valid_after = ? WHERE id = ?', [hashPassword(newPassword), now, req.user.id]],
      ['UPDATE trusted_devices SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?', [now, req.user.id, req.auth?.deviceId ?? -1]],
    ]);
    res.status(204).end();
  });

  r.put('/avatar', writeLimit, uploadLimit, async (req, res) => {
    let ref;
    try {
      ref = await avatars.save(req.body?.image, { prefix: `${req.user.id}-` });
    } catch (e) {
      if (!(e instanceof PhotoError)) throw e;
      const msg = e.status === 413 ? 'Profil fotoğrafı en fazla 2 MB olabilir.' : /JPEG/.test(e.message) ? 'Profil fotoğrafı JPEG, PNG, WebP ya da GIF olmalı.' : e.message;
      return res.status(e.status).json({ error: msg });
    }
    const old = (await me(req)).avatar_url;
    await db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatars.isCloud(ref) ? ref : `/api/avatars/${ref}`, req.user.id]);
    await avatars.remove(avatarRef(old));
    res.json({ user: profileUser(await me(req)) });
  });

  r.delete('/avatar', writeLimit, async (req, res) => {
    const old = (await me(req)).avatar_url;
    await db.run('UPDATE users SET avatar_url = NULL WHERE id = ?', [req.user.id]);
    await avatars.remove(avatarRef(old));
    res.json({ user: profileUser(await me(req)) });
  });

  return r;
}

/** Herkese açık profil: şifre, e-posta, rol gibi hiçbir gizli alan dönmez */
export function userRoutes(db) {
  const r = asyncRouter();
  r.param('id', intIdParam);
  r.get('/:id', async (req, res) => {
    const u = await db.get('SELECT * FROM users WHERE id = ?', [Number(req.params.id)]);
    if (!u) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const [reviews, stats] = await Promise.all([
      db.all(
        `SELECT v.*, p.name AS place_name FROM votes v JOIN places p ON p.id = v.place_id WHERE v.user_id = ? ORDER BY v.updated_at DESC LIMIT 50`,
        [u.id],
      ),
      counts(db, u.id),
    ]);
    res.json({
      id: u.id,
      username: u.username,
      displayName: u.display_name || u.username,
      avatarUrl: u.avatar_url ?? null,
      bio: u.bio ?? '',
      createdAt: u.created_at,
      stats,
      reviews: reviews.map(reviewJson),
    });
  });
  return r;
}

/** Yerel avatar dosyaları: yalnızca bilinen ad kalıbı, nosniff */
export function avatarRoutes(avatarDir) {
  const r = asyncRouter();
  r.get('/:file', (req, res) => {
    const file = req.params.file;
    if (!AVATAR_FILE_RE.test(file) || !existsSync(join(avatarDir, file))) return res.status(404).json({ error: 'Bulunamadı.' });
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.type(MIME[file.split('.').pop()]).sendFile(join(avatarDir, file));
  });
  return r;
}
