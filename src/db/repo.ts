import { db } from './db';
import type { PendingSubmission, Place, PlaceBase, Review } from '../types';
import { randomId } from '../lib/sha256';

/* ------------------------------------------------------------------ */
/* Oy kilidi: aynı tarayıcıdan aynı mekana 24 saatte bir puan          */
/* ------------------------------------------------------------------ */
export const VOTE_LOCK_MS = 24 * 60 * 60 * 1000;
const VOTER_KEY = 'tn.voterId';
const VOTES_KEY = 'tn.votes';

export function getVoterId(): string {
  try {
    let id = localStorage.getItem(VOTER_KEY);
    if (!id) {
      id = randomId(10);
      localStorage.setItem(VOTER_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

function readVotes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(VOTES_KEY) || '{}');
  } catch {
    return {};
  }
}

/** Kilit bitiş zamanı (ms) ya da null */
export async function getVoteLock(placeId: string): Promise<number | null> {
  const local = readVotes()[placeId] ?? 0;
  const last = await db.reviews.where('[placeId+voterId]').equals([placeId, getVoterId()]).last();
  const ts = Math.max(local, last ? new Date(last.createdAt).getTime() : 0);
  const until = ts + VOTE_LOCK_MS;
  return ts && until > Date.now() ? until : null;
}

export function countMyVotes(): number {
  return Object.keys(readVotes()).length;
}

/* ------------------------------------------------------------------ */
/* Puan & yorum                                                        */
/* ------------------------------------------------------------------ */
export async function submitReview(placeId: string, cleanliness: number, comfort: number, comment: string) {
  if (await getVoteLock(placeId)) throw new Error('VOTE_LOCKED');
  const voterId = getVoterId();
  await db.transaction('rw', db.places, db.reviews, async () => {
    const place = await db.places.get(placeId);
    if (!place) throw new Error('NOT_FOUND');
    await db.reviews.add({
      placeId,
      cleanliness,
      comfort,
      comment: comment.trim() || undefined,
      voterId,
      createdAt: new Date().toISOString(),
    });
    await db.places.update(placeId, {
      cleanlinessTotal: place.cleanlinessTotal + cleanliness,
      comfortTotal: place.comfortTotal + comfort,
      ratingCount: place.ratingCount + 1,
      updatedAt: new Date().toISOString(),
    });
  });
  try {
    localStorage.setItem(VOTES_KEY, JSON.stringify({ ...readVotes(), [placeId]: Date.now() }));
  } catch {
    /* yoksay */
  }
}

/** Yorumu siler ve mekanın ortalamalarını geri hesaplar (admin). */
export async function deleteReview(id: number) {
  await db.transaction('rw', db.places, db.reviews, async () => {
    const review = await db.reviews.get(id);
    if (!review) return;
    await db.reviews.delete(id);
    const place = await db.places.get(review.placeId);
    if (!place) return;
    await db.places.update(place.id, {
      cleanlinessTotal: Math.max(0, place.cleanlinessTotal - review.cleanliness),
      comfortTotal: Math.max(0, place.comfortTotal - review.comfort),
      ratingCount: Math.max(0, place.ratingCount - 1),
      updatedAt: new Date().toISOString(),
    });
  });
}

/* ------------------------------------------------------------------ */
/* Başvurular                                                          */
/* ------------------------------------------------------------------ */
export async function submitPlace(draft: PlaceBase & { cleanliness: number; comfort: number; comment?: string }) {
  const sub: PendingSubmission = {
    ...draft,
    id: `user-${Date.now().toString(36)}-${randomId(3)}`,
    voterId: getVoterId(),
    submittedAt: new Date().toISOString(),
  };
  await db.pending_submissions.add(sub);
  return sub;
}

export async function approveSubmission(id: string): Promise<Place | null> {
  return db.transaction('rw', db.places, db.reviews, db.pending_submissions, async () => {
    const sub = await db.pending_submissions.get(id);
    if (!sub) return null;
    const { cleanliness, comfort, comment, voterId, submittedAt, ...base } = sub;
    const now = new Date().toISOString();
    const place: Place = {
      ...base,
      cleanlinessTotal: cleanliness,
      comfortTotal: comfort,
      ratingCount: 1,
      source: 'user',
      createdAt: now,
      updatedAt: now,
    };
    await db.places.add(place);
    await db.reviews.add({ placeId: place.id, cleanliness, comfort, comment, voterId, createdAt: submittedAt });
    await db.pending_submissions.delete(id);
    return place;
  });
}

export async function rejectSubmission(id: string) {
  await db.pending_submissions.delete(id);
}

/* ------------------------------------------------------------------ */
/* Mekan yönetimi (admin)                                              */
/* ------------------------------------------------------------------ */
export async function updatePlace(id: string, changes: Partial<PlaceBase>) {
  await db.places.update(id, { ...changes, updatedAt: new Date().toISOString() });
}

export async function deletePlace(id: string) {
  await db.transaction('rw', db.places, db.reviews, async () => {
    await db.reviews.where('placeId').equals(id).delete();
    await db.places.delete(id);
  });
}

export type { Review };
