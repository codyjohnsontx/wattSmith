export function percentToWatts(ftp: number, percent: number): number {
  return Math.round((ftp * percent) / 100);
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
