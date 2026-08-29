// Default-import + destructure (not a named import) — the package is CommonJS
// with obfuscated internals that trip up static named-export analysis (e.g.
// Vite's SSR module runner used by the local dev proxy in vite.config.ts).
import garminConnectPkg from "@gooin/garmin-connect";
import type { IOauth1Token, IOauth2Token, IGarminTokens } from "@gooin/garmin-connect/dist/garmin/types";

const { GarminConnect } = garminConnectPkg;

// Shared Garmin Connect logic used by both the Vercel functions (garmin-login.ts,
// garmin-health.ts) and the local Vite dev-server proxy (vite.config.ts), so the
// two runtimes can't drift out of sync.

// Garmin's daily-stats endpoints page in blocks of up to 28 days and 400 on a
// longer span. Using 21 to stay safely clear of that boundary (28 still
// 400-ed, likely an inclusive/off-by-one edge).
const HISTORY_DAYS = 21;

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

export interface GarminTrainingReadiness {
  score: number;
  level: string;
  feedback: string;
}

export interface GarminHealthData {
  weight: GarminWeightEntry[];
  sleep: GarminSleepEntry[];
  trainingReadiness: GarminTrainingReadiness | null;
  tokens: IGarminTokens;
  // True when a metric failed because Garmin rejected the session itself
  // (401), as opposed to some other per-endpoint hiccup — the client should
  // treat this as "reconnect needed" rather than just "no data this period".
  authExpired: boolean;
}

function isAuthError(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.includes("401") || message.toLowerCase().includes("unauthorized");
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
  // unofficial endpoints doesn't take down the other metrics with it.
  const [weightResult, sleepResult, readinessResult] = await Promise.allSettled([
    client.getWeightRange(startDate, endDate),
    client.getSleepDailySummary(startDate, endDate),
    client.getMorningTrainingReadiness(),
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

  const trainingReadiness: GarminTrainingReadiness | null =
    readinessResult.status === "fulfilled" && readinessResult.value
      ? {
          score: readinessResult.value.score ?? 0,
          level: readinessResult.value.level ?? "",
          feedback: readinessResult.value.feedbackLong ?? readinessResult.value.feedbackShort ?? "",
        }
      : (readinessResult.status === "rejected" &&
          console.error("Garmin training readiness fetch failed:", readinessResult.reason),
        null);

  const authExpired =
    (weightResult.status === "rejected" && isAuthError(weightResult.reason)) ||
    (sleepResult.status === "rejected" && isAuthError(sleepResult.reason)) ||
    (readinessResult.status === "rejected" && isAuthError(readinessResult.reason));

  // A failed refresh attempt (triggered by the 401s above) can leave the
  // client without a usable OAuth2 token, which makes exportToken() throw.
  // Fall back to the tokens we were given rather than losing the weight/sleep
  // data we already gathered over that.
  let tokens: IGarminTokens;
  try {
    tokens = client.exportToken();
  } catch {
    tokens = { oauth1, oauth2 };
  }

  return { weight, sleep, trainingReadiness, tokens, authExpired };
}

export function describeGarminError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("MFA")) {
    return "Garmin is asking for a verification code (MFA) on this login. That flow isn't supported yet.";
  }
  return message;
}
