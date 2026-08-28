// Default-import + destructure (not a named import) — the package is CommonJS
// with obfuscated internals that trip up static named-export analysis (e.g.
// Vite's SSR module runner used by the local dev proxy in vite.config.ts).
import garminConnectPkg from "@gooin/garmin-connect";
import type { IOauth1Token, IOauth2Token, IGarminTokens } from "@gooin/garmin-connect/dist/garmin/types";

const { GarminConnect } = garminConnectPkg;

// Shared Garmin Connect logic used by both the Vercel functions (garmin-login.ts,
// garmin-health.ts) and the local Vite dev-server proxy (vite.config.ts), so the
// two runtimes can't drift out of sync.

const HISTORY_DAYS = 30;

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

  const [weightRange, sleepSummary, bodyBattery] = await Promise.all([
    client.getWeightRange(startDate, endDate),
    client.getSleepDailySummary(startDate, endDate),
    client.getBodyBattery(startDate, endDate),
  ]);

  const weight: GarminWeightEntry[] = weightRange.dailyWeightSummaries
    .filter((day) => day.numOfWeightEntries > 0)
    .map((day) => ({
      date: day.summaryDate,
      weightKg: Math.round((day.latestWeight.weight / 1000) * 10) / 10,
    }));

  const sleep: GarminSleepEntry[] = sleepSummary.individualStats
    .filter((day) => day.values.totalSleepTimeInSeconds > 0)
    .map((day) => ({
      date: day.calendarDate,
      score: day.values.sleepScore,
      deepMin: Math.round(day.values.deepTime / 60),
      lightMin: Math.round(day.values.lightTime / 60),
      remMin: Math.round(day.values.remTime / 60),
      awakeMin: Math.round(day.values.awakeTime / 60),
      totalMin: Math.round(day.values.totalSleepTimeInSeconds / 60),
    }));

  const bodyBatteryEntries: GarminBodyBatteryEntry[] = bodyBattery.map((day) => ({
    date: day.calendarDate,
    low: day.values.lowBodyBattery,
    high: day.values.highBodyBattery,
  }));

  return { weight, sleep, bodyBattery: bodyBatteryEntries, tokens: client.exportToken() };
}

export function describeGarminError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("MFA")) {
    return "Garmin is asking for a verification code (MFA) on this login. That flow isn't supported yet.";
  }
  return message;
}
