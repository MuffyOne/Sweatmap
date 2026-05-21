import type { Page } from "../Dashboard";
import styles from "./WhatsNewPage.module.css";

// Bump this string whenever new entries are added — any user who hasn't seen
// the current version will get the highlight dot on the sidebar button.
export const WHATS_NEW_VERSION = "2026-05-21-trend-chart";

interface Entry {
  tag: string;
  title: string;
  body: string;
}

interface DateGroup {
  date: string;
  entries: Entry[];
}

const GROUPS: DateGroup[] = [
  {
    date: "21 May 2026",
    entries: [
      {
        tag: "Home",
        title: "Cumulative distance & elevation chart",
        body: "A new chart in the Stats section shows your running total of distance or elevation over the selected period. Each point on the line is the sum of all activity up to that day, so you can see at a glance how your week, month, or year is building up. Toggle between Distance and Elevation using the selector above the chart.",
      },
    ],
  },
  {
    date: "20 May 2026",
    entries: [
      {
        tag: "Heatmap",
        title: "GPS activity map",
        body: "A new Heatmap page lets you visualise all your rides, runs, and hikes on an interactive map. Filter by time range and sport type, and switch between heatmap mode (overlapping transparent traces showing your most-ridden roads) and routes mode (individual lines at full opacity).",
      },
      {
        tag: "Heatmap",
        title: "All-time history",
        body: "From the Heatmap page you can load your entire Strava history — not just the last year. The first fetch is throttled to stay within Strava's rate limits and the result is cached locally for 30 days, so subsequent loads are instant.",
      },
      {
        tag: "Data",
        title: "Persistent cache",
        body: "Activity data is now stored in IndexedDB instead of localStorage. The new store holds far more data without hitting browser size limits, survives sessions better, and enables the all-time history feature above.",
      },
      {
        tag: "Data",
        title: "Automatic activity sync",
        body: "When deployed to Vercel, the app now receives Strava webhook events for new and updated activities. Any changes made in Strava while the app is closed are applied automatically the next time you open it — no manual sync required.",
      },
    ],
  },
  {
    date: "19 May 2026",
    entries: [
      {
        tag: "Power Curve",
        title: "Adaptive duration",
        body: "The chart now extends to match the duration of your longest activity in the selected period. If you have ridden or run for 3 hours, the curve shows 3 hours of data instead of stopping at 1 hour.",
      },
      {
        tag: "Power Curve",
        title: "All-time best overlay",
        body: "A subtle dashed line now shows your all-time best power at every duration alongside the current period. Switch between 30 and 90 days to see how your current form compares to your historical peak.",
      },
    ],
  },
];

interface Props {
  onNavigate: (page: Page) => void;
}

export function WhatsNewPage({ onNavigate }: Props) {
  return (
    <div className={styles.page}>
      {GROUPS.map((group) => (
        <div key={group.date} className={styles.dateGroup}>
          <div className={styles.dateLabel}>{group.date}</div>
          {group.entries.map((e, i) => (
            <div key={i} className={styles.card}>
              <span className={styles.tag}>{e.tag}</span>
              <div className={styles.title}>{e.title}</div>
              <p className={styles.body}>{e.body}</p>
            </div>
          ))}
        </div>
      ))}

      <div className={styles.cta}>
        <p className={styles.ctaText}>
          To explore the new map, head to the{" "}
          <button className="link-btn" onClick={() => onNavigate("map")}>Heatmap</button>
          {" "}page. To refresh your activity data, go to{" "}
          <button className="link-btn" onClick={() => onNavigate("settings")}>Settings</button>
          {" "}and press <strong>Force Sync</strong>.
        </p>
      </div>
    </div>
  );
}
