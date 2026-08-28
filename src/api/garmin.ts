const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const API_PROXY_EXT = import.meta.env.VITE_API_PROXY_EXT ?? "";
const TOKEN_KEY = "garmin_tokens";
const HEALTH_CACHE_KEY = "garmin_health_cache";

interface GarminOauth1Token {
  oauth_token: string;
  oauth_token_secret: string;
}

interface GarminOauth2Token {
  access_token: string;
  [key: string]: unknown;
}

interface GarminTokens {
  oauth1: GarminOauth1Token;
  oauth2: GarminOauth2Token;
}

export interface GarminWeightEntry {
  date: string;
  weightKg: number;
}

export interface GarminSleepEntry {
  date: string;
  score: number;
  deepMin: number;
  lightMin: number;
  remMin: number;
  awakeMin: number;
  totalMin: number;
}

export interface GarminBodyBatteryEntry {
  date: string;
  low: number;
  high: number;
}

export interface GarminHealthData {
  weight: GarminWeightEntry[];
  sleep: GarminSleepEntry[];
  bodyBattery: GarminBodyBatteryEntry[];
}

export function getStoredGarminTokens(): GarminTokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeTokens(tokens: GarminTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function isGarminConnected(): boolean {
  return getStoredGarminTokens() !== null;
}

export function disconnectGarmin() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(HEALTH_CACHE_KEY);
}

export async function loginGarmin(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/garmin-login${API_PROXY_EXT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Login failed: ${res.status}`);

  storeTokens({ oauth1: data.oauth1, oauth2: data.oauth2 });
}

export async function fetchGarminHealth(): Promise<GarminHealthData> {
  const tokens = getStoredGarminTokens();
  if (!tokens) throw new Error("Not connected to Garmin");

  const res = await fetch(`${API_BASE}/api/garmin-health${API_PROXY_EXT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tokens),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Health fetch failed: ${res.status}`);

  if (data.tokens) storeTokens(data.tokens);
  const health: GarminHealthData = { weight: data.weight, sleep: data.sleep, bodyBattery: data.bodyBattery };
  localStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify(health));
  return health;
}

export function getCachedGarminHealth(): GarminHealthData | null {
  try {
    const raw = localStorage.getItem(HEALTH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
