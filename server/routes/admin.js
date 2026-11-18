import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { parsePlaceFields } from '../validate.js';
import { getPlace, listPlaces } from './places.js';

const COLUMN = { babyChanging: 'baby_changing', publicAccess: 'public_access', toiletType: 'toilet_type' };
/** Şüpheli sayılan ihbar türleri ("open" = "sorun yok" bildirimi, kuyruğa girmez) */
const FLAG_TYPES = ['closed', 'no_supplies', 'crowded'];
/** Aynı türde bu kadar farklı kullanıcı → şüpheli */
const FLAG_USERS = 2;

const adminPlace = (db, id) => getPlace(db, id, null, { includeClosed: true });

/**
 * Yönetim API'si (yalnızca X-Admin-Key ile; bkz. requireAdminKey). Arayüzü ayrı admin/ servisindedir.
 */
export function adminRoutes(db) {
  const r = Router();

  /** Çözülmemiş ihbarlar, mekan başına gruplanmış; şüpheliler (≥2 farklı kullanıcı) önce */
  function reportQueue() {
    const rows = db.all(
      `SELECT s.id, s.place_id, s.user_id, s.report_type, s.created_at, u.username
       FROM status_reports s JOIN users u ON u.id = s.user_id
       WHERE s.resolved_at IS NULL AND s.report_type IN (${FLAG_TYPES.map(() => '?').join(',')})
       ORDER BY s.created_at DESC`,
      FLAG_TYPES,
    );
    const byPlace = new Map();
    for (const row of rows) {
      if (!byPlace.has(row.place_id)) byPlace.set(row.place_id, []);
      byPlace.get(row.place_id).push(row);
    }
    const out = [];
    for (const [placeId, reports] of byPlace) {
      const place = adminPlace(db, placeId);
      if (!place || place.closedAt) continue;
      const counts = Object.fromEntries(FLAG_TYPES.map((t) => [t, new Set(reports.filter((x) => x.report_type === t).map((x) => x.user_id)).size]));
      out.push({
        place,
        counts,
        flagged: Object.values(counts).some((n) => n >= FLAG_USERS),
        lastReportAt: reports[0].created_at,
        reports: reports.map((x) => ({ id: x.id, userId: x.user_id, username: x.username, type: x.report_type, createdAt: x.created_at })),
      });
    }
    return out.sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.lastReportAt.localeCompare(a.lastReportAt));
  }

  r.get('/stats', (_req, res) => {
    const n = (sql, p) => db.get(sql, p).n;
    const queue = reportQueue();
    res.json({
      places: n('SELECT COUNT(*) AS n FROM places WHERE closed_at IS NULL'),
      closedPlaces: n('SELECT COUNT(*) AS n FROM places WHERE closed_at IS NOT NULL'),
      pending: n('SELECT COUNT(*) AS n FROM pending_places'),
      votes: n('SELECT COUNT(*) AS n FROM votes'),
      users: n("SELECT COUNT(*) AS n FROM users WHERE role = 'user'"),
      reports: queue.length,
      flaggedPlaces: queue.filter((q) => q.flagged).length,
      avgCleanliness: db.get('SELECT AVG(cleanliness) AS n FROM votes').n ?? 0,
    });
  });

  // ---------------------------------------------------------------- Temiz Kalp ihbarları
  r.get('/reports', (_req, res) => res.json(reportQueue()));

  const resolve = (placeId) =>
    db.run('UPDATE status_reports SET resolved_at = ? WHERE place_id = ? AND resolved_at IS NULL', [new Date().toISOString(), placeId]);

  /** Onay: mekan kalıcı kapalı işaretlenir (haritadan gizlenir, silinmez); ihbarlar çözülür */
  r.post('/reports/:placeId/approve', (req, res) => {
    if (!db.get('SELECT 1 FROM places WHERE id = ?', [req.params.placeId])) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    db.tx(() => {
      const now = new Date().toISOString();
      db.run('UPDATE places SET closed_at = ?, updated_at = ? WHERE id = ?', [now, now, req.params.placeId]);
      resolve(req.params.placeId);
    });
    res.json(adminPlace(db, req.params.placeId));
  });

  /** Ret: ihbarlar çözülür; canlı durumu artık etkilemez (kullanıcının katkı sayısında kalır) */
  r.post('/reports/:placeId/reject', (req, res) => {
    if (!db.get('SELECT 1 FROM places WHERE id = ?', [req.params.placeId])) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    resolve(req.params.placeId);
    res.status(204).end();
  });

  /** Tek bir ihbarı sil (kötüye kullanım) */
  r.delete('/report-items/:id', (req, res) => {
    const { changes } = db.run('DELETE FROM status_reports WHERE id = ?', [Number(req.params.id)]);
    res.status(changes ? 204 : 404).end();
  });

  // ---------------------------------------------------------------- başvurular
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
    res.json(adminPlace(db, p.id));
  });

  r.delete('/pending/:id', (req, res) => {
    const { changes } = db.run('DELETE FROM pending_places WHERE id = ?', [req.params.id]);
    res.status(changes ? 204 : 404).end();
  });

  // ---------------------------------------------------------------- mekanlar
  r.get('/places', (_req, res) => res.json(listPlaces(db, null, { includeClosed: true })));

  r.post('/places', (req, res) => {
    const f = parsePlaceFields(req.body);
    if (typeof f === 'string') return res.status(400).json({ error: f });
    const id = `admin-${randomUUID()}`;
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO places (id, name, category, district, address, lat, lng, photo, hours, accessible, baby_changing, public_access,
         toilet_type, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?)`,
      [id, f.name, f.category, f.district, f.address, f.lat, f.lng, f.photo, f.hours, f.accessible, f.babyChanging, f.publicAccess,
        f.toiletType ?? null, now, now],
    );
    res.status(201).json(adminPlace(db, id));
  });

  /** Alan düzenleme; { closed: true|false } kalıcı kapalı durumunu değiştirir */
  r.patch('/places/:id', (req, res) => {
    if (!db.get('SELECT 1 FROM places WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const { closed, ...body } = req.body ?? {};
    if (closed !== undefined && typeof closed !== 'boolean') return res.status(400).json({ error: 'Geçersiz kapalı durumu.' });
    const fields = parsePlaceFields(body, { partial: true });
    if (typeof fields === 'string') return res.status(400).json({ error: fields });
    const sets = Object.keys(fields).map((k) => [`${COLUMN[k] ?? k} = ?`, fields[k]]);
    if (closed !== undefined) sets.push(['closed_at = ?', closed ? new Date().toISOString() : null]);
    if (sets.length) {
      db.run(`UPDATE places SET ${sets.map(([s]) => s).join(', ')}, updated_at = ? WHERE id = ?`, [
        ...sets.map(([, v]) => v), new Date().toISOString(), req.params.id,
      ]);
    }
    res.json(adminPlace(db, req.params.id));
  });

  r.delete('/places/:id', (req, res) => {
    const changes = db.deletePlace(req.params.id);
    res.status(changes ? 204 : 404).end();
  });

  // ---------------------------------------------------------------- oylar
  r.get('/votes', (_req, res) => {
    const rows = db.all(
      `SELECT v.*, u.username, u.display_name, p.name AS place_name FROM votes v
       JOIN users u ON u.id = v.user_id JOIN places p ON p.id = v.place_id ORDER BY v.updated_at DESC`,
    );
    res.json(rows.map(voteJson));
  });

  r.delete('/votes/:id', (req, res) => {
    const { changes } = db.run('DELETE FROM votes WHERE id = ?', [Number(req.params.id)]);
    res.status(changes ? 204 : 404).end();
  });

  // ---------------------------------------------------------------- kullanıcı denetimi
  r.get('/users', (_req, res) => {
    const rows = db.all(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.created_at,
         (SELECT COUNT(*) FROM votes WHERE user_id = u.id) AS votes,
         (SELECT COUNT(*) FROM votes WHERE user_id = u.id AND comment IS NOT NULL) AS comments,
         (SELECT COUNT(*) FROM status_reports WHERE user_id = u.id) AS reports,
         (SELECT COUNT(*) FROM places WHERE added_by = u.id) AS places_added,
         (SELECT COUNT(*) FROM pending_places WHERE user_id = u.id) AS pending,
         (SELECT MAX(t) FROM (SELECT MAX(updated_at) AS t FROM votes WHERE user_id = u.id
                              UNION ALL SELECT MAX(created_at) FROM status_reports WHERE user_id = u.id)) AS last_active_at
       FROM users u WHERE u.role = 'user' ORDER BY COALESCE(last_active_at, u.created_at) DESC`,
    );
    res.json(rows.map(userJson));
  });

  r.get('/users/:id', (req, res) => {
    const id = Number(req.params.id);
    const u = db.get("SELECT id, username, display_name, avatar_url, created_at FROM users WHERE id = ? AND role = 'user'", [id]);
    if (!u) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const votes = db.all(
      `SELECT v.*, u.username, u.display_name, p.name AS place_name FROM votes v
       JOIN users u ON u.id = v.user_id JOIN places p ON p.id = v.place_id WHERE v.user_id = ? ORDER BY v.updated_at DESC`,
      [id],
    );
    const reports = db.all(
      `SELECT s.*, p.name AS place_name FROM status_reports s JOIN places p ON p.id = s.place_id
       WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 200`,
      [id],
    );
    const places = db.all('SELECT id, name, category, closed_at, created_at FROM places WHERE added_by = ? ORDER BY created_at DESC', [id]);
    const pending = db.all('SELECT id, name, category, submitted_at FROM pending_places WHERE user_id = ? ORDER BY submitted_at DESC', [id]);
    res.json({
      user: userJson(u),
      votes: votes.map(voteJson),
      reports: reports.map((s) => ({
        id: s.id, placeId: s.place_id, placeName: s.place_name, type: s.report_type, createdAt: s.created_at, resolvedAt: s.resolved_at ?? null,
      })),
      placesAdded: places.map((p) => ({ id: p.id, name: p.name, category: p.category, closedAt: p.closed_at ?? null, createdAt: p.created_at })),
      pending: pending.map((p) => ({ id: p.id, name: p.name, category: p.category, submittedAt: p.submitted_at })),
    });
  });

  /** Kullanıcıyı sil: oyları, ihbarları ve favorileri CASCADE ile gider; eklediği mekanlar kalır */
  r.delete('/users/:id', (req, res) => {
    const { changes } = db.run("DELETE FROM users WHERE id = ? AND role = 'user'", [Number(req.params.id)]);
    res.status(changes ? 204 : 404).end();
  });

  return r;
}

function voteJson(v) {
  return {
    id: v.id, placeId: v.place_id, placeName: v.place_name, username: v.username, displayName: v.display_name || v.username,
    cleanliness: v.cleanliness, comfort: v.comfort, isPaid: !!v.is_paid, priceAmount: v.price_amount, comment: v.comment,
    createdAt: v.created_at, updatedAt: v.updated_at,
  };
}

function userJson(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    avatarUrl: u.avatar_url ?? null,
    createdAt: u.created_at,
    ...(u.votes !== undefined && {
      votes: u.votes, comments: u.comments, reports: u.reports, placesAdded: u.places_added, pending: u.pending, lastActiveAt: u.last_active_at ?? null,
    }),
  };
}
