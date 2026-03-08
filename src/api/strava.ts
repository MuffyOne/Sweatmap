const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_STRAVA_CLIENT_SECRET;
const REDIRECT_URI = import.meta.env.VITE_STRAVA_REDIRECT_URI;

const TOKEN_KEY = "strava_tokens";
const CACHE_KEY = "strava_cache";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface Athlete {
  id: number;
  firstname: string;
  lastname: string;
  profile_medium?: string;
}

export interface SegmentEffort {
  id: number;
  elapsed_time: number;
  start_date: string;
  segment: {
    id: number;
    name: string;
    distance: number;
    average_grade: number;
    maximum_grade: number;
    city: string | null;
    state: string | null;
    country: string | null;
    climb_category: number;
  };
  activity: { id: number };
}

interface Cache {
  activities: Activity[];
  athlete: Athlete;
  koms?: SegmentEffort[];
  cachedAt: number;
}

export function getCache(): Cache | null {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Cache;
}

export function isCacheFresh(cache: Cache): boolean {
  return Date.now() - cache.cachedAt < CACHE_TTL_MS;
}

function setCache(data: Omit<Cache, "cachedAt">) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, cachedAt: Date.now() }));
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface Activity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  kudos_count: number;
  suffer_score?: number;
  pr_count?: number;
  achievement_count?: number;
  average_temp?: number;
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

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CACHE_KEY);
  window.location.href = "/";
}

export async function exchangeCode(code: string): Promise<Tokens> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
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
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
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

export async function fetchAthlete(): Promise<Athlete> {
  const token = await getValidToken();
  const res = await fetch("https://www.strava.com/api/v3/athlete", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);
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

export async function fetchAndCache(onProgress?: (count: number) => void): Promise<{ activities: Activity[]; athlete: Athlete; koms: SegmentEffort[] }> {
  const athlete = await fetchAthlete();
  const [activities, koms] = await Promise.all([fetchAllActivities(onProgress), fetchKOMs(athlete.id)]);
  setCache({ athlete, activities, koms });
  return { athlete, activities, koms };
}

export async function fetchNewActivities(
  existing: Activity[],
  onProgress?: (count: number) => void
): Promise<Activity[]> {
  // Fetch only activities newer than the most recent cached one
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

  const cache = getCache();
  if (cache) setCache({ athlete: cache.athlete, activities: merged, koms: cache.koms });

  return merged;
}

// Force sync: re-fetches the last year of activities (picks up renames/deletions)
// and preserves any cached activities older than the 1-year window.
export async function syncAndCache(onProgress?: (count: number) => void): Promise<{ activities: Activity[]; athlete: Athlete; koms: SegmentEffort[] }> {
  const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const athlete = await fetchAthlete();
  const [freshActivities, koms] = await Promise.all([fetchAllActivities(onProgress), fetchKOMs(athlete.id)]);

  // Preserve activities older than 1 year that aren't covered by the re-fetch
  const cache = getCache();
  const oldActivities = cache?.activities.filter(
    (a) => new Date(a.start_date).getTime() < oneYearAgoMs
  ) ?? [];
  const freshIds = new Set(freshActivities.map((a) => a.id));
  const activities = [...freshActivities, ...oldActivities.filter((a) => !freshIds.has(a.id))];

  setCache({ athlete, activities, koms });
  return { athlete, activities, koms };
}
