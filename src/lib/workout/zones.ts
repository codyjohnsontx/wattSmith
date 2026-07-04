export interface Zone {
  id: string;
  label: string;
  range: string;
  max: number;
  color: string;
}

// Single source of truth for intensity zones, consumed by the workout chart
// (fill color + label + legend) and the summary (time-in-zone allocation).
// Ordered ascending: a percentage belongs to the first zone whose `max` it does
// not exceed, so the bands are contiguous with no gaps.
export const zones: Zone[] = [
  { id: "recovery", label: "Recovery", range: "<55%", max: 54.999, color: "#64748b" },
  { id: "endurance", label: "Endurance", range: "55-75%", max: 75, color: "#22c55e" },
  { id: "tempo", label: "Tempo", range: "76-87%", max: 87, color: "#84cc16" },
  { id: "sweet-spot", label: "Sweet Spot", range: "88-94%", max: 94, color: "#eab308" },
  { id: "threshold", label: "Threshold", range: "95-105%", max: 105, color: "#f59e0b" },
  { id: "vo2", label: "VO2", range: "106-120%", max: 120, color: "#f97316" },
  { id: "anaerobic", label: "Anaerobic", range: ">120%", max: Infinity, color: "#ef4444" },
];

export function zoneForPercent(percent: number): Zone {
  return zones.find((zone) => percent <= zone.max) ?? zones[zones.length - 1];
}
