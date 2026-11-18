import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { parsePlaceFields } from '../validate.js';
import { getPlace } from './places.js';

const COLUMN = { babyChanging: 'baby_changing', publicAccess: 'public_access', toiletType: 'toilet_type' };

export function adminRoutes(db) {
  const r = Router();
  r.use(requireAdmin);

  r.get('/stats', (_req, res) => {
    const n = (sql) => db.get(sql).n;
    res.json({
      places: n('SELECT COUNT(*) AS n FROM places'),
      pending: n('SELECT COUNT(*) AS n FROM pending_places'),
      votes: n('SELECT COUNT(*) AS n FROM votes'),
      users: n("SELECT COUNT(*) AS n FROM users WHERE role = 'user'"),
      avgCleanliness: db.get('SELECT AVG(cleanliness) AS n FROM votes').n ?? 0,
    });
  });

  r.get('/pending', (_req, res) => {
    const rows = db.all(
      `SELECT p.*, u.username FROM pending_places p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.submitted_at DESC`,
    );
    res.json(
      rows.map((p) => ({
        id: p.id, name: p.name, category: p.category, district: p.district, address: p.address, lat: p.lat, lng: p.lng,
        photo: p.photo, hours: p.hours, accessible: !!p.accessible, babyChanging: !!p.baby_changing,
        submittedAt: p.submitted_at, username: p.username ?? null,
        vote: { cleanliness: p.cleanliness, comfort: p.comfort, isPaid: !!p.is_paid, priceAmount: p.price_amount, comment: p.comment },
      })),
    );
  });

  r.post('/pending/:id/approve', (req, res) => {
    const p = db.get('SELECT * FROM pending_places WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Başvuru bulunamadı.' });
    const now = new Date().toISOString();
    db.tx(() => {
      db.run(
        `INSERT INTO places (id, name, category, district, address, lat, lng, photo, hours, accessible, baby_changing, public_access,
           added_by, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)`,
        [p.id, p.name, p.category, p.district, p.address, p.lat, p.lng, p.photo, p.hours, p.accessible, p.baby_changing,
          p.public_access, p.user_id, now, now],
      );
      if (p.user_id) {
        db.run(
          `INSERT INTO votes (place_id, user_id, cleanliness, comfort, is_paid, price_amount, comment, toilet_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, p.user_id, p.cleanliness, p.comfort, p.is_paid, p.price_amount, p.comment, p.toilet_type, p.submitted_at, now],
        );
      }
      db.run('DELETE FROM pending_places WHERE id = ?', [p.id]);
    });
    res.json(getPlace(db, p.id, null));
  });

  r.delete('/pending/:id', (req, res) => {
    const { changes } = db.run('DELETE FROM pending_places WHERE id = ?', [req.params.id]);
    res.status(changes ? 204 : 404).end();
  });

  r.patch('/places/:id', (req, res) => {
    if (!db.get('SELECT 1 FROM places WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const fields = parsePlaceFields(req.body, { partial: true });
    if (typeof fields === 'string') return res.status(400).json({ error: fields });
    const keys = Object.keys(fields);
    if (keys.length) {
      db.run(
        `UPDATE places SET ${keys.map((k) => `${COLUMN[k] ?? k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...keys.map((k) => fields[k]), new Date().toISOString(), req.params.id],
      );
    }
    res.json(getPlace(db, req.params.id, null));
  });

  r.delete('/places/:id', (req, res) => {
    const changes = db.deletePlace(req.params.id);
    res.status(changes ? 204 : 404).end();
  });

  r.get('/votes', (_req, res) => {
    const rows = db.all(
      `SELECT v.*, u.username, u.display_name, p.name AS place_name FROM votes v
       JOIN users u ON u.id = v.user_id JOIN places p ON p.id = v.place_id ORDER BY v.updated_at DESC`,
    );
    res.json(
      rows.map((v) => ({
        id: v.id, placeId: v.place_id, placeName: v.place_name, username: v.username, displayName: v.display_name || v.username,
        cleanliness: v.cleanliness, comfort: v.comfort, isPaid: !!v.is_paid, priceAmount: v.price_amount, comment: v.comment,
        createdAt: v.created_at, updatedAt: v.updated_at,
      })),
    );
  });

  r.delete('/votes/:id', (req, res) => {
    const { changes } = db.run('DELETE FROM votes WHERE id = ?', [Number(req.params.id)]);
    res.status(changes ? 204 : 404).end();
  });

  return r;
}
