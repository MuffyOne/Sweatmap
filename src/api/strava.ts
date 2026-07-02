import { dbGet, dbSet, dbClear } from "./db";

export type { Athlete, SegmentEffort, Activity, ActivityStreams, ClimbEffort, SegmentInfo, CustomClimb } from "./strava.types";
import type { Athlete, SegmentEffort, Activity, ActivityStreams, ClimbEffort, SegmentInfo } from "./strava.types";

const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_STRAVA_REDIRECT_URI;
// Present in local dev only — calls Strava directly.
// Must be absent in production builds so the serverless proxy is used instead.
const CLIENT_SECRET = import.meta.env.VITE_STRAVA_CLIENT_SECRET as string | undefined;
// Empty for same-origin deployments (Vercel / Hetzner).
// Set VITE_API_BASE if the proxy lives on a different origin.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";
// "" for Vercel serverless functions (/api/token, /api/refresh).
// Set to ".php" for Hetzner PHP proxy (/api/token.php, /api/refresh.php).
const API_PROXY_EXT = import.meta.env.VITE_API_PROXY_EXT ?? "";

const TOKEN_KEY = "strava_tokens";
const LEGACY_CACHE_KEY = "strava_cache"; // kept only for one-time migration from localStorage
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ALLTIME_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CLIMB_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── Cache types ──

export interface Cache {
  activities: Activity[];
  athlete: Athlete;
  koms?: SegmentEffort[];
  cachedAt: number;
}

export interface AllTimeCache {
  activities: Activity[];
  cachedAt: number;
}

// ── IndexedDB cache ──

export async function loadCache(): Promise<Cache | null> {
  const idb = await dbGet<Cache>("cache");
  if (idb) return idb;
  // One-time migration from localStorage → IndexedDB
  const raw = localStorage.getItem(LEGACY_CACHE_KEY);
  if (!raw) return null;
  const cache = JSON.parse(raw) as Cache;
  await dbSet("cache", cache).catch(() => {});
  localStorage.removeItem(LEGACY_CACHE_KEY);
  return cache;
}

export function isCacheFresh(cache: Cache): boolean {
  return Date.now() - cache.cachedAt < CACHE_TTL_MS;
}

async function saveCache(data: Omit<Cache, "cachedAt">): Promise<void> {
  await dbSet("cache", { ...data, cachedAt: Date.now() });
}

export async function loadAllTimeCache(): Promise<AllTimeCache | null> {
  return dbGet<AllTimeCache>("alltime_cache");
}

export function isAllTimeCacheFresh(cache: AllTimeCache): boolean {
  return Date.now() - cache.cachedAt < ALLTIME_TTL_MS;
}

async function saveAllTimeCache(activities: Activity[]): Promise<void> {
  await dbSet("alltime_cache", { activities, cachedAt: Date.now() });
}

// Applies a delta to the cached activities without a full re-fetch.
export async function updateCachedActivities(activities: Activity[]): Promise<void> {
  const cache = await loadCache();
  if (cache) await saveCache({ ...cache, activities });
}

// ── Tokens (localStorage — small, auth-critical) ──

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export function getAuthUrl(): string {
  const scope = "read,activity:read_all";
  return `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
}

export function getStoredTokens(): Tokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

function storeTokens(tokens: Tokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export async function logout() {
  localStorage.removeItem(TOKEN_KEY);
  await dbClear().catch(() => {});
  window.location.href = "/";
}

// ── OAuth ──

export async function exchangeCode(code: string): Promise<Tokens> {
  const res = CLIENT_SECRET
    ? await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: "authorization_code" }),
      })
    : await fetch(`${API_BASE}/api/token${API_PROXY_EXT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Token exchange failed: ${res.status}`);
  const tokens: Tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
  storeTokens(tokens);
  return tokens;
}

async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const res = CLIENT_SECRET
    ? await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
      })
    : await fetch(`${API_BASE}/api/refresh${API_PROXY_EXT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
  const data = await res.json();
  const tokens: Tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
  storeTokens(tokens);
  return tokens;
}

async function getValidToken(): Promise<string> {
  let tokens = getStoredTokens();
  if (!tokens) throw new Error("Not authenticated");
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at < now + 60) {
    tokens = await refreshTokens(tokens.refresh_token);
  }
  return tokens.access_token;
}

// ── Strava API ──

export async function fetchAthlete(): Promise<Athlete> {
  const token = await getValidToken();
  const res = await fetch("https://www.strava.com/api/v3/athlete", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);
  return res.json();
}

export async function fetchActivity(activityId: number): Promise<Activity | null> {
  const token = await getValidToken();
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchActivities(page = 1, perPage = 200, after?: number): Promise<Activity[]> {
  const token = await getValidToken();
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (after !== undefined) params.set("after", String(after));
  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);
  return res.json();
}

export async function fetchAllActivities(onProgress?: (count: number) => void): Promise<Activity[]> {
  const oneYearAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
  const all: Activity[] = [];
  let page = 1;
  while (true) {
    const batch = await fetchActivities(page, 200, oneYearAgo);
    all.push(...batch);
    onProgress?.(all.length);
    if (batch.length < 200) break;
    page++;
  }
  return all;
}

// Fetches every activity ever (no date filter), throttled between pages.
export async function fetchAndCacheAllTime(
  onProgress?: (count: number) => void
): Promise<Activity[]> {
  const all: Activity[] = [];
  let page = 1;
  while (true) {
    const batch = await fetchActivities(page, 200);
    all.push(...batch);
    onProgress?.(all.length);
    if (batch.length < 200) break;
    page++;
    await new Promise((r) => setTimeout(r, 1100)); // throttle between pages
  }
  await saveAllTimeCache(all);
  return all;
}

export async function fetchActivityHeartrate(activityId: number): Promise<number[] | null> {
  const token = await getValidToken();
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate&key_by_type=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) return null;
  const data = await res.json();
  return data.heartrate?.data ?? null;
}

export async function fetchActivityWatts(activityId: number): Promise<number[] | null> {
  const token = await getValidToken();
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=watts&key_by_type=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) return null;
  const data = await res.json();
  return data.watts?.data ?? null;
}

export async function fetchActivityStreams(activityId: number): Promise<ActivityStreams | null> {
  const token = await getValidToken();
  const keys = "time,altitude,heartrate,watts,cadence,velocity_smooth";
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${keys}&key_by_type=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) return null;
  const data = await res.json();
  return {
    time: data.time?.data ?? undefined,
    altitude: data.altitude?.data ?? undefined,
    heartrate: data.heartrate?.data ?? undefined,
    watts: data.watts?.data ?? undefined,
    cadence: data.cadence?.data ?? undefined,
    velocity_smooth: data.velocity_smooth?.data ?? undefined,
  };
}

export async function fetchKOMs(athleteId: number): Promise<SegmentEffort[]> {
  const token = await getValidToken();
  const all: SegmentEffort[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({ page: String(page), per_page: "200" });
    const res = await fetch(
      `https://www.strava.com/api/v3/athletes/${athleteId}/koms?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) break;
    const batch: SegmentEffort[] = await res.json();
    all.push(...batch);
    if (batch.length < 200) break;
    page++;
  }
  return all;
}

// ── High-level cache operations ──

export async function fetchAndCache(
  onProgress?: (count: number) => void
): Promise<{ activities: Activity[]; athlete: Athlete; koms: SegmentEffort[] }> {
  const athlete = await fetchAthlete();
  const [activities, koms] = await Promise.all([fetchAllActivities(onProgress), fetchKOMs(athlete.id)]);
  await saveCache({ athlete, activities, koms });
  return { athlete, activities, koms };
}

export async function fetchNewActivities(
  existing: Activity[],
  onProgress?: (count: number) => void
): Promise<Activity[]> {
  const latestAt = existing.reduce((max, a) => {
    const t = Math.floor(new Date(a.start_date).getTime() / 1000);
    return t > max ? t : max;
  }, Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000));

  const newOnes: Activity[] = [];
  let page = 1;
  while (true) {
    const batch = await fetchActivities(page, 200, latestAt);
    newOnes.push(...batch);
    onProgress?.(newOnes.length);
    if (batch.length < 200) break;
    page++;
  }

  const existingIds = new Set(existing.map((a) => a.id));
  const merged = [...newOnes.filter((a) => !existingIds.has(a.id)), ...existing];

  const cache = await loadCache();
  if (cache) await saveCache({ athlete: cache.athlete, activities: merged, koms: cache.koms });

  return merged;
}

// Force sync: re-fetches the last year (picks up renames/deletions)
// and preserves any cached activities older than the 1-year window.
export async function syncAndCache(
  onProgress?: (count: number) => void
): Promise<{ activities: Activity[]; athlete: Athlete; koms: SegmentEffort[] }> {
  const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const athlete = await fetchAthlete();
  const [freshActivities, koms] = await Promise.all([fetchAllActivities(onProgress), fetchKOMs(athlete.id)]);

  const cache = await loadCache();
  const oldActivities =
    cache?.activities.filter((a) => new Date(a.start_date).getTime() < oneYearAgoMs) ?? [];
  const freshIds = new Set(freshActivities.map((a) => a.id));
  const activities = [...freshActivities, ...oldActivities.filter((a) => !freshIds.has(a.id))];

  await saveCache({ athlete, activities, koms });
  return { athlete, activities, koms };
}

// ── Climb / segment efforts ──

interface ClimbEffortCache {
  efforts: ClimbEffort[];
  cachedAt: number;
}

export async function fetchSegmentEfforts(segmentId: number): Promise<ClimbEffort[]> {
  const cacheKey = `climb_efforts_${segmentId}`;
  const cached = await dbGet<ClimbEffortCache>(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CLIMB_TTL_MS) {
    return cached.efforts;
  }

  const token = await getValidToken();
  const efforts: ClimbEffort[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({ segment_id: String(segmentId), per_page: "200", page: String(page) });
    const res = await fetch(
      `https://www.strava.com/api/v3/segment_efforts?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) break;
    const batch: ClimbEffort[] = await res.json();
    efforts.push(...batch);
    if (batch.length < 200) break;
    page++;
  }

  efforts.sort((a, b) => new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime());
  await dbSet(cacheKey, { efforts, cachedAt: Date.now() });
  return efforts;
}

export async function fetchSegmentInfo(segmentId: number): Promise<SegmentInfo | null> {
  const token = await getValidToken();
  const res = await fetch(
    `https://www.strava.com/api/v3/segments/${segmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

// ── Webhook event processing ──

interface WebhookEvent {
  aspect_type: "create" | "update" | "delete";
  object_id: number;
  object_type: "activity" | "athlete";
}

// Called on app load to apply any Strava push events that arrived while offline.
// Returns the updated activities array, or null if nothing changed / webhook not configured.
export async function processPendingWebhookEvents(
  existing: Activity[]
): Promise<Activity[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/pending-events`);
    if (!res.ok) return null;
    const events: WebhookEvent[] = await res.json();
    if (events.length === 0) return null;

    let activities = [...existing];
    for (const event of events) {
      if (event.object_type !== "activity") continue;
      if (event.aspect_type === "create" || event.aspect_type === "update") {
        const updated = await fetchActivity(event.object_id);
        if (updated) {
          const idx = activities.findIndex((a) => a.id === event.object_id);
          if (idx >= 0) activities[idx] = updated;
          else activities = [updated, ...activities];
        }
      } else if (event.aspect_type === "delete") {
        activities = activities.filter((a) => a.id !== event.object_id);
      }
    }

    // Clear the processed events from the server queue
    await fetch(`${API_BASE}/api/pending-events`, { method: "DELETE" });
    return activities;
  } catch {
    return null; // webhook not configured — fail silently
  }
}
