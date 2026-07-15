export interface IntegrationConnection {
  provider: "strava" | "garmin" | "trainingpeaks";
  status: "not_connected" | "connected" | "expired" | "insufficient_scope";
  connectedAt?: string;
}
