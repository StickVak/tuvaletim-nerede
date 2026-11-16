import { Router } from 'express';
import { requireUser } from '../auth.js';
import { computeStats } from '../stats.js';
import { computeStatus, REPORT_TYPES, STATUS_WINDOW_MS } from '../status.js';
import { PHOTO_RE } from '../validate.js';

export const TOILET_TYPES = ['alafranga', 'alaturka', 'ikisi'];

const voteJson = (v) =>
  v
    ? { cleanliness: v.cleanliness, comfort: v.comfort, isPaid: !!v.is_paid, priceAmount: v.price_amount, comment: v.comment, toiletType: v.toilet_type ?? null }
    : null;

/** Oylarda belirtilen tuvalet tipinin çoğunluğu; oy yoksa OSM/başlangıç değeri */
function toiletTypeOf(base, votes) {
  const count = {};
  for (const v of votes) if (v.toilet_type) count[v.toilet_type] = (count[v.toilet_type] ?? 0) + 1;
  const ranked = Object.entries(count).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return base ?? null;
  const tied = ranked.filter(([, n]) => n === ranked[0][1]).map(([t]) => t);
  return tied.length > 1 && tied.includes(base) ? base : ranked[0][0];
}

function placeJson(row, votes, reports, userId, favorite) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    district: row.district,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    hasPhoto: Boolean(row.photo),
    hours: row.hours,
    accessible: !!row.accessible,
    babyChanging: !!row.baby_changing,
    toiletType: toiletTypeOf(row.toilet_type, votes),
    /** Şifresiz / herkese açık; bilinmiyorsa kafeler müşteri şifreli kabul edilir */
    publicAccess: row.public_access == null ? row.category !== 'kafe' : !!row.public_access,
    source: row.source,
    createdAt: row.created_at,
    stats: computeStats(row.category, votes),
    status: computeStatus(reports),
    isFavorite: !!favorite,
    myVote: voteJson(userId ? votes.find((v) => v.user_id === userId) : null),
  };
}

const since = () => new Date(Date.now() - STATUS_WINDOW_MS).toISOString();
const group = (rows) => {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.place_id)) m.set(r.place_id, []);
    m.get(r.place_id).push(r);
  }
  return m;
};

export function listPlaces(db, userId) {
  const votes = group(db.all('SELECT * FROM votes'));
  const reports = group(db.all('SELECT * FROM status_reports WHERE created_at >= ?', [since()]));
  const favs = new Set(userId ? db.all('SELECT place_id FROM favorites WHERE user_id = ?', [userId]).map((f) => f.place_id) : []);
  return db
    .all('SELECT * FROM places ORDER BY name')
    .map((p) => placeJson(p, votes.get(p.id) ?? [], reports.get(p.id) ?? [], userId, favs.has(p.id)));
}

export function getPlace(db, id, userId) {
  const row = db.get('SELECT * FROM places WHERE id = ?', [id]);
  if (!row) return null;
  const fav = userId && db.get('SELECT 1 FROM favorites WHERE user_id = ? AND place_id = ?', [userId, id]);
  return placeJson(
    row,
    db.all('SELECT * FROM votes WHERE place_id = ?', [id]),
    db.all('SELECT * FROM status_reports WHERE place_id = ? AND created_at >= ?', [id, since()]),
    userId,
    fav,
  );
}

/**
 * Oy gövdesini doğrular. Hata metni ya da temizlenmiş oy döner.
 * Boş/sayı olmayan ücret tutarı "tutar yok" sayılır.
 */
export function parseVote(body) {
  const star = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
  if (!star(body?.cleanliness) || !star(body?.comfort)) return 'Temizlik ve konfor 1-5 arası olmalı.';
  if (typeof body.isPaid !== 'boolean') return 'Ücretli / ücretsiz seçimi yapın.';
  let priceAmount = body.priceAmount === '' || body.priceAmount == null ? null : Number(body.priceAmount);
  if (Number.isNaN(priceAmount)) priceAmount = null;
  if (priceAmount !== null && (priceAmount < 0 || priceAmount > 1000)) return 'Ücret tutarı 0-1000 ₺ arasında olmalı.';
  const comment = String(body.comment ?? '').trim();
  if (comment.length > 280) return 'Yorum en fazla 280 karakter olabilir.';
  const toiletType = body.toiletType ?? null;
  if (toiletType !== null && !TOILET_TYPES.includes(toiletType)) return 'Geçersiz tuvalet tipi.';
  return {
    cleanliness: body.cleanliness,
    comfort: body.comfort,
    isPaid: body.isPaid,
    priceAmount: body.isPaid && priceAmount ? Math.round(priceAmount * 100) / 100 : null,
    comment: comment || null,
    toiletType,
  };
}

export function placeRoutes(db, writeLimit) {
  const r = Router();
  const exists = (id) => db.get('SELECT 1 FROM places WHERE id = ?', [id]);

  r.get('/', (req, res) => res.json(listPlaces(db, req.user?.id)));

  /** Mekan fotoğrafı (liste yanıtını küçük tutmak için ayrı uç nokta) */
  r.get('/:id/photo', (req, res) => {
    const row = db.get('SELECT photo FROM places WHERE id = ?', [req.params.id]);
    if (!row?.photo || !PHOTO_RE.test(row.photo)) return res.status(404).json({ error: 'Fotoğraf yok.' });
    const [, type] = row.photo.match(/^data:image\/(\w+);/);
    res.set('X-Content-Type-Options', 'nosniff').type(`image/${type}`).send(Buffer.from(row.photo.split(',')[1], 'base64'));
  });

  /** Yorumlu son 20 oy (herkese açık), yazarın görünen adı ve avatarıyla */
  r.get('/:id/reviews', (req, res) => {
    if (!exists(req.params.id)) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const rows = db.all(
      `SELECT v.*, u.username, u.display_name, u.avatar_url, u.is_demo FROM votes v JOIN users u ON u.id = v.user_id
       WHERE v.place_id = ? AND v.comment IS NOT NULL ORDER BY v.updated_at DESC LIMIT 20`,
      [req.params.id],
    );
    res.json(
      rows.map((v) => ({
        userId: v.user_id,
        username: v.username,
        displayName: v.display_name || v.username,
        avatarUrl: v.avatar_url ?? null,
        isDemo: !!v.is_demo,
        ...voteJson(v),
        updatedAt: v.updated_at,
      })),
    );
  });

  r.put('/:id/vote', writeLimit, requireUser, (req, res) => {
    if (!exists(req.params.id)) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const v = parseVote(req.body);
    if (typeof v === 'string') return res.status(400).json({ error: v });
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO votes (place_id, user_id, cleanliness, comfort, is_paid, price_amount, comment, toilet_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, place_id) DO UPDATE SET
         cleanliness = excluded.cleanliness, comfort = excluded.comfort, is_paid = excluded.is_paid,
         price_amount = excluded.price_amount, comment = excluded.comment, toilet_type = excluded.toilet_type,
         updated_at = excluded.updated_at`,
      [req.params.id, req.user.id, v.cleanliness, v.comfort, v.isPaid, v.priceAmount, v.comment, v.toiletType, now, now],
    );
    res.json(getPlace(db, req.params.id, req.user.id));
  });

  /** Canlı durum bildirimi; aynı kullanıcının aynı türdeki bildirimi 3 saat içinde tekrar sayılmaz */
  r.post('/:id/reports', writeLimit, requireUser, (req, res) => {
    if (!exists(req.params.id)) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const type = req.body?.type;
    if (!REPORT_TYPES.includes(type)) return res.status(400).json({ error: 'Geçersiz bildirim türü.' });
    const dup = db.get(
      'SELECT 1 FROM status_reports WHERE place_id = ? AND user_id = ? AND report_type = ? AND created_at >= ?',
      [req.params.id, req.user.id, type, since()],
    );
    if (!dup) {
      db.run('INSERT INTO status_reports (place_id, user_id, report_type, created_at) VALUES (?, ?, ?, ?)', [
        req.params.id, req.user.id, type, new Date().toISOString(),
      ]);
    }
    res.json(getPlace(db, req.params.id, req.user.id));
  });

  return r;
}

export function favoriteRoutes(db, writeLimit) {
  const r = Router();
  r.use(writeLimit, requireUser);
  r.put('/:placeId', (req, res) => {
    if (!db.get('SELECT 1 FROM places WHERE id = ?', [req.params.placeId])) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    db.run('INSERT OR IGNORE INTO favorites (user_id, place_id, created_at) VALUES (?, ?, ?)', [req.user.id, req.params.placeId, new Date().toISOString()]);
    res.status(204).end();
  });
  r.delete('/:placeId', (req, res) => {
    db.run('DELETE FROM favorites WHERE user_id = ? AND place_id = ?', [req.user.id, req.params.placeId]);
    res.status(204).end();
  });
  return r;
}
