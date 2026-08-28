export const TOOLTIP_STYLE = {
  background: "var(--tooltip-bg)",
  border: "1px solid var(--tooltip-border)",
  borderRadius: 10,
  color: "var(--tooltip-text)",
};

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Like formatDuration but returns "0m" and omits minutes when zero hours
export function formatTime(seconds: number): string {
  if (seconds === 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(1);
}

export function formatPace(avgSpeed: number): string {
  if (avgSpeed === 0) return "--";
  const paceMinPerKm = 1000 / 60 / avgSpeed;
  const min = Math.floor(paceMinPerKm);
  const sec = Math.round((paceMinPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function normalizeSportLabel(raw: string): string {
  if (raw === "VirtualRide") return "Virtual Ride";
  if (raw === "EBikeRide") return "E-Bike Ride";
  if (raw === "GravelRide") return "Gravel Ride";
  if (raw === "MountainBikeRide") return "MTB";
  if (raw === "TrailRun") return "Trail Run";
  if (raw === "VirtualRun") return "Virtual Run";
  return raw;
}

export const RUN_TYPES = new Set(["Run", "TrailRun", "Treadmill", "VirtualRun"]);
export const RIDE_TYPES = new Set(["Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide"]);

export type SportFilter = "all" | "rides" | "runs" | "hikes";

export const SPORT_FILTER_OPTIONS = ["all", "rides", "runs", "hikes"] as const satisfies readonly SportFilter[];

export const SPORT_FILTER_LABELS: Record<SportFilter, string> = {
  all: "All",
  rides: "Rides",
  runs: "Runs",
  hikes: "Hikes",
};

export function matchesSportFilter(a: { type: string; sport_type: string }, filter: SportFilter): boolean {
  if (filter === "all") return true;
  if (filter === "rides") return RIDE_TYPES.has(a.type) || RIDE_TYPES.has(a.sport_type);
  if (filter === "runs") return RUN_TYPES.has(a.type) || RUN_TYPES.has(a.sport_type);
  return a.type === "Hike" || a.sport_type === "Hike";
}
