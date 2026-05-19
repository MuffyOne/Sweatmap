import type { Page } from "../Dashboard";
import styles from "./WhatsNewPage.module.css";

interface Entry {
  tag: string;
  title: string;
  body: string;
}

const ENTRIES: Entry[] = [
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
];

interface Props {
  onNavigate: (page: Page) => void;
}

export function WhatsNewPage({ onNavigate }: Props) {
  return (
    <div className={styles.page}>
      {ENTRIES.map((e, i) => (
        <div key={i} className={styles.card}>
          <span className={styles.tag}>{e.tag}</span>
          <div className={styles.title}>{e.title}</div>
          <p className={styles.body}>{e.body}</p>
        </div>
      ))}

      <div className={styles.cta}>
        <p className={styles.ctaText}>
          To see these changes, go to{" "}
          <button className="link-btn" onClick={() => onNavigate("settings")}>Settings</button>
          {" "}and press <strong>Force Sync</strong> to clear cached data and recompute your curves.
          Then head to the{" "}
          <button className="link-btn" onClick={() => onNavigate("performance")}>
            Performance
          </button>{" "}
          tab.
        </p>
      </div>
    </div>
  );
}
