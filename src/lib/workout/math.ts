export function percentToWatts(ftp: number, percent: number): number {
  return Math.round((ftp * percent) / 100);
}

export function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function secondsToMinutes(seconds: number): number {
  return seconds / 60;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (remainingSeconds > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${minutes}m`;
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const elapsedMs = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 60 * 1000) {
    return "just now";
  }

  const minutes = Math.floor(elapsedMs / (60 * 1000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  return new Date(iso).toLocaleDateString();
}

export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function clampNumber(value: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function averagePercent(startPercent: number, endPercent: number): number {
  return (startPercent + endPercent) / 2;
}

export function midpoint(min: number, max: number): number {
  return (min + max) / 2;
}

export function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
