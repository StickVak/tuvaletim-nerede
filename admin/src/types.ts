import type { Place, ToiletCategory, Vote } from '../../src/types';

export interface AdminStats {
  places: number;
  closedPlaces: number;
  pending: number;
  votes: number;
  users: number;
  /** Çözülmemiş ihbarı olan mekan sayısı */
  reports: number;
  /** Bunlardan ≥2 farklı kullanıcının aynı sorunu bildirdiği (şüpheli) mekanlar */
  flaggedPlaces: number;
  avgCleanliness: number;
}

export interface AdminPending {
  id: string;
  name: string;
  category: ToiletCategory;
  province: string | null;
  district: string | null;
  address: string | null;
  lat: number;
  lng: number;
  /** Dış mekan fotoğrafının yönetim API adresi (yoksa null) */
  photo: string | null;
  hasPhoto: boolean;
  hours: string | null;
  accessible: boolean;
  babyChanging: boolean;
  submittedAt: string;
  username: string | null;
  vote: Vote;
}

export interface AdminVote extends Vote {
  id: number;
  placeId: string;
  placeName: string;
  username: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export type ReportType = 'closed' | 'no_supplies' | 'crowded';

export const REPORT_LABEL: Record<ReportType | 'open', string> = {
  closed: 'Kapalı',
  no_supplies: 'Kağıt/sabun yok',
  crowded: 'Çok kalabalık',
  open: 'Açık (sorun yok)',
};

/** "Temiz Kalp" ihbar kuyruğundaki bir mekan */
export interface AdminReportGroup {
  place: Place;
  counts: Record<ReportType, number>;
  flagged: boolean;
  lastReportAt: string;
  reports: { id: number; userId: number; username: string; type: ReportType; createdAt: string }[];
}

export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  votes: number;
  comments: number;
  reports: number;
  placesAdded: number;
  pending: number;
  lastActiveAt: string | null;
}

export interface AdminUserDetail {
  user: Omit<AdminUser, 'votes' | 'comments' | 'reports' | 'placesAdded' | 'pending' | 'lastActiveAt'>;
  votes: AdminVote[];
  reports: { id: number; placeId: string; placeName: string; type: ReportType | 'open'; createdAt: string; resolvedAt: string | null }[];
  placesAdded: { id: string; name: string; category: ToiletCategory; closedAt: string | null; createdAt: string }[];
  pending: { id: string; name: string; category: ToiletCategory; submittedAt: string }[];
}

export type Act = (fn: () => Promise<unknown>, success: string) => Promise<boolean>;
