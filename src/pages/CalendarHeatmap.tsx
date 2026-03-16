import { useState, useMemo, useRef, useEffect } from "react";
import { format } from "date-fns";
import type { Activity } from "../api/strava";

type Metric = "distance" | "time";

const CELL_GAP = 3;   // gap between cells within a month
const MONTH_GAP = 14; // gap between month blocks
const DAY_LABEL_W = 34;
const INNER_GAP = 6;

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

// Returns columns for a calendar month.
// Each column = 1 week (Mon–Sun). Cells outside the month are null.
function getMonthCols(year: number, month: number): (Date | null)[][] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0 … Sun=6
  const numCols = Math.ceil((firstDow + daysInMonth) / 7);
  return Array.from({ length: numCols }, (_, col) =>
    Array.from({ length: 7 }, (_, row) => {
      const dayNum = col * 7 + row - firstDow + 1;
      return dayNum >= 1 && dayNum <= daysInMonth ? new Date(year, month, dayNum) : null;
    })
  );
}

export function CalendarHeatmap({ activities }: Props) {
  const [metric, setMetric] = useState<Metric>("distance");
  const [tooltip, setTooltip] = useState<{
    date: Date; acts: Activity[]; value: number; x: number; y: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((e) => setContainerWidth(e[0].contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const dayMap = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities) {
      const key = a.start_date_local.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [activities]);

  // Last 12 months ending with the current month
  const months = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const topMonths = months.slice(0, 6);
  const bottomMonths = months.slice(6);

  function getValue(acts: Activity[]): number {
    if (metric === "distance") return acts.reduce((s, a) => s + a.distance, 0) / 1000;
    if (metric === "time") return acts.reduce((s, a) => s + a.moving_time, 0) / 3600;
    return acts.length;
  }

  const thresholds = useMemo(() => {
    const values: number[] = [];
    months.forEach(({ year, month }) =>
      getMonthCols(year, month).forEach(col =>
        col.forEach(date => {
          if (!date) return;
          const acts = dayMap.get(format(date, "yyyy-MM-dd")) ?? [];
          if (acts.length > 0) values.push(getValue(acts));
        })
      )
    );
    values.sort((a, b) => a - b);
    const p = (pct: number) => values[Math.floor(values.length * pct)] ?? 0;
    return [p(0.25), p(0.5), p(0.75), p(0.9)];
  }, [months, dayMap, metric]);

  function getLevel(value: number): 0 | 1 | 2 | 3 | 4 {
    if (value === 0) return 0;
    if (value <= thresholds[0]) return 1;
    if (value <= thresholds[1]) return 2;
    if (value <= thresholds[2]) return 3;
    return 4;
  }

  // Compute cell size from the widest row's total column count
  const cellSize = useMemo(() => {
    if (containerWidth === 0) return 14;
    const rowCols = (list: typeof months) =>
      list.reduce((s, { year, month }) => s + getMonthCols(year, month).length, 0);
    const numCols = Math.max(rowCols(topMonths), rowCols(bottomMonths));
    const numMonths = 6;
    const available = containerWidth - DAY_LABEL_W - INNER_GAP;
    // With flex-grow:numCols on month blocks + flex:1 on columns, the cell width is:
    // (available - (numMonths-1)*MONTH_GAP) / totalCols - CELL_GAP
    const cell = (available - (numMonths - 1) * MONTH_GAP) / numCols - CELL_GAP;
    return Math.max(10, Math.min(22, cell));
  }, [containerWidth, topMonths, bottomMonths]);

  const today = new Date();

  function renderRow(monthList: typeof months) {
    return (
      <div style={{ display: "flex", gap: INNER_GAP }}>
        {/* Day-of-week labels */}
        <div style={{ width: DAY_LABEL_W, display: "flex", flexDirection: "column", gap: CELL_GAP, paddingTop: 20 + 4 }}>
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              style={{
                height: cellSize,
                lineHeight: `${cellSize}px`,
                fontSize: 10,
                color: "rgba(255,255,255,0.3)",
                textAlign: "right",
                userSelect: "none",
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Month blocks */}
        <div style={{ display: "flex", gap: MONTH_GAP, flex: 1 }}>
          {monthList.map(({ year, month }) => {
            const cols = getMonthCols(year, month);
            return (
              <div key={`${year}-${month}`} style={{ display: "flex", flexDirection: "column", flex: cols.length, minWidth: 0 }}>
                {/* Month + year label */}
                <div style={{
                  height: 20,
                  marginBottom: 4,
                  fontSize: 11,
                  color: "rgba(255,255,255,0.4)",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                }}>
                  {format(new Date(year, month, 1), "MMM ''yy")}
                </div>

                {/* Week columns */}
                <div style={{ display: "flex", gap: CELL_GAP }}>
                  {cols.map((col, colIdx) => (
                    <div key={colIdx} style={{ display: "flex", flexDirection: "column", gap: CELL_GAP, flex: 1, minWidth: 0 }}>
                      {col.map((date, rowIdx) => {
                        const isFuture = date ? date > today : false;
                        const acts = date ? (dayMap.get(format(date, "yyyy-MM-dd")) ?? []) : [];
                        const value = acts.length > 0 ? getValue(acts) : 0;
                        const level = getLevel(value);
                        return (
                          <div
                            key={rowIdx}
                            className="heatmap-cell"
                            style={{
                              height: cellSize,
                              borderRadius: Math.max(2, Math.floor(cellSize / 6)),
                              background: !date || isFuture ? "transparent" : LEVEL_COLORS[level],
                            }}
                            onMouseEnter={date && !isFuture ? (e) => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const cRect = containerRef.current!.getBoundingClientRect();
                              const rawX = rect.left + rect.width / 2 - cRect.left;
                              const x = Math.max(80, Math.min(rawX, cRect.width - 80));
                              setTooltip({ date: date!, acts, value, x, y: rect.top - cRect.top });
                            } : undefined}
                            onMouseLeave={() => setTooltip(null)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="heatmap-page" ref={containerRef}>
      <div className="heatmap-controls">
        <div className="period-toggle">
          {(["distance", "time"] as Metric[]).map((m) => (
            <button key={m} className={metric === m ? "active" : ""} onClick={() => setMetric(m)}>
              {m === "distance" ? "Distance" : "Time"}
            </button>
          ))}
        </div>
      </div>

      <div className="heatmap-rows">
        {renderRow(topMonths)}
        {renderRow(bottomMonths)}
      </div>

      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Less</span>
        {LEVEL_COLORS.map((color, i) => (
          <div key={i} className="heatmap-cell" style={{ background: color, width: cellSize, height: cellSize, borderRadius: 2 }} />
        ))}
        <span className="heatmap-legend-label">More</span>
      </div>

      {tooltip && (
        <div
          className="heatmap-tooltip"
          style={{ left: tooltip.x, top: tooltip.y - 6, transform: "translate(-50%, -100%)" }}
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
