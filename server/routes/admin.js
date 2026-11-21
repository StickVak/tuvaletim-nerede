import { randomUUID } from 'node:crypto';
import { parseVote } from './places.js';
import { PLACE_ID_RE, placeIdParam } from '../validate.js';
import { asyncRouter } from '../async.js';
import { parsePlaceFields } from '../validate.js';
import { getPlace, listPlaces } from './places.js';
import { PhotoError } from '../photos.js';

const COLUMN = { babyChanging: 'baby_changing', publicAccess: 'public_access', toiletType: 'toilet_type' };
/** Şüpheli sayılan ihbar türleri ("open" = "sorun yok" bildirimi, kuyruğa girmez) */
const FLAG_TYPES = ['closed', 'no_supplies', 'crowded'];
/** Aynı türde bu kadar farklı kullanıcı → şüpheli */
const FLAG_USERS = 2;

const adminPlace = (db, id) => getPlace(db, id, null, { includeClosed: true });

/**
 * Yönetim API'si (yalnızca X-Admin-Key ile; bkz. requireAdminKey). Arayüzü ayrı admin/ servisindedir.
 * photos / avatars: createPhotoStore() — Cloudinary ya da yerel disk.
 */
export function adminRoutes(db, { photos, avatars }) {
  const r = asyncRouter();
  // :id hem metin (mekan/başvuru) hem sayı (oy, kullanıcı, bildirim) olabilir: ikisini de kapsayan biçim denetimi
  r.param('id', (_req, res, next, v) => (PLACE_ID_RE.test(v) ? next() : res.status(400).json({ error: 'Geçersiz kimlik.' })));
  r.param('placeId', placeIdParam);
  /** Fotoğraf kaydeder; doğrulama/yükleme hatasında yanıtı yazıp undefined döner */
  const savePhoto = async (res, dataUrl) => {
    try {
      return await photos.save(dataUrl);
    } catch (e) {
      if (!(e instanceof PhotoError)) throw e;
      res.status(e.status).json({ error: e.message });
      return undefined;
    }
  };

  /** Çözülmemiş ihbarlar, mekan başına gruplanmış; şüpheliler (≥2 farklı kullanıcı) önce */
  async function reportQueue() {
    const [rows, places] = await Promise.all([
      db.all(
        `SELECT s.id, s.place_id, s.user_id, s.report_type, s.created_at, u.username
         FROM status_reports s JOIN users u ON u.id = s.user_id
         WHERE s.resolved_at IS NULL AND s.report_type IN (${FLAG_TYPES.map(() => '?').join(',')})
         ORDER BY s.created_at DESC`,
        FLAG_TYPES,
      ),
      listPlaces(db, null),
    ]);
    const placeById = new Map(places.map((p) => [p.id, p])); // kalıcı kapalılar listede yok
    const byPlace = new Map();
    for (const row of rows) {
      if (!byPlace.has(row.place_id)) byPlace.set(row.place_id, []);
      byPlace.get(row.place_id).push(row);
    }
    const out = [];
    for (const [placeId, reports] of byPlace) {
      const place = placeById.get(placeId);
      if (!place) continue;
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

  r.get('/stats', async (_req, res) => {
    const n = async (sql) => (await db.get(sql)).n;
    const [queue, places, closedPlaces, pending, votes, users, avg] = await Promise.all([
      reportQueue(),
      n('SELECT COUNT(*) AS n FROM places WHERE closed_at IS NULL'),
      n('SELECT COUNT(*) AS n FROM places WHERE closed_at IS NOT NULL'),
      n('SELECT COUNT(*) AS n FROM pending_places'),
      n('SELECT COUNT(*) AS n FROM votes'),
      n("SELECT COUNT(*) AS n FROM users WHERE role = 'user'"),
      n('SELECT AVG(cleanliness) AS n FROM votes'),
    ]);
    res.json({
      places, closedPlaces, pending, votes, users,
      reports: queue.length,
      flaggedPlaces: queue.filter((q) => q.flagged).length,
      avgCleanliness: avg ?? 0,
    });
  });

  // ---------------------------------------------------------------- Temiz Kalp ihbarları
  r.get('/reports', async (_req, res) => res.json(await reportQueue()));

  const resolveStmt = (placeId) => [
    'UPDATE status_reports SET resolved_at = ? WHERE place_id = ? AND resolved_at IS NULL',
    [new Date().toISOString(), placeId],
  ];
  const placeExists = (id) => db.get('SELECT 1 FROM places WHERE id = ?', [id]);

  /** Onay: mekan kalıcı kapalı işaretlenir (haritadan gizlenir, silinmez); ihbarlar çözülür */
  r.post('/reports/:placeId/approve', async (req, res) => {
    if (!(await placeExists(req.params.placeId))) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const now = new Date().toISOString();
    await db.batch([
      ['UPDATE places SET closed_at = ?, updated_at = ? WHERE id = ?', [now, now, req.params.placeId]],
      resolveStmt(req.params.placeId),
    ]);
    res.json(await adminPlace(db, req.params.placeId));
  });

  /** Ret: ihbarlar çözülür; canlı durumu artık etkilemez (kullanıcının katkı sayısında kalır) */
  r.post('/reports/:placeId/reject', async (req, res) => {
    if (!(await placeExists(req.params.placeId))) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    await db.run(...resolveStmt(req.params.placeId));
    res.status(204).end();
  });

  /** Tek bir ihbarı sil (kötüye kullanım) */
  r.delete('/report-items/:id', async (req, res) => {
    const { changes } = await db.run('DELETE FROM status_reports WHERE id = ?', [Number(req.params.id)]);
    res.status(changes ? 204 : 404).end();
  });

  // ---------------------------------------------------------------- başvurular
  const PENDING_SQL = 'SELECT p.*, u.username FROM pending_places p LEFT JOIN users u ON u.id = p.user_id';
  const pendingJson = (p) => ({
    id: p.id, name: p.name, category: p.category, province: p.province ?? null, district: p.district, address: p.address, lat: p.lat, lng: p.lng,
    // Dış mekan fotoğrafı: yönetim anahtarıyla korunan uç (panel sunucusu üzerinden; Cloudinary'deyse oraya yönlendirir)
    photo: p.photo_file ? `/api/admin/pending/${encodeURIComponent(p.id)}/photo` : null,
    hasPhoto: Boolean(p.photo_file),
    hours: p.hours, accessible: !!p.accessible, babyChanging: !!p.baby_changing,
    publicAccess: p.public_access == null ? null : !!p.public_access,
    submittedAt: p.submitted_at, username: p.username ?? null,
    vote: { cleanliness: p.cleanliness, comfort: p.comfort, isPaid: !!p.is_paid, priceAmount: p.price_amount, comment: p.comment, toiletType: p.toilet_type ?? null },
  });

  r.get('/pending', async (_req, res) => {
    res.json((await db.all(`${PENDING_SQL} ORDER BY p.submitted_at DESC`)).map(pendingJson));
  });

  /**
   * Başvuruyu düzenle (onaydan önce): ad, tür, il/ilçe, adres, saatler, özellikler, konum, ücret/tuvalet tipi.
   * Yalnızca gönderilen alanlar değişir; mekan alanlarıyla aynı doğrulama (il/ilçe listeden, konum Türkiye içinde).
   * Başvuranın temizlik/konfor puanı ve yorumu değiştirilmez; fotoğraf buradan değiştirilmez.
   */
  r.patch('/pending/:id', async (req, res) => {
    const cur = await db.get('SELECT * FROM pending_places WHERE id = ?', [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Başvuru bulunamadı.' });
    const { isPaid, priceAmount, photo, ...body } = req.body ?? {};
    if (photo !== undefined) return res.status(400).json({ error: 'Başvuru fotoğrafı buradan değiştirilemez.' });
    // İl ya da ilçeden yalnızca biri gönderildiyse diğeri mevcut değerden alınır (birlikte doğrulanır)
    if (body.province !== undefined || body.district !== undefined) {
      body.province = body.province !== undefined ? body.province : cur.province;
      body.district = body.district !== undefined ? body.district : cur.district;
    }
    const f = parsePlaceFields(body, { partial: true });
    if (typeof f === 'string') return res.status(400).json({ error: f });
    const province = f.province !== undefined ? f.province : cur.province;
    const district = f.district !== undefined ? f.district : cur.district;
    if (!province || !district) return res.status(400).json({ error: 'İl ve ilçe seçin.' });
    const vote = parseVote({
      cleanliness: cur.cleanliness, comfort: cur.comfort, comment: cur.comment,
      isPaid: isPaid !== undefined ? isPaid : !!cur.is_paid,
      priceAmount: priceAmount !== undefined ? priceAmount : cur.price_amount,
      toiletType: f.toiletType !== undefined ? f.toiletType : cur.toilet_type,
    });
    if (typeof vote === 'string') return res.status(400).json({ error: vote });
    const pick = (k, col) => (f[k] !== undefined ? f[k] : cur[col]);
    await db.run(
      `UPDATE pending_places SET name = ?, category = ?, province = ?, district = ?, address = ?, lat = ?, lng = ?, hours = ?,
         accessible = ?, baby_changing = ?, public_access = ?, toilet_type = ?, is_paid = ?, price_amount = ? WHERE id = ?`,
      [pick('name', 'name'), pick('category', 'category'), province, district, pick('address', 'address'), pick('lat', 'lat'), pick('lng', 'lng'),
        pick('hours', 'hours'), pick('accessible', 'accessible'), pick('babyChanging', 'baby_changing'), pick('publicAccess', 'public_access'),
        vote.toiletType, vote.isPaid, vote.priceAmount, cur.id],
    );
    res.json(pendingJson(await db.get(`${PENDING_SQL} WHERE p.id = ?`, [cur.id])));
  });

  r.get('/pending/:id/photo', async (req, res) => {
    const row = await db.get('SELECT photo_file FROM pending_places WHERE id = ?', [req.params.id]);
    photos.send(res, row?.photo_file, 'private, max-age=300');
  });

  r.post('/pending/:id/approve', async (req, res) => {
    const p = await db.get('SELECT * FROM pending_places WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Başvuru bulunamadı.' });
    const now = new Date().toISOString();
    await db.batch([
      [
        `INSERT INTO places (id, name, category, province, district, address, lat, lng, photo_file, hours, accessible, baby_changing, public_access,
           added_by, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)`,
        [p.id, p.name, p.category, p.province ?? null, p.district, p.address, p.lat, p.lng, p.photo_file, p.hours, p.accessible, p.baby_changing,
          p.public_access, p.user_id, now, now],
      ],
      ...(p.user_id
        ? [[
            `INSERT INTO votes (place_id, user_id, cleanliness, comfort, is_paid, price_amount, comment, toilet_type, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [p.id, p.user_id, p.cleanliness, p.comfort, p.is_paid, p.price_amount, p.comment, p.toilet_type, p.submitted_at, now],
          ]]
        : []),
      ['DELETE FROM pending_places WHERE id = ?', [p.id]],
    ]);
    res.json(await adminPlace(db, p.id));
  });

  /** Ret: başvuru ve fotoğrafı (yerel dosya ya da Cloudinary görseli) silinir */
  r.delete('/pending/:id', async (req, res) => {
    const row = await db.get('SELECT photo_file FROM pending_places WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).end();
    await db.run('DELETE FROM pending_places WHERE id = ?', [req.params.id]);
    await photos.remove(row.photo_file);
    res.status(204).end();
  });

  // ---------------------------------------------------------------- mekanlar
  r.get('/places', async (_req, res) => res.json(await listPlaces(db, null, { includeClosed: true })));

  r.post('/places', async (req, res) => {
    const f = parsePlaceFields(req.body);
    if (typeof f === 'string') return res.status(400).json({ error: f });
    const photoRef = f.photo ? await savePhoto(res, f.photo) : null;
    if (photoRef === undefined) return;
    const id = `admin-${randomUUID()}`;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO places (id, name, category, province, district, address, lat, lng, photo_file, hours, accessible, baby_changing, public_access,
         toilet_type, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?)`,
      [id, f.name, f.category, f.province ?? null, f.district, f.address, f.lat, f.lng, photoRef, f.hours, f.accessible, f.babyChanging, f.publicAccess,
        f.toiletType ?? null, now, now],
    );
    res.status(201).json(await adminPlace(db, id));
  });

  /** Alan düzenleme; { closed: true|false } kalıcı kapalı durumunu değiştirir */
  r.patch('/places/:id', async (req, res) => {
    const current = await db.get('SELECT photo_file FROM places WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const { closed, ...body } = req.body ?? {};
    if (closed !== undefined && typeof closed !== 'boolean') return res.status(400).json({ error: 'Geçersiz kapalı durumu.' });
    const fields = parsePlaceFields(body, { partial: true });
    if (typeof fields === 'string') return res.status(400).json({ error: fields });
    const { photo, ...rest } = fields;
    const sets = Object.keys(rest).map((k) => [`${COLUMN[k] ?? k} = ?`, rest[k]]);
    if (closed !== undefined) sets.push(['closed_at = ?', closed ? new Date().toISOString() : null]);
    // photo: undefined → değişmez · null → kaldır · data URL → yeni görsel (eskisi silinir)
    let newPhoto;
    if (photo !== undefined) {
      newPhoto = photo ? await savePhoto(res, photo) : null;
      if (newPhoto === undefined) return;
      sets.push(['photo_file = ?', newPhoto], ['photo = ?', null]);
    }
    if (sets.length) {
      await db.run(`UPDATE places SET ${sets.map(([s]) => s).join(', ')}, updated_at = ? WHERE id = ?`, [
        ...sets.map(([, v]) => v), new Date().toISOString(), req.params.id,
      ]);
    }
    if (photo !== undefined && current.photo_file !== newPhoto) await photos.remove(current.photo_file);
    res.json(await adminPlace(db, req.params.id));
  });

  /** Mekanı ve fotoğrafını (Cloudinary dahil) siler */
  r.delete('/places/:id', async (req, res) => {
    const ref = (await db.get('SELECT photo_file FROM places WHERE id = ?', [req.params.id]))?.photo_file;
    const changes = await db.deletePlace(req.params.id);
    if (changes) await photos.remove(ref);
    res.status(changes ? 204 : 404).end();
  });

  // ---------------------------------------------------------------- oylar
  r.get('/votes', async (_req, res) => {
    const rows = await db.all(
      `SELECT v.*, u.username, u.display_name, p.name AS place_name FROM votes v
       JOIN users u ON u.id = v.user_id JOIN places p ON p.id = v.place_id ORDER BY v.updated_at DESC`,
    );
    res.json(rows.map(voteJson));
  });

  r.delete('/votes/:id', async (req, res) => {
    const { changes } = await db.run('DELETE FROM votes WHERE id = ?', [Number(req.params.id)]);
    res.status(changes ? 204 : 404).end();
  });

  // ---------------------------------------------------------------- kullanıcı denetimi
  r.get('/users', async (_req, res) => {
    const rows = await db.all(
      `SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.created_at,
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

  r.get('/users/:id', async (req, res) => {
    const id = Number(req.params.id);
    const [u, votes, reports, places, pending] = await Promise.all([
      db.get("SELECT id, username, email, display_name, avatar_url, created_at FROM users WHERE id = ? AND role = 'user'", [id]),
      db.all(
        `SELECT v.*, u.username, u.display_name, p.name AS place_name FROM votes v
         JOIN users u ON u.id = v.user_id JOIN places p ON p.id = v.place_id WHERE v.user_id = ? ORDER BY v.updated_at DESC`,
        [id],
      ),
      db.all(
        `SELECT s.*, p.name AS place_name FROM status_reports s JOIN places p ON p.id = s.place_id
         WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 200`,
        [id],
      ),
      db.all('SELECT id, name, category, closed_at, created_at FROM places WHERE added_by = ? ORDER BY created_at DESC', [id]),
      db.all('SELECT id, name, category, submitted_at FROM pending_places WHERE user_id = ? ORDER BY submitted_at DESC', [id]),
    ]);
    if (!u) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
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

  /** Kullanıcıyı sil: oyları, ihbarları, favorileri ve profil fotoğrafı gider; eklediği mekanlar kalır */
  r.delete('/users/:id', async (req, res) => {
    const id = Number(req.params.id);
    const avatar = (await db.get("SELECT avatar_url FROM users WHERE id = ? AND role = 'user'", [id]))?.avatar_url;
    const changes = await db.deleteUser(id);
    if (changes && avatar) await avatars.remove(avatar.startsWith('/api/avatars/') ? avatar.split('/').pop() : avatar);
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
    email: u.email ?? null,
    displayName: u.display_name || u.username,
    avatarUrl: u.avatar_url ?? null,
    createdAt: u.created_at,
    ...(u.votes !== undefined && {
      votes: u.votes, comments: u.comments, reports: u.reports, placesAdded: u.places_added, pending: u.pending, lastActiveAt: u.last_active_at ?? null,
    }),
  };
}
