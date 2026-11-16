import type { Vote } from '../types';

export interface AdminStats {
  places: number;
  pending: number;
  votes: number;
  users: number;
  avgCleanliness: number;
}

export interface AdminPending {
  id: string;
  name: string;
  category: import('../types').ToiletCategory;
  district: string | null;
  address: string | null;
  lat: number;
  lng: number;
  photo: string | null;
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
  createdAt: string;
  updatedAt: string;
}
