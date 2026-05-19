import styles from "./StreamProgress.module.css";

interface Props {
  done: number;
  total: number;
  label?: string;
}

export function StreamProgress({ done, total, label = "Fetching streams…" }: Props) {
  return (
    <div className="power-curve-empty">
      {label} {done} / {total}
      <div className={`loading-bar-track ${styles.track}`}>
        <div
          className="loading-bar-fill"
          style={{
            width: total > 0 ? `${Math.round((done / total) * 100)}%` : "5%",
            animation: "none",
            opacity: 1,
          }}
        />
      </div>
    </div>
  );
}
