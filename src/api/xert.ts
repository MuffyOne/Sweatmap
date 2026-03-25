const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const API_PROXY_EXT = import.meta.env.VITE_API_PROXY_EXT ?? "";
const TOKEN_KEY = "xert_tokens";
const TRAINING_CACHE_KEY = "xert_training_info";

interface XertTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface XertSignature {
  ftp: number;
  ltp: number;
  hie: number;
  pp: number;
}

export interface XertTrainingLoads {
  low: number;
  high: number;
  peak: number;
  total: number;
}

export interface XertTrainingInfo {
  signature: XertSignature;
  status: string;
  weight: number;
  tl: XertTrainingLoads;
  targetXSS: { low: number; high: number; peak: number; total: number };
  wotd: {
    name: string;
    difficulty: number;
    url: string;
    workoutId?: string;
    description?: string;
    type?: string;
  } | null;
}

export function getStoredXertTokens(): XertTokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

function storeTokens(tokens: XertTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function isXertConnected(): boolean {
  return getStoredXertTokens() !== null;
}

export function disconnectXert() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TRAINING_CACHE_KEY);
}

export async function loginXert(username: string, password: string): Promise<XertTokens> {
  const res = await fetch(`${API_BASE}/api/xert-token${API_PROXY_EXT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "password", username, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Login failed: ${res.status}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  const tokens: XertTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
  };
  storeTokens(tokens);
  return tokens;
}

async function refreshXertToken(refreshToken: string): Promise<XertTokens> {
  const res = await fetch(`${API_BASE}/api/xert-token${API_PROXY_EXT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  const tokens: XertTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
  };
  storeTokens(tokens);
  return tokens;
}

async function getValidXertToken(): Promise<string> {
  let tokens = getStoredXertTokens();
  if (!tokens) throw new Error("Not connected to XERT");

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at < now + 60) {
    tokens = await refreshXertToken(tokens.refresh_token);
  }
  return tokens.access_token;
}

export async function fetchTrainingInfo(): Promise<XertTrainingInfo> {
  const token = await getValidXertToken();
  const res = await fetch(`${API_BASE}/api/xert-training${API_PROXY_EXT}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`XERT API error: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Failed to fetch training info");

  const sig = data.signature ?? {};
  const tl = data.tl ?? {};
  const target = data.targetXSS ?? {};
  const info: XertTrainingInfo = {
    signature: { ftp: sig.ftp ?? 0, ltp: sig.ltp ?? 0, hie: sig.hie ?? 0, pp: sig.pp ?? 0 },
    status: data.status ?? "Unknown",
    weight: data.weight ?? 0,
    tl: { low: tl.low ?? 0, high: tl.high ?? 0, peak: tl.peak ?? 0, total: tl.total ?? 0 },
    targetXSS: { low: target.low ?? 0, high: target.high ?? 0, peak: target.peak ?? 0, total: target.total ?? 0 },
    wotd: data.wotd ? {
      name: data.wotd.name ?? "",
      difficulty: data.wotd.difficulty ?? 0,
      url: data.wotd.url ?? "",
      workoutId: data.wotd.workoutId ?? undefined,
      description: data.wotd.description ?? undefined,
      type: data.wotd.type ?? undefined,
    } : null,
  };

  localStorage.setItem(TRAINING_CACHE_KEY, JSON.stringify(info));
  return info;
}

export interface XertInterval {
  name: string;
  power: number;
  duration: number;
  restDuration: number;
}

export interface XertWorkoutDetail {
  intervals: XertInterval[];
}

export async function fetchWorkoutDetail(workoutId: string): Promise<XertWorkoutDetail> {
  const token = await getValidXertToken();
  const res = await fetch(`${API_BASE}/api/xert-workout/${workoutId}${API_PROXY_EXT}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Workout fetch failed: ${res.status}`);
  const data = await res.json();

  const intervals: XertInterval[] = (data.workout ?? []).map((entry: Record<string, unknown>) => ({
    name: (entry.name as string) ?? "",
    power: (entry.power as number) ?? 0,
    duration: (entry.duration as number) ?? 0,
    restDuration: (entry.restDuration as number) ?? 0,
  }));

  return { intervals };
}

export function getCachedTrainingInfo(): XertTrainingInfo | null {
  try {
    const raw = localStorage.getItem(TRAINING_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Validate minimum expected shape
    if (!data?.signature || !data?.tl) {
      localStorage.removeItem(TRAINING_CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    localStorage.removeItem(TRAINING_CACHE_KEY);
    return null;
  }
}
