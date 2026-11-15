export type ToiletCategory = 'avm' | 'kafe' | 'belediye' | 'park' | 'diger';

/** free: herkese ücretsiz · customers: müşteriye ücretsiz · paid: ücretli */
export type FeeType = 'free' | 'customers' | 'paid';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Ortak mekan alanları (places + pending_submissions) */
export interface PlaceBase extends LatLng {
  name: string;
  category: ToiletCategory;
  city?: string;
  district?: string;
  address?: string;
  /** base64 data URL; yoksa temsili görsel üretilir */
  photo?: string;
  fee: FeeType;
  price?: string;
  hours?: string;
  accessible?: boolean;
  babyChanging?: boolean;
}

/** `places` tablosu */
export interface Place extends PlaceBase {
  id: string;
  cleanlinessTotal: number;
  comfortTotal: number;
  ratingCount: number;
  source: 'seed' | 'user';
  createdAt: string;
  updatedAt: string;
}

/** `reviews` tablosu */
export interface Review {
  id?: number;
  placeId: string;
  cleanliness: number;
  comfort: number;
  comment?: string;
  voterId: string;
  createdAt: string;
}

/** `pending_submissions` tablosu */
export interface PendingSubmission extends PlaceBase {
  id: string;
  cleanliness: number;
  comfort: number;
  comment?: string;
  voterId: string;
  submittedAt: string;
}

/** `admin_users` tablosu */
export interface AdminUser {
  id?: number;
  username: string;
  passwordHash: string;
  salt: string;
  role: 'admin';
  createdAt: string;
  lastLoginAt?: string;
  sessionToken?: string;
  sessionExpires?: number;
}

/** Arayüzde kullanılan, puan ortalamaları ve mesafesi hesaplanmış mekan */
export interface PlaceView extends Place {
  cleanliness: number;
  comfort: number;
  rating: number;
  distance: number;
}

export type SortMode = 'distance' | 'cleanliness';

export interface Filters {
  sort: SortMode;
  freeOnly: boolean;
}

export interface Settings {
  forceDemoLocation: boolean;
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
