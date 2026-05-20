/**
 * Mock Strava API module for local development.
 * Activated via VITE_MOCK_DATA=true + Vite resolve alias.
 * Never imported in production builds.
 */

// Re-export types from the real module (alias only redirects consumer imports)
export type { Activity, Athlete, SegmentEffort, ActivityStreams } from "./strava.types";
import type { Activity, Athlete, SegmentEffort, ActivityStreams } from "./strava.types";

const TOKEN_KEY = "strava_tokens";
const CACHE_KEY = "strava_cache";

// ── Seeded PRNG (mulberry32) ──
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function randBetween(min: number, max: number) { return min + rand() * (max - min); }
function randInt(min: number, max: number) { return Math.floor(randBetween(min, max + 1)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)]; }

function normalish(mean: number, std: number): number {
  // Box-Muller-ish with our seeded rand
  const u1 = rand() || 0.001;
  const u2 = rand();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ── Polyline encoder (Google format) ──

function encodeCoord(v: number): string {
  let val = Math.round(v * 1e5);
  val = val < 0 ? ~(val << 1) : val << 1;
  let out = "";
  while (val >= 0x20) {
    out += String.fromCharCode(((0x20 | (val & 0x1f)) + 63));
    val >>= 5;
  }
  out += String.fromCharCode(val + 63);
  return out;
}

function generatePolyline(actId: number, distKm: number): string {
  const r = mulberry32(actId * 7919);
  const steps = Math.max(20, Math.round(distKm * 2));
  // Pick a random starting location from a few known cycling cities
  const bases: [number, number][] = [
    [51.5, -0.1], [48.85, 2.35], [40.71, -74.0],
    [37.77, -122.4], [45.52, -122.68], [52.37, 4.9],
  ];
  const base = bases[Math.floor(r() * bases.length)];
  let lat = base[0];
  let lng = base[1];
  let encoded = "";
  let prevLat = 0;
  let prevLng = 0;
  for (let i = 0; i < steps; i++) {
    lat += (r() - 0.5) * 0.02;
    lng += (r() - 0.5) * 0.025;
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    encoded += encodeCoord((iLat - prevLat) / 1e5);
    encoded += encodeCoord((iLng - prevLng) / 1e5);
    prevLat = iLat;
    prevLng = iLng;
  }
  return encoded;
}

// ── Data generation ──

const MOCK_ATHLETE: Athlete = {
  id: 99999,
  firstname: "Demo",
  lastname: "Athlete",
  profile_medium: undefined,
};

const RIDE_NAMES = [
  "Morning Ride", "Lunch Ride", "Evening Ride", "Sunday Ride",
  "Recovery Ride", "Group Ride", "Solo Spin", "Coffee Ride",
  "Hilly Loop", "Flat & Fast", "Weekend Explorer", "Hills Repeats",
];

const RUN_NAMES = [
  "Morning Run", "Easy Run", "Tempo Run", "Long Run",
  "Recovery Jog", "Evening Run", "Interval Session", "Trail Run",
  "Park Run", "Fartlek", "Steady State", "Pre-work Run",
];

function seasonalTemp(month: number): number {
  // Rough Northern Hemisphere: Jan=5, Jul=28
  const base = 16.5 + 11.5 * Math.sin(((month - 4) / 12) * 2 * Math.PI);
  return clamp(base + normalish(0, 3), -2, 38);
}

interface Cache {
  activities: Activity[];
  athlete: Athlete;
  koms?: SegmentEffort[];
  cachedAt: number;
}

let _activities: Activity[] | null = null;
let _koms: SegmentEffort[] | null = null;

function generateActivities(): Activity[] {
  if (_activities) return _activities;

  const acts: Activity[] = [];
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  let cursor = new Date(oneYearAgo);
  let id = 10000;

  while (cursor < now) {
    // 1-3 days between activities, slight bias toward more recent
    const gap = randBetween(0.8, 2.8);
    cursor = new Date(cursor.getTime() + gap * 24 * 60 * 60 * 1000);
    if (cursor >= now) break;

    const isRide = rand() < 0.6;
    const month = cursor.getMonth();
    const temp = Math.round(seasonalTemp(month) * 10) / 10;

    let act: Activity;

    if (isRide) {
      const distKm = clamp(normalish(60, 25), 10, 180);
      const distM = distKm * 1000;
      const avgSpeedMs = clamp(normalish(7.8, 0.8), 6.0, 9.5); // ~28 km/h avg
      const movingTime = Math.round(distM / avgSpeedMs);
      const elapsedTime = Math.round(movingTime * randBetween(1.02, 1.15));
      const elevGainPerKm = randBetween(8, 16);
      const elevGain = Math.round(distKm * elevGainPerKm);
      const avgWatts = Math.round(clamp(normalish(190, 25), 130, 280));
      const maxWatts = Math.round(avgWatts * randBetween(2.5, 3.8));
      const avgHR = Math.round(clamp(normalish(145, 8), 120, 170));
      const maxHR = Math.round(clamp(avgHR + randBetween(20, 40), 160, 200));
      const sportType = rand() < 0.08 ? "GravelRide" : rand() < 0.05 ? "VirtualRide" : "Ride";

      const rideId = id++;
      act = {
        id: rideId,
        name: pick(RIDE_NAMES),
        type: sportType === "VirtualRide" ? "VirtualRide" : "Ride",
        sport_type: sportType,
        distance: Math.round(distM),
        moving_time: movingTime,
        elapsed_time: elapsedTime,
        total_elevation_gain: elevGain,
        start_date: cursor.toISOString(),
        start_date_local: cursor.toISOString(),
        average_speed: Math.round(avgSpeedMs * 100) / 100,
        max_speed: Math.round(avgSpeedMs * randBetween(1.4, 1.8) * 100) / 100,
        average_heartrate: avgHR,
        max_heartrate: maxHR,
        average_watts: avgWatts,
        max_watts: maxWatts,
        kudos_count: randInt(0, 15),
        suffer_score: randInt(30, 180),
        pr_count: rand() < 0.3 ? randInt(1, 4) : 0,
        achievement_count: rand() < 0.4 ? randInt(1, 6) : 0,
        average_temp: temp,
        map: sportType !== "VirtualRide" ? { summary_polyline: generatePolyline(rideId, distKm) } : undefined,
      };
    } else {
      // Running
      const distKm = clamp(normalish(8, 3), 3, 25);
      const distM = distKm * 1000;
      const paceMinKm = clamp(normalish(5.2, 0.5), 4.0, 6.5);
      const avgSpeedMs = 1000 / (paceMinKm * 60);
      const movingTime = Math.round(distM / avgSpeedMs);
      const elapsedTime = Math.round(movingTime * randBetween(1.01, 1.08));
      const elevGain = Math.round(distKm * randBetween(5, 12));
      const avgHR = Math.round(clamp(normalish(155, 8), 130, 180));
      const maxHR = Math.round(clamp(avgHR + randBetween(15, 35), 165, 200));
      const sportType = rand() < 0.1 ? "TrailRun" : "Run";

      const runId = id++;
      act = {
        id: runId,
        name: distKm > 15 ? "Long Run" : pick(RUN_NAMES),
        type: "Run",
        sport_type: sportType,
        distance: Math.round(distM),
        moving_time: movingTime,
        elapsed_time: elapsedTime,
        total_elevation_gain: elevGain,
        start_date: cursor.toISOString(),
        start_date_local: cursor.toISOString(),
        average_speed: Math.round(avgSpeedMs * 100) / 100,
        max_speed: Math.round(avgSpeedMs * randBetween(1.3, 1.6) * 100) / 100,
        average_heartrate: avgHR,
        max_heartrate: maxHR,
        kudos_count: randInt(0, 10),
        suffer_score: randInt(20, 120),
        pr_count: rand() < 0.25 ? randInt(1, 3) : 0,
        achievement_count: rand() < 0.35 ? randInt(1, 4) : 0,
        average_temp: temp,
        map: { summary_polyline: generatePolyline(runId, distKm) },
      };
    }

    acts.push(act);
  }

  _activities = acts;
  return acts;
}

function generateKoms(activities: Activity[]): SegmentEffort[] {
  if (_koms) return _koms;

  const rideActs = activities.filter((a) => a.type === "Ride" || a.sport_type === "Ride");
  const names = [
    "Hill Road Climb", "River Valley Sprint", "Mountain Pass", "Park Loop KOM",
    "Coastal Bluff Ascent",
  ];

  const koms: SegmentEffort[] = names.slice(0, Math.min(5, rideActs.length)).map((name, i) => {
    const act = rideActs[Math.floor((i / names.length) * rideActs.length)];
    const dist = randBetween(500, 3000);
    const avgGrade = randBetween(4, 12);
    return {
      id: 50000 + i,
      elapsed_time: Math.round(dist / (randBetween(3, 6))), // ~3-6 m/s uphill
      start_date: act.start_date,
      segment: {
        id: 60000 + i,
        name,
        distance: Math.round(dist),
        average_grade: Math.round(avgGrade * 10) / 10,
        maximum_grade: Math.round((avgGrade + randBetween(2, 8)) * 10) / 10,
        city: pick(["Boulder", "Portland", "Denver", "Tucson", null]),
        state: pick(["CO", "OR", "AZ", null]),
        country: "US",
        climb_category: avgGrade > 8 ? randInt(2, 4) : avgGrade > 5 ? 1 : 0,
      },
      activity: { id: act.id },
    };
  });

  _koms = koms;
  return koms;
}

// ── Stream generation ──

function generateWattsStream(activity: Activity): number[] {
  const len = Math.min(activity.moving_time, 10800); // cap at 3h
  const avg = activity.average_watts ?? 180;
  const stream: number[] = [];
  let current = avg;

  for (let i = 0; i < len; i++) {
    // Slow oscillations (effort changes)
    if (i % 120 === 0) {
      current = clamp(avg + normalish(0, avg * 0.2), avg * 0.3, avg * 2.5);
    }
    // Per-second noise
    const noise = normalish(0, avg * 0.08);
    stream.push(Math.max(0, Math.round(current + noise)));
  }

  return stream;
}

function generateHRStream(activity: Activity): number[] {
  const len = Math.min(activity.moving_time, 10800);
  const avg = activity.average_heartrate ?? 145;
  const stream: number[] = [];
  let current = avg - 20; // warmup

  for (let i = 0; i < len; i++) {
    // Gradual warmup for first 300s
    if (i < 300) {
      current += (avg - current) * 0.01;
    } else if (i % 180 === 0) {
      current = clamp(avg + normalish(0, 6), avg - 15, avg + 20);
    }
    const noise = normalish(0, 2);
    stream.push(Math.round(clamp(current + noise, 60, 210)));
  }

  return stream;
}

// ── Exported API (same interface as strava.ts) ──

export function getAuthUrl(): string {
  return "#mock-auth";
}

export function getStoredTokens() {
  // Always "authenticated" in mock mode
  return { access_token: "mock", refresh_token: "mock", expires_at: Date.now() / 1000 + 86400 };
}

export async function exchangeCode(_code: string) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(getStoredTokens()));
}

export async function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CACHE_KEY);
  window.location.href = "/";
}

// loadCache mirrors strava.ts but uses localStorage (mock doesn't need IndexedDB).
export async function loadCache(): Promise<Cache | null> {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Cache;
}

export function isCacheFresh(cache: Cache): boolean {
  return Date.now() - cache.cachedAt < 7 * 24 * 60 * 60 * 1000;
}

export async function loadAllTimeCache(): Promise<{ activities: Activity[]; cachedAt: number } | null> {
  return null; // mock: always show the prompt so the full UX is testable
}

export function isAllTimeCacheFresh(cache: { cachedAt: number }): boolean {
  return Date.now() - cache.cachedAt < 30 * 24 * 60 * 60 * 1000;
}

export async function fetchAndCacheAllTime(
  onProgress?: (count: number) => void
): Promise<Activity[]> {
  await new Promise((r) => setTimeout(r, 800));
  const acts = generateActivities();
  onProgress?.(acts.length);
  return acts;
}

export async function fetchActivity(activityId: number): Promise<Activity | null> {
  const acts = generateActivities();
  return acts.find((a) => a.id === activityId) ?? null;
}

export async function processPendingWebhookEvents(_existing: Activity[]): Promise<Activity[] | null> {
  return null; // no webhook in mock mode
}

export async function updateCachedActivities(_activities: Activity[]): Promise<void> {
  // no-op in mock
}

export async function fetchAndCache(
  onProgress?: (count: number) => void
): Promise<{ activities: Activity[]; athlete: Athlete; koms: SegmentEffort[] }> {
  await new Promise((r) => setTimeout(r, 300));
  const activities = generateActivities();
  onProgress?.(activities.length);
  const koms = generateKoms(activities);
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ activities, athlete: MOCK_ATHLETE, koms, cachedAt: Date.now() })
  );
  return { activities, athlete: MOCK_ATHLETE, koms };
}

export async function fetchNewActivities(
  existing: Activity[],
  _onProgress?: (count: number) => void
): Promise<Activity[]> {
  // No new activities in mock mode
  return existing;
}

export async function syncAndCache(
  onProgress?: (count: number) => void
): Promise<{ activities: Activity[]; athlete: Athlete; koms: SegmentEffort[] }> {
  return fetchAndCache(onProgress);
}

export async function fetchActivityWatts(activityId: number): Promise<number[] | null> {
  const acts = generateActivities();
  const act = acts.find((a) => a.id === activityId);
  if (!act || !act.average_watts) return null;
  await new Promise((r) => setTimeout(r, 20)); // tiny delay for realism
  return generateWattsStream(act);
}

export async function fetchActivityStreams(activityId: number): Promise<ActivityStreams | null> {
  const acts = generateActivities();
  const act = acts.find((a) => a.id === activityId);
  if (!act) return null;
  await new Promise((r) => setTimeout(r, 50));

  const len = Math.min(act.moving_time, 10800);
  const time = Array.from({ length: len }, (_, i) => i);

  // Altitude: gradual hills
  const altitude: number[] = [];
  let alt = randBetween(100, 400);
  for (let i = 0; i < len; i++) {
    alt += normalish(0, 0.3);
    if (i % 300 === 0) alt += normalish(0, 15);
    altitude.push(Math.max(0, Math.round(alt * 10) / 10));
  }

  // Speed: m/s with variation
  const velocity_smooth = time.map(() =>
    Math.max(0, Math.round((act.average_speed + normalish(0, act.average_speed * 0.15)) * 100) / 100)
  );

  // Cadence
  const baseCadence = act.type === "Run" || act.sport_type === "Run" ? 170 : 85;
  const cadence = time.map(() => Math.round(clamp(normalish(baseCadence, baseCadence * 0.06), baseCadence * 0.7, baseCadence * 1.2)));

  const streams: ActivityStreams = { time, altitude, velocity_smooth, cadence };

  if (act.average_watts) streams.watts = generateWattsStream(act);
  if (act.average_heartrate) streams.heartrate = generateHRStream(act);

  return streams;
}

export async function fetchActivityHeartrate(activityId: number): Promise<number[] | null> {
  const acts = generateActivities();
  const act = acts.find((a) => a.id === activityId);
  if (!act || !act.average_heartrate) return null;
  await new Promise((r) => setTimeout(r, 20));
  return generateHRStream(act);
}
