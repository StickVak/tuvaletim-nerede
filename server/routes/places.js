import { asyncRouter } from '../async.js';
import { requireUser } from '../auth.js';
import { computeStats } from '../stats.js';
import { computeStatus, REPORT_TYPES, STATUS_WINDOW_MS } from '../status.js';

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
    hasPhoto: Boolean(row.photo_file),
    hours: row.hours,
    accessible: !!row.accessible,
    babyChanging: !!row.baby_changing,
    toiletType: toiletTypeOf(row.toilet_type, votes),
    /** Şifresiz / herkese açık; bilinmiyorsa kafeler müşteri şifreli kabul edilir */
    publicAccess: row.public_access == null ? row.category !== 'kafe' : !!row.public_access,
    source: row.source,
    createdAt: row.created_at,
    closedAt: row.closed_at ?? null,
    stats: computeStats(row.category, votes),
    status: computeStatus(reports),
    isFavorite: !!favorite,
    myVote: voteJson(userId ? votes.find((v) => v.user_id === userId) : null),
  };
}

const since = () => new Date(Date.now() - STATUS_WINDOW_MS).toISOString();

/**
 * Bildirim ekleme ifadesi: aynı kullanıcının aynı türdeki bildirimi 3 saat içinde tekrar sayılmaz
 * (kontrol ve ekleme tek SQL'de; batch içinde de kullanılabilir).
 */
const addReportStmt = (placeId, userId, type) => [
  `INSERT INTO status_reports (place_id, user_id, report_type, created_at)
   SELECT ?, ?, ?, ? WHERE NOT EXISTS (
     SELECT 1 FROM status_reports WHERE place_id = ? AND user_id = ? AND report_type = ? AND created_at >= ?)`,
  [placeId, userId, type, new Date().toISOString(), placeId, userId, type, since()],
];

const UPSERT_VOTE = `INSERT INTO votes (place_id, user_id, cleanliness, comfort, is_paid, price_amount, comment, toilet_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, place_id) DO UPDATE SET
         cleanliness = excluded.cleanliness, comfort = excluded.comfort, is_paid = excluded.is_paid,
         price_amount = excluded.price_amount, comment = excluded.comment, toilet_type = excluded.toilet_type,
         updated_at = excluded.updated_at`;

/** Katkı = verdiği oy sayısı + gönderdiği durum bildirimi sayısı */
export async function contributionsOf(db, userId) {
  return (
    (await db.get('SELECT COUNT(*) AS n FROM votes WHERE user_id = ?', [userId])).n +
    (await db.get('SELECT COUNT(*) AS n FROM status_reports WHERE user_id = ?', [userId])).n
  );
}
const group = (rows) => {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.place_id)) m.set(r.place_id, []);
    m.get(r.place_id).push(r);
  }
  return m;
};

export async function listPlaces(db, userId, { includeClosed = false } = {}) {
  // Turso'da her sorgu bir ağ isteği: dördü paralel
  const [placeRows, voteRows, reportRows, favRows] = await Promise.all([
    db.all(`SELECT * FROM places ${includeClosed ? '' : 'WHERE closed_at IS NULL'} ORDER BY name`),
    db.all('SELECT * FROM votes'),
    db.all('SELECT * FROM status_reports WHERE created_at >= ? AND resolved_at IS NULL', [since()]),
    userId ? db.all('SELECT place_id FROM favorites WHERE user_id = ?', [userId]) : [],
  ]);
  const votes = group(voteRows);
  const reports = group(reportRows);
  const favs = new Set(favRows.map((f) => f.place_id));
  return placeRows.map((p) => placeJson(p, votes.get(p.id) ?? [], reports.get(p.id) ?? [], userId, favs.has(p.id)));
}

/** includeClosed: yönetim için kalıcı kapalı mekanları da döndür (closedAt alanıyla) */
export async function getPlace(db, id, userId, { includeClosed = false } = {}) {
  const [row, votes, reports, fav] = await Promise.all([
    db.get('SELECT * FROM places WHERE id = ?', [id]),
    db.all('SELECT * FROM votes WHERE place_id = ?', [id]),
    db.all('SELECT * FROM status_reports WHERE place_id = ? AND created_at >= ? AND resolved_at IS NULL', [id, since()]),
    userId ? db.get('SELECT 1 FROM favorites WHERE user_id = ? AND place_id = ?', [userId, id]) : null,
  ]);
  if (!row || (row.closed_at && !includeClosed)) return null;
  return placeJson(row, votes, reports, userId, fav);
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

export function placeRoutes(db, writeLimit, photos) {
  const r = asyncRouter();
  // Kalıcı kapalı mekanlar herkese açık uçlarda yok sayılır
  const exists = (id) => db.get('SELECT 1 FROM places WHERE id = ? AND closed_at IS NULL', [id]);

  r.get('/', async (req, res) => res.json(await listPlaces(db, req.user?.id)));

  /** Mekan fotoğrafı (liste yanıtını küçük tutmak için ayrı uç nokta) */
  r.get('/:id/photo', async (req, res) => {
    const row = await db.get('SELECT photo_file FROM places WHERE id = ?', [req.params.id]);
    photos.send(res, row?.photo_file);
  });

  /** Yorumlu son 20 oy (herkese açık), yazarın görünen adı ve avatarıyla */
  r.get('/:id/reviews', async (req, res) => {
    if (!(await exists(req.params.id))) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const rows = await db.all(
      `SELECT v.*, u.username, u.display_name, u.avatar_url FROM votes v JOIN users u ON u.id = v.user_id
       WHERE v.place_id = ? AND v.comment IS NOT NULL ORDER BY v.updated_at DESC LIMIT 20`,
      [req.params.id],
    );
    res.json(
      rows.map((v) => ({
        userId: v.user_id,
        username: v.username,
        displayName: v.display_name || v.username,
        avatarUrl: v.avatar_url ?? null,
        ...voteJson(v),
        updatedAt: v.updated_at,
      })),
    );
  });

  r.put('/:id/vote', writeLimit, requireUser, async (req, res) => {
    if (!(await exists(req.params.id))) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const v = parseVote(req.body);
    if (typeof v === 'string') return res.status(400).json({ error: v });
    const now = new Date().toISOString();
    await db.run(UPSERT_VOTE, [req.params.id, req.user.id, v.cleanliness, v.comfort, v.isPaid, v.priceAmount, v.comment, v.toiletType, now, now]);
    res.json(await getPlace(db, req.params.id, req.user.id));
  });

  /** Canlı durum bildirimi; aynı kullanıcının aynı türdeki bildirimi 3 saat içinde tekrar sayılmaz */
  r.post('/:id/reports', writeLimit, requireUser, async (req, res) => {
    if (!(await exists(req.params.id))) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const type = req.body?.type;
    if (!REPORT_TYPES.includes(type)) return res.status(400).json({ error: 'Geçersiz bildirim türü.' });
    await db.run(...addReportStmt(req.params.id, req.user.id, type));
    res.json(await getPlace(db, req.params.id, req.user.id));
  });

  /**
   * Yolculuk sonu değerlendirmesi. Açıksa oy (upsert) + "open" bildirimi; kapalıysa yalnızca "closed".
   * Kağıt yoksa "no_supplies". Hepsi tek işlemde.
   */
  r.post('/:id/arrival', writeLimit, requireUser, async (req, res) => {
    if (!(await exists(req.params.id))) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    const { wasOpen, hadPaper = null } = req.body ?? {};
    if (typeof wasOpen !== 'boolean') return res.status(400).json({ error: '“Açık mıydı?” sorusunu yanıtlayın.' });
    if (hadPaper !== null && typeof hadPaper !== 'boolean') return res.status(400).json({ error: 'Geçersiz “Kağıt var mıydı?” yanıtı.' });
    const v = wasOpen ? parseVote({ ...req.body, comment: null, toiletType: null }) : null;
    if (typeof v === 'string') return res.status(400).json({ error: v });
    const now = new Date().toISOString();
    const stmts = [];
    if (v) {
      // Var olan oydaki yorum ve tuvalet tipi korunur
      const prev = await db.get('SELECT comment, toilet_type FROM votes WHERE place_id = ? AND user_id = ?', [req.params.id, req.user.id]);
      stmts.push([UPSERT_VOTE, [req.params.id, req.user.id, v.cleanliness, v.comfort, v.isPaid, v.priceAmount, prev?.comment ?? null, prev?.toilet_type ?? null, now, now]]);
    }
    stmts.push(addReportStmt(req.params.id, req.user.id, wasOpen ? 'open' : 'closed'));
    if (wasOpen && hadPaper === false) stmts.push(addReportStmt(req.params.id, req.user.id, 'no_supplies'));
    await db.batch(stmts); // tek işlem
    res.json({ place: await getPlace(db, req.params.id, req.user.id), contributions: await contributionsOf(db, req.user.id) });
  });

  return r;
}

export function favoriteRoutes(db, writeLimit) {
  const r = asyncRouter();
  r.use(writeLimit, requireUser);
  r.put('/:placeId', async (req, res) => {
    if (!(await db.get('SELECT 1 FROM places WHERE id = ?', [req.params.placeId]))) return res.status(404).json({ error: 'Mekan bulunamadı.' });
    await db.run('INSERT OR IGNORE INTO favorites (user_id, place_id, created_at) VALUES (?, ?, ?)', [req.user.id, req.params.placeId, new Date().toISOString()]);
    res.status(204).end();
  });
  r.delete('/:placeId', async (req, res) => {
    await db.run('DELETE FROM favorites WHERE user_id = ? AND place_id = ?', [req.user.id, req.params.placeId]);
    res.status(204).end();
  });
  return r;
}
