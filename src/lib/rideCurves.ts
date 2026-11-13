/**
 * Per-ride mean-maximal power (MMP), cached by activity id so Strava streams are fetched
 * once per ride instead of on every recompute. Also carries each ride's date, which lets
 * the fitness signature weight recent efforts more heavily than old ones.
 */

export const MMP_DURATIONS = [
  1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 5400, 7200, 10800, 14400, 18000, 21600,
];

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

// ── Recency weighting ──────────────────────────────────────────────────────
// XERT's signature falls when you stop training (a reported 244 W → 223 W after about
// six weeks off), so old efforts must count for less. These are the tuning constants;
// the defaults are a first guess fitted to that single data point.

/** Efforts newer than this count in full. */
export const DECAY_GRACE_DAYS = 7;
/** After the grace period, fraction of power lost per day of age. */
export const DECAY_PER_DAY = 0.0015;
/** Efforts older than this are ignored. */
export const WINDOW_DAYS = 90;
/** Decay never takes an effort below this fraction of its power. */
const DECAY_FLOOR = 0.5;

export function decayFactor(ageDays: number): number {
  if (ageDays <= DECAY_GRACE_DAYS) return 1;
  return Math.max(DECAY_FLOOR, 1 - (ageDays - DECAY_GRACE_DAYS) * DECAY_PER_DAY);
}

const DAY_MS = 86_400_000;

/**
 * Best power at each duration as of a date. With `decay`, each ride's power is scaled by its age
 * before taking the best, so a fresh hard effort beats an older, slightly harder one.
 * Rides after `asOf` are ignored, which lets the same function rebuild past signatures.
 */
export function curveAsOf(
  rides: RideCurve[],
  asOf: Date,
  opts: { decay: boolean; windowDays: number }
): { seconds: number; watts: number }[] {
  const best = MMP_DURATIONS.map(() => 0);
  for (const ride of rides) {
    const age = (asOf.getTime() - new Date(ride.date).getTime()) / DAY_MS;
    if (age < 0 || age > opts.windowDays) continue;
    const f = opts.decay ? decayFactor(age) : 1;
    ride.w.forEach((w, i) => {
      const v = w * f;
      if (v > best[i]) best[i] = v;
    });
  }
  return MMP_DURATIONS.map((seconds, i) => ({ seconds, watts: Math.round(best[i]) })).filter(
    (p) => p.watts > 0
  );
}
