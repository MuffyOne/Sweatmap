import { useState } from "react";
import { format } from "date-fns";
import styles from "./HistoryImport.module.css";

export interface HistoryState {
  /** Start of the oldest loaded activity (ms), or null when nothing is loaded. */
  oldest: number | null;
  total: number;
  importing: boolean;
  /** Older activities found so far in the current import. */
  count: number;
  error: string | null;
  onImport: () => void;
}

const DISMISS_KEY = "history_banner_dismissed";
/** Within this age of the oldest activity we assume only the default one-year window is loaded. */
const ONE_YEAR_MS = 400 * 24 * 60 * 60 * 1000;

function needsHistoryImport(oldest: number | null): boolean {
  return oldest !== null && Date.now() - oldest < ONE_YEAR_MS;
}

interface Props extends HistoryState {
  /** "banner" shows only while older history is missing and can be dismissed; "card" is always shown (Settings). */
  variant: "banner" | "card";
}

export function HistoryImport({ variant, oldest, total, importing, count, error, onImport }: Props) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  if (oldest === null) return null;
  const missing = needsHistoryImport(oldest);
  if (variant === "banner" && ((!missing && !importing) || dismissed)) return null;

  const since = format(new Date(oldest), "d MMM yyyy");
  const title = importing
    ? `Importing older rides… ${count} found`
    : missing
      ? "Only your last year is loaded"
      : "Full history loaded";
  const body = importing
    ? "Keep this tab open. Requests are throttled to stay within Strava's rate limits, so this can take a while. Progress is saved as it goes."
    : missing
      ? `Showing ${total.toLocaleString()} activities since ${since}. Import your full Strava history for all-time records, a longer fitness trend and a better peak signature. Strava limits how fast we can fetch, so a long history can be slow, and power-based stats fill in gradually over the following sessions.`
      : `${total.toLocaleString()} activities since ${since}. Import again to pick up anything older that's still missing.`;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  }

  return (
    <div className={styles.card}>
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        <div className={styles.body}>{body}</div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
      <div className={styles.actions}>
        {variant === "banner" && !importing && (
          <button className={styles.dismiss} onClick={dismiss}>Not now</button>
        )}
        <button className="btn-compute" onClick={onImport} disabled={importing}>
          {importing ? "Importing…" : missing ? "Import full history" : "Check for older rides"}
        </button>
      </div>
    </div>
  );
}
