/**
 * Per-ride mean-maximal power (MMP), cached by activity id so Strava streams are fetched
 * once per ride instead of on every recompute. Also carries each ride's date, which lets
 * the fitness signature weight recent efforts more heavily than old ones.
 */

export const MMP_DURATIONS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 5400, 7200, 10800, 14400, 18000, 21600];

export interface RideCurve {
  /** Activity start (start_date_local). */
  date: string;
  /** Best average power for each entry of MMP_DURATIONS; 0 where the ride was too short. */
  w: number[];
}

const STORAGE_KEY = "ride_mmp_v1";

function bestAverage(watts: number[], secs: number): number {
  if (watts.length < secs) return 0;
  let sum = 0;
  for (let i = 0; i < secs; i++) sum += watts[i];
  let max = sum;
  for (let i = secs; i < watts.length; i++) {
    sum += watts[i] - watts[i - secs];
    if (sum > max) max = sum;
  }
  return Math.round(max / secs);
}

export function computeRideCurve(watts: number[], date: string): RideCurve {
  return { date, w: MMP_DURATIONS.map((d) => bestAverage(watts, d)) };
}

export function loadRideCurves(): Record<string, RideCurve> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, RideCurve>) : {};
  } catch {
    return {};
  }
}

export function saveRideCurves(curves: Record<string, RideCurve>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(curves));
  } catch {
    // Storage full or unavailable: curves will just be recomputed next time.
  }
}
