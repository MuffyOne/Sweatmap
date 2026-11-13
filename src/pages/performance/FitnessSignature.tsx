import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, subDays } from "date-fns";
import { CollapsibleSection } from "../../lib/CollapsibleSection";
import { SegmentedControl } from "../../components/SegmentedControl";
import { POWER_CURVE_UPDATED, computeSignature, modelPower } from "../../lib/powerModel";
import { WINDOW_DAYS, curveAsOf, loadRideCurves, type RideCurve } from "../../lib/rideCurves";
import { getCachedTrainingInfo } from "../../api/xert";
import type { Activity } from "../../api/strava";
import { TOOLTIP_STYLE } from "../../lib/utils";
import styles from "./FitnessSignature.module.css";

const CHART_DURATIONS = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const HISTORY_WEEKS = 26;

function durationLabel(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${s / 60}min`;
  return `${s / 3600}h`;
}

type Metric = "ftp" | "hie" | "pp";
const METRICS: readonly Metric[] = ["ftp", "hie", "pp"];
const METRIC_LABELS: Record<Metric, string> = { ftp: "FTP", hie: "HIE", pp: "Peak Power" };
const METRIC_UNITS: Record<Metric, string> = { ftp: "W", hie: "kJ", pp: "W" };

interface HistoryPoint {
  label: string;
  ftp?: number;
  hie?: number;
  pp?: number;
  /** Metric value, only on weeks where it rose noticeably: drawn as a "new best" marker. */
  rise?: Partial<Record<Metric, number>>;
}

/** Rides that belong to the current activity list (so the sport filter applies) and have a cached curve. */
function loadRides(activities: Activity[]): RideCurve[] {
  const cache = loadRideCurves();
  return activities.flatMap((a) => (a.average_watts && cache[a.id] ? [cache[a.id]] : []));
}

function buildHistory(rides: RideCurve[]): HistoryPoint[] {
  const now = new Date();
  const points: HistoryPoint[] = [];
  const prev: Partial<Record<Metric, number>> = {};
  for (let i = HISTORY_WEEKS - 1; i >= 0; i--) {
    const asOf = subDays(now, i * 7);
    const sig = computeSignature(curveAsOf(rides, asOf, { decay: true, windowDays: WINDOW_DAYS }));
    const point: HistoryPoint = { label: format(asOf, "d MMM") };
    if (sig) {
      const values: Record<Metric, number> = { ftp: sig.ftp, hie: sig.hie, pp: sig.pp };
      point.rise = {};
      for (const m of METRICS) {
        point[m] = values[m];
        const before = prev[m];
        if (before != null && values[m] >= before * 1.02) point.rise[m] = values[m];
        prev[m] = values[m];
      }
    }
    points.push(point);
  }
  return points;
}

interface Props {
  activities: Activity[];
}

export function FitnessSignature({ activities }: Props) {
  const [rides, setRides] = useState(() => loadRides(activities));
  const [metric, setMetric] = useState<Metric>("ftp");

  useEffect(() => {
    const refresh = () => setRides(loadRides(activities));
    refresh();
    window.addEventListener(POWER_CURVE_UPDATED, refresh);
    return () => window.removeEventListener(POWER_CURVE_UPDATED, refresh);
  }, [activities]);

  const xert = useMemo(() => getCachedTrainingInfo()?.signature ?? null, []);

  const { recent, allTime, measured } = useMemo(() => {
    const now = new Date();
    const decayed = curveAsOf(rides, now, { decay: true, windowDays: WINDOW_DAYS });
    const raw = curveAsOf(rides, now, { decay: false, windowDays: WINDOW_DAYS });
    return {
      recent: computeSignature(decayed),
      // Peak: best across all synced history, no decay and no window.
      allTime: computeSignature(curveAsOf(rides, now, { decay: false, windowDays: Infinity })),
      measured: new Map(raw.map((p) => [p.seconds, p.watts])),
    };
  }, [rides]);

  const history = useMemo(() => buildHistory(rides), [rides]);

  const chartData = useMemo(
    () =>
      CHART_DURATIONS.map((t) => ({
        label: durationLabel(t),
        recentModel: recent ? Math.round(modelPower(recent.model, t)) : undefined,
        peakModel: allTime ? Math.round(modelPower(allTime.model, t)) : undefined,
        measured: measured.get(t),
      })),
    [recent, allTime, measured],
  );

  const historyData = useMemo(
    () => history.map((p) => ({ label: p.label, value: p[metric], rise: p.rise?.[metric] })),
    [history, metric],
  );
  const hasHistory = historyData.some((p) => p.value != null);

  if (!recent && !allTime) {
    return (
      <CollapsibleSection title="Fitness Signature">
        <p className={styles.note}>
          Needs power data. Open the Power Curve above and let it finish loading, then this will fill in.
        </p>
      </CollapsibleSection>
    );
  }

  const cards: { label: string; unit: string; recent?: number; peak?: number; xert?: number }[] = [
    { label: "FTP", unit: "W", recent: recent?.ftp, peak: allTime?.ftp, xert: xert?.ftp },
    { label: "LTP", unit: "W", recent: recent?.ltp, peak: allTime?.ltp, xert: xert?.ltp },
    { label: "HIE", unit: "kJ", recent: recent?.hie, peak: allTime?.hie, xert: xert?.hie },
    { label: "Peak Power", unit: "W", recent: recent?.pp, peak: allTime?.pp, xert: xert?.pp },
  ];

  const err = recent?.fitError ?? allTime?.fitError;
  const unit = METRIC_UNITS[metric];

  return (
    <CollapsibleSection title="Fitness Signature">
      <div className={`stats-grid ${styles.cards}`}>
        {cards.map((c) => {
          const pct = c.recent != null && c.peak ? ((c.recent - c.peak) / c.peak) * 100 : null;
          return (
            <div className="stat-card" key={c.label}>
              <div className="stat-card-header">
                <span className="label">{c.label}</span>
                {pct !== null && Math.abs(pct) >= 0.5 && (
                  <span className={`stat-delta ${pct >= 0 ? "stat-delta--up" : "stat-delta--down"}`}>
                    {pct >= 0 ? "▲" : "▼"} {Math.abs(Math.round(pct))}%
                  </span>
                )}
              </div>
              <div className="value">
                {c.recent ?? "–"}
                <span className="unit">{c.unit}</span>
              </div>
              <div className="goal-meta">
                {c.peak != null && `Peak ${c.peak} ${c.unit}`}
                {c.peak != null && c.xert != null && " · "}
                {c.xert != null && `XERT ${c.xert} ${c.unit}`}
              </div>
            </div>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" />
          <XAxis dataKey="label" tick={{ fill: "var(--tick-color)", fontSize: 12 }} />
          <YAxis tick={{ fill: "var(--tick-color)", fontSize: 12 }} unit="W" domain={["auto", "auto"]} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [`${value} W`, name]} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--tick-color)" }} />
          <Line
            type="monotone"
            dataKey="peakModel"
            name="Peak model"
            stroke="#7a8fa6"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 4, fill: "#7a8fa6" }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="recentModel"
            name="Current model"
            stroke="#fc4c02"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls
          />
          <Line
            dataKey="measured"
            name="Measured (90 days)"
            stroke="none"
            dot={{ fill: "#fc4c02", r: 4 }}
            activeDot={{ r: 6 }}
            legendType="circle"
          />
        </LineChart>
      </ResponsiveContainer>

      {hasHistory && (
        <>
          <div className={styles.historyHeader}>
            <span className={styles.historyTitle}>History, last {HISTORY_WEEKS} weeks</span>
            <SegmentedControl
              options={METRICS}
              selected={metric}
              onSelect={setMetric}
              renderLabel={(m) => METRIC_LABELS[m]}
              ariaLabel="Metric"
            />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={historyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" />
              <XAxis dataKey="label" tick={{ fill: "var(--tick-color)", fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fill: "var(--tick-color)", fontSize: 12 }} unit={unit} domain={["auto", "auto"]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [`${value} ${unit}`, name]} />
              <Line
                type="monotone"
                dataKey="value"
                name={METRIC_LABELS[metric]}
                stroke="#fc4c02"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
                connectNulls
              />
              <Line
                dataKey="rise"
                name="New best"
                stroke="none"
                dot={{ fill: "#fc4c02", stroke: "var(--bg-base)", strokeWidth: 2, r: 5 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      <p className={styles.note}>
        Current = last {WINDOW_DAYS} days with recent efforts weighted more heavily, so the signature falls when you stop training. Peak = best across synced
        history. FTP is the modelled 60-minute power
        {recent && ` (CP ${recent.cp} W`}{recent?.ftp20 != null && `, 95% of best 20 min ${recent.ftp20} W`}{recent && ")"}.
        LTP is estimated as 78% of CP. Morton 3-parameter model fitted to efforts from 2 min to 1 h
        {err != null && ` (fit error ${(err * 100).toFixed(1)}%)`}. Experimental: compare against XERT before trusting it. Dots on the history mark weeks
        where the value rose 2% or more.
      </p>
    </CollapsibleSection>
  );
}
