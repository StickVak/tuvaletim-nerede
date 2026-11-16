import { Router } from 'express';
import { requireUser } from '../auth.js';
import { computeStats } from '../stats.js';

const voteJson = (v) =>
  v ? { cleanliness: v.cleanliness, comfort: v.comfort, isPaid: !!v.is_paid, priceAmount: v.price_amount, comment: v.comment } : null;

function placeJson(row, votes, userId) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    district: row.district,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    photo: row.photo,
    hours: row.hours,
    accessible: !!row.accessible,
    babyChanging: !!row.baby_changing,
    source: row.source,
    createdAt: row.created_at,
    stats: computeStats(row.category, votes),
    myVote: voteJson(userId ? votes.find((v) => v.user_id === userId) : null),
  };
}

export function listPlaces(db, userId) {
  const byPlace = new Map();
  for (const v of db.all('SELECT * FROM votes')) {
    if (!byPlace.has(v.place_id)) byPlace.set(v.place_id, []);
    byPlace.get(v.place_id).push(v);
  }
  return db.all('SELECT * FROM places ORDER BY name').map((p) => placeJson(p, byPlace.get(p.id) ?? [], userId));
}

export function getPlace(db, id, userId) {
  const row = db.get('SELECT * FROM places WHERE id = ?', [id]);
  return row ? placeJson(row, db.all('SELECT * FROM votes WHERE place_id = ?', [id]), userId) : null;
}

/**
 * Oy gövdesini doğrular. Hata metni ya da { cleanliness, comfort, isPaid, priceAmount, comment } döner.
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
  return {
    cleanliness: body.cleanliness,
    comfort: body.comfort,
    isPaid: body.isPaid,
    priceAmount: body.isPaid && priceAmount ? Math.round(priceAmount * 100) / 100 : null,
    comment: comment || null,
  };
}

export function placeRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => res.json(listPlaces(db, req.user?.id)));

  /** Yorumlu son 20 oy (herkese açık) */
  r.get('/:id/reviews', (req, res) => {
    if (!db.get('SELECT 1 FROM places WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const rows = db.all(
      `SELECT v.*, u.username FROM votes v JOIN users u ON u.id = v.user_id
       WHERE v.place_id = ? AND v.comment IS NOT NULL ORDER BY v.updated_at DESC LIMIT 20`,
      [req.params.id],
    );
    res.json(rows.map((v) => ({ username: v.username, ...voteJson(v), updatedAt: v.updated_at })));
  });

  r.put('/:id/vote', requireUser, (req, res) => {
    if (!db.get('SELECT 1 FROM places WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const v = parseVote(req.body);
    if (typeof v === 'string') return res.status(400).json({ error: v });
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO votes (place_id, user_id, cleanliness, comfort, is_paid, price_amount, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, place_id) DO UPDATE SET
         cleanliness = excluded.cleanliness, comfort = excluded.comfort, is_paid = excluded.is_paid,
         price_amount = excluded.price_amount, comment = excluded.comment, updated_at = excluded.updated_at`,
      [req.params.id, req.user.id, v.cleanliness, v.comfort, v.isPaid, v.priceAmount, v.comment, now, now],
    );
    res.json(getPlace(db, req.params.id, req.user.id));
  });

  return r;
}
