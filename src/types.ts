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

export type ToiletType = 'alafranga' | 'alaturka' | 'ikisi';

/** Son 3 saatteki kullanıcı bildirimleri (server/status.js) */
export interface PlaceStatus {
  /** En az 2 farklı kullanıcı "kapalı" bildirdi */
  closed: boolean;
  closedReports: number;
  noSupplies: number;
  crowded: number;
}

export type ReportType = 'closed' | 'no_supplies' | 'crowded' | 'open';

export interface Vote {
  cleanliness: number;
  comfort: number;
  isPaid: boolean;
  priceAmount: number | null;
  comment: string | null;
  toiletType?: ToiletType | null;
}

export interface Place extends LatLng {
  id: string;
  name: string;
  category: ToiletCategory;
  district: string | null;
  address: string | null;
  /** Fotoğraf /api/places/:id/photo adresinden yüklenir */
  hasPhoto: boolean;
  hours: string | null;
  accessible: boolean;
  babyChanging: boolean;
  /** Oy çoğunluğu, yoksa OSM toilets:position */
  toiletType: ToiletType | null;
  /** Şifresiz / herkese açık */
  publicAccess: boolean;
  source: 'seed' | 'user';
  createdAt: string;
  stats: PlaceStats;
  status: PlaceStatus;
  isFavorite: boolean;
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
  displayName: string;
  avatarUrl: string | null;
}

/** GET /api/users/:id — herkese açık profil */
export interface PublicProfile {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  createdAt: string;
  stats: { votes: number; comments: number; placesAdded: number };
  reviews: (Vote & { placeId: string; placeName: string; updatedAt: string })[];
}

/** GET /api/profile — kendi profilim */
export interface MyProfile {
  user: User & { bio: string; createdAt: string };
  stats: { votes: number; comments: number; placesAdded: number; pending: number; favorites: number; contributions: number };
  activity: {
    kind: 'vote' | 'report' | 'favorite' | 'place' | 'pending';
    placeId: string;
    placeName: string;
    at: string;
    cleanliness?: number;
    comfort?: number;
    comment?: string | null;
    reportType?: ReportType;
  }[];
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

export type SortMode = 'distance' | 'cleanliness' | 'cheapest' | 'popular';

export type FilterChip = 'free' | 'accessible' | 'baby' | 'open' | 'public' | 'alafranga' | 'alaturka' | 'favorites';

export interface Filters {
  sort: SortMode;
  chips: FilterChip[];
}

/** Uygulama içi yaya rotası (Acil ya da Yol Tarifi) */
export interface RouteState {
  placeId: string;
  /** emergency: Acil kartı gösterilir · navigate: rota bilgi kartı */
  mode: 'emergency' | 'navigate';
  points: LatLng[];
  /** Rota servisi yanıt vermedi → kesikli kuş uçuşu çizgi */
  approximate: boolean;
  /** metre */
  distance: number;
  /** saniye */
  duration: number;
  /** Sokak rotası hâlâ hesaplanıyor */
  loading: boolean;
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'info' | 'error';
}
