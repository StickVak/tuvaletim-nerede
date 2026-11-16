export type ToiletCategory = 'avm' | 'kafe' | 'belediye' | 'park' | 'diger';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Oylardan sunucuda hesaplanır (server/stats.js) */
export interface PlaceStats {
  voteCount: number;
  cleanliness: number;
  comfort: number;
  rating: number;
  isPaid: boolean;
  avgPrice: number | null;
}

export interface Vote {
  cleanliness: number;
  comfort: number;
  isPaid: boolean;
  priceAmount: number | null;
  comment: string | null;
}

export interface Place extends LatLng {
  id: string;
  name: string;
  category: ToiletCategory;
  district: string | null;
  address: string | null;
  photo: string | null;
  hours: string | null;
  accessible: boolean;
  babyChanging: boolean;
  source: 'seed' | 'user';
  createdAt: string;
  stats: PlaceStats;
  /** Giriş yapan kullanıcının bu mekana verdiği oy */
  myVote: Vote | null;
}

/** Konum bilinmiyorsa distance null */
export interface PlaceView extends Place {
  distance: number | null;
}

export interface User {
  id: number;
  username: string;
  role: 'user' | 'admin';
}

/** POST /api/pending gövdesi */
export interface PlaceDraft extends LatLng {
  name: string;
  category: ToiletCategory;
  district?: string;
  address?: string;
  photo?: string;
  hours?: string;
  accessible: boolean;
  babyChanging: boolean;
  vote: Vote;
}

export type SortMode = 'distance' | 'cleanliness';

export interface Filters {
  sort: SortMode;
  freeOnly: boolean;
}

export interface EmergencyState {
  placeId: string;
  route: LatLng[];
  approximate: boolean;
  routeDistance?: number;
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'info' | 'error';
}
