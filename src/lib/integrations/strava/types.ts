export interface StravaConnectionStatus {
  connected: boolean;
  athleteId?: string;
  connectedAt?: string;
  scopes: string[];
  reconnectRequired: boolean;
  cacheRetentionDays: 7;
}

export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete?: { id: number | string };
}

export interface StravaActivityResponse {
  id: number | string;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date?: string;
  moving_time?: number;
  elapsed_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  trainer?: boolean;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  device_watts?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  kilojoules?: number;
  athlete?: { id?: number | string };
}

export interface StravaStreamResponse {
  type: string;
  data: Array<number | boolean | null>;
  series_type?: string;
  original_size?: number;
  resolution?: string;
}
