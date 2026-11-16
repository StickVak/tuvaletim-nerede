import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { requireUser } from '../auth.js';
import { parsePlaceFields } from '../validate.js';
import { parseVote } from './places.js';

export function pendingRoutes(db, writeLimit) {
  const r = Router();
  r.post('/', writeLimit, requireUser, (req, res) => {
    const place = parsePlaceFields(req.body);
    if (typeof place === 'string') return res.status(400).json({ error: place });
    const vote = parseVote(req.body.vote);
    if (typeof vote === 'string') return res.status(400).json({ error: vote });
    const id = `user-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
    db.run(
      `INSERT INTO pending_places (id, user_id, name, category, district, address, lat, lng, photo, hours, accessible, baby_changing,
         public_access, toilet_type, cleanliness, comfort, is_paid, price_amount, comment, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, place.name, place.category, place.district, place.address, place.lat, place.lng, place.photo, place.hours,
        place.accessible, place.babyChanging, place.publicAccess, vote.toiletType, vote.cleanliness, vote.comfort, vote.isPaid,
        vote.priceAmount, vote.comment, new Date().toISOString()],
    );
    res.status(201).json({ id });
  });
  return r;
}
