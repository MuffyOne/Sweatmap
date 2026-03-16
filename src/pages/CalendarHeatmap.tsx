import { useState, useMemo } from "react";
import { format, startOfWeek, addDays, subWeeks } from "date-fns";
import type { Activity } from "../api/strava";

type Metric = "distance" | "time" | "count";

const CELL = 16;
const GAP = 4;
const STEP = CELL + GAP;

const LEVEL_COLORS = [
  "rgba(255,255,255,0.06)",
  "rgba(252,76,2,0.22)",
  "rgba(252,76,2,0.45)",
  "rgba(252,76,2,0.72)",
  "rgba(252,76,2,1)",
];

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

interface Props {
  activities: Activity[];
}

export function CalendarHeatmap({ activities }: Props) {
  const [metric, setMetric] = useState<Metric>("distance");
  const [tooltip, setTooltip] = useState<{
    date: Date;
    acts: Activity[];
    value: number;
    x: number;
    y: number;
  } | null>(null);

  // Map date string → activities
  const dayMap = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities) {
      const key = a.start_date_local.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [activities]);

  // Build 53-week grid starting on Monday
  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    const gridStart = startOfWeek(subWeeks(today, 52), { weekStartsOn: 1 });
    const weeksArr: Date[][] = [];
    let d = gridStart;
    while (d <= today) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(addDays(d, i));
      }
      weeksArr.push(week);
      d = addDays(d, 7);
    }
    // Month labels
    const months: { label: string; col: number }[] = [];
    let lastMonth = -1;
    weeksArr.forEach((week, col) => {
      const m = week[0].getMonth();
      if (m !== lastMonth) {
        months.push({ label: format(week[0], "MMM"), col });
        lastMonth = m;
      }
    });
    return { weeks: weeksArr, monthLabels: months };
  }, []);

  function getValue(acts: Activity[]): number {
    if (metric === "distance") return acts.reduce((s, a) => s + a.distance, 0) / 1000;
    if (metric === "time") return acts.reduce((s, a) => s + a.moving_time, 0) / 3600;
    return acts.length;
  }

  // Compute level thresholds from non-zero days
  const thresholds = useMemo(() => {
    const values: number[] = [];
    weeks.forEach((week) =>
      week.forEach((date) => {
        const acts = dayMap.get(format(date, "yyyy-MM-dd")) ?? [];
        if (acts.length > 0) values.push(getValue(acts));
      })
    );
    values.sort((a, b) => a - b);
    const p = (pct: number) => values[Math.floor(values.length * pct)] ?? 0;
    return [p(0.25), p(0.5), p(0.75), p(0.9)];
  }, [weeks, dayMap, metric]);

  function getLevel(value: number): 0 | 1 | 2 | 3 | 4 {
    if (value === 0) return 0;
    if (value <= thresholds[0]) return 1;
    if (value <= thresholds[1]) return 2;
    if (value <= thresholds[2]) return 3;
    return 4;
  }

  return (
    <div className="heatmap-page">
      <div className="heatmap-controls">
        <div className="period-toggle">
          {(["distance", "time", "count"] as Metric[]).map((m) => (
            <button key={m} className={metric === m ? "active" : ""} onClick={() => setMetric(m)}>
              {m === "distance" ? "Distance" : m === "time" ? "Time" : "Activities"}
            </button>
          ))}
        </div>
      </div>

      <div className="heatmap-scroll">
        <div className="heatmap-inner">
          {/* Day labels */}
          <div className="heatmap-day-labels">
            <div className="heatmap-month-row-spacer" />
            {DAY_LABELS.map((label, i) => (
              <div key={i} className="heatmap-day-label" style={{ height: CELL, lineHeight: `${CELL}px`, marginBottom: GAP }}>
                {label}
              </div>
            ))}
          </div>

          {/* Grid + month labels */}
          <div className="heatmap-grid-wrap">
            {/* Month labels */}
            <div className="heatmap-month-row" style={{ height: 20, position: "relative", marginBottom: 4 }}>
              {monthLabels.map(({ label, col }) => (
                <span
                  key={`${label}-${col}`}
                  className="heatmap-month-label"
                  style={{ left: col * STEP }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Columns */}
            <div className="heatmap-grid">
              {weeks.map((week, colIdx) => (
                <div key={colIdx} className="heatmap-col">
                  {week.map((date, rowIdx) => {
                    const key = format(date, "yyyy-MM-dd");
                    const acts = dayMap.get(key) ?? [];
                    const value = getValue(acts);
                    const level = getLevel(value);
                    const isFuture = date > new Date();
                    return (
                      <div
                        key={rowIdx}
                        className="heatmap-cell"
                        style={{
                          background: isFuture ? "transparent" : LEVEL_COLORS[level],
                          width: CELL,
                          height: CELL,
                          marginBottom: GAP,
                        }}
                        onMouseEnter={(e) => {
                          if (isFuture) return;
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setTooltip({ date, acts, value, x: rect.left + CELL / 2, y: rect.top });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Less</span>
        {LEVEL_COLORS.map((color, i) => (
          <div key={i} className="heatmap-cell" style={{ background: color, width: CELL, height: CELL }} />
        ))}
        <span className="heatmap-legend-label">More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="heatmap-tooltip"
          style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%, -100%)" }}
        >
          <div className="heatmap-tooltip-date">{format(tooltip.date, "EEE, MMM d yyyy")}</div>
          {tooltip.acts.length === 0 ? (
            <div className="heatmap-tooltip-empty">No activity</div>
          ) : (
            <>
              <div className="heatmap-tooltip-stat">
                {metric === "distance" && `${tooltip.value.toFixed(1)} km`}
                {metric === "time" && `${tooltip.value.toFixed(1)} h`}
                {metric === "count" && `${tooltip.acts.length} ${tooltip.acts.length === 1 ? "activity" : "activities"}`}
              </div>
              {tooltip.acts.slice(0, 3).map((a) => (
                <div key={a.id} className="heatmap-tooltip-activity">{a.name}</div>
              ))}
              {tooltip.acts.length > 3 && (
                <div className="heatmap-tooltip-more">+{tooltip.acts.length - 3} more</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
