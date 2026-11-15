export type ToiletCategory = 'avm' | 'kafe' | 'belediye' | 'park' | 'diger';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Toilet extends LatLng {
  id: string;
  name: string;
  category: ToiletCategory;
  address?: string;
  photo: string;
  /** 1-5 */
  cleanliness: number;
  /** 1-5 */
  comfort: number;
  isFree: boolean;
  price?: string;
  hours?: string;
  accessible?: boolean;
  babyChanging?: boolean;
  createdAt: string;
  /** Kullanıcı tarafından eklendiyse true */
  userAdded?: boolean;
}

export type ToiletWithDistance = Toilet & { distance: number };

export type SortMode = 'distance' | 'cleanliness';

export interface Filters {
  sort: SortMode;
  freeOnly: boolean;
}

export type MapStyle = 'voyager' | 'positron' | 'osm';

export interface Settings {
  mapStyle: MapStyle;
  forceDemoLocation: boolean;
}

export interface EmergencyState {
  toiletId: string;
  route: LatLng[];
  approximate: boolean;
  routeDistance?: number;
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'info' | 'error';
}
