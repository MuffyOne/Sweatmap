// Default-import + destructure (not a named import) — the package is CommonJS
// with obfuscated internals that trip up static named-export analysis (e.g.
// Vite's SSR module runner used by the local dev proxy in vite.config.ts).
import garminConnectPkg from "@gooin/garmin-connect";
import type { IOauth1Token, IOauth2Token, IGarminTokens } from "@gooin/garmin-connect/dist/garmin/types";

const { GarminConnect } = garminConnectPkg;

// Shared Garmin Connect logic used by both the Vercel functions (garmin-login.ts,
// garmin-health.ts) and the local Vite dev-server proxy (vite.config.ts), so the
// two runtimes can't drift out of sync.

// Garmin's daily-stats endpoints (sleep, body battery) page in blocks of up to
// 28 days and 400 on a longer span. Using 21 to stay safely clear of that
// boundary (28 was still 400-ing, likely an inclusive/off-by-one edge).
const HISTORY_DAYS = 21;

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
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
  tokens: IGarminTokens;
}

// The library's own getBodyBattery() hits a stale/broken endpoint
// (usersummary-service/stats/bodybattery/daily) that 400s. The actively
// maintained python-garminconnect uses this one instead — call it directly
// via the library's generic authenticated request helper.
const BODY_BATTERY_URL = "/wellness-service/wellness/bodyBattery/reports/daily";

// Response shape for this endpoint isn't in the library's types (we're
// bypassing its typed method), so this parses defensively: known field names
// first, then falls back to scanning any nested arrays for battery-level
// numbers (0-100, distinguishable from epoch timestamps which are far larger).
function parseBodyBatteryDay(day: unknown): GarminBodyBatteryEntry | null {
  if (!day || typeof day !== "object") return null;
  const d = day as Record<string, unknown>;
  const date = (d.calendarDate ?? d.date) as string | undefined;
  if (!date) return null;

  const values = d.values as { lowBodyBattery?: number; highBodyBattery?: number } | undefined;
  if (values && typeof values.lowBodyBattery === "number" && typeof values.highBodyBattery === "number") {
    return { date, low: values.lowBodyBattery, high: values.highBodyBattery };
  }

  const levels: number[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === "number" && Number.isInteger(node) && node >= 0 && node <= 100) levels.push(node);
  };
  for (const v of Object.values(d)) if (Array.isArray(v)) walk(v);

  if (levels.length === 0) return null;
  return { date, low: Math.min(...levels), high: Math.max(...levels) };
}

export async function garminLogin(username: string, password: string): Promise<IGarminTokens> {
  const client = new GarminConnect({ username, password });
  await client.login();
  return client.exportToken();
}

export async function garminFetchHealth(
  oauth1: IOauth1Token,
  oauth2: IOauth2Token
): Promise<GarminHealthData> {
  // The constructor requires non-empty username/password even when restoring a
  // saved session — they're never actually used since login() is never called
  // here (loadToken() bypasses it), only token refresh, which signs with OAuth1.
  const client = new GarminConnect({ username: "restored-session", password: "restored-session" });
  client.loadToken(oauth1, oauth2);

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);

  // Fetched independently (not Promise.all) so a hiccup on one of Garmin's
  // unofficial endpoints doesn't take down the other two metrics with it.
  const [weightResult, sleepResult, bodyBatteryResult] = await Promise.allSettled([
    client.getWeightRange(startDate, endDate),
    client.getSleepDailySummary(startDate, endDate),
    client.get<unknown[]>(BODY_BATTERY_URL, {
      params: { startDate: formatDate(startDate), endDate: formatDate(endDate) },
    }),
  ]);

  // Garmin returns these newest-first; sort ascending (oldest -> newest) so
  // charts read left-to-right chronologically and "last entry = latest" holds.
  const byDateAsc = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

  const weight: GarminWeightEntry[] =
    weightResult.status === "fulfilled"
      ? weightResult.value.dailyWeightSummaries
          .filter((day) => day.numOfWeightEntries > 0)
          .map((day) => ({
            date: day.summaryDate,
            weightKg: Math.round((day.latestWeight.weight / 1000) * 10) / 10,
          }))
          .sort(byDateAsc)
      : (console.error("Garmin weight fetch failed:", weightResult.reason), []);

  const sleep: GarminSleepEntry[] =
    sleepResult.status === "fulfilled"
      ? sleepResult.value.individualStats
          .filter((day) => day.values.totalSleepTimeInSeconds > 0)
          .map((day) => ({
            date: day.calendarDate,
            score: day.values.sleepScore,
            deepMin: Math.round(day.values.deepTime / 60),
            lightMin: Math.round(day.values.lightTime / 60),
            remMin: Math.round(day.values.remTime / 60),
            awakeMin: Math.round(day.values.awakeTime / 60),
            totalMin: Math.round(day.values.totalSleepTimeInSeconds / 60),
          }))
          .sort(byDateAsc)
      : (console.error("Garmin sleep fetch failed:", sleepResult.reason), []);

  let bodyBattery: GarminBodyBatteryEntry[] = [];
  if (bodyBatteryResult.status === "fulfilled") {
    const raw = Array.isArray(bodyBatteryResult.value) ? bodyBatteryResult.value : [];
    bodyBattery = raw
      .map(parseBodyBatteryDay)
      .filter((d): d is GarminBodyBatteryEntry => d !== null)
      .sort(byDateAsc);
    if (raw.length > 0 && bodyBattery.length === 0) {
      // Parsing assumptions didn't match reality — log the real shape so it
      // can be fixed precisely instead of guessed at again.
      console.error("Garmin body battery: unrecognized response shape:", JSON.stringify(raw[0]));
    }
  } else {
    console.error("Garmin body battery fetch failed:", bodyBatteryResult.reason);
  }

  return { weight, sleep, bodyBattery, tokens: client.exportToken() };
}

export function describeGarminError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("MFA")) {
    return "Garmin is asking for a verification code (MFA) on this login. That flow isn't supported yet.";
  }
  return message;
}
