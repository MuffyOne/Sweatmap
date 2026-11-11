import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { CollapsibleSection } from "../../lib/CollapsibleSection";
import { POWER_CURVE_UPDATED, computeSignature, labelToSeconds, modelPower, type FitnessSignature as Signature, type MmpPoint } from "../../lib/powerModel";
import { getCachedTrainingInfo } from "../../api/xert";
import { TOOLTIP_STYLE, type SportFilter } from "../../lib/utils";
import styles from "./FitnessSignature.module.css";

interface CachedCurve {
  data: { label: string; watts: number }[];
}

function loadCurve(key: string): MmpPoint[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCurve | { label: string; watts: number }[];
    const data = Array.isArray(parsed) ? parsed : parsed.data;
    return data.map((p) => ({ seconds: labelToSeconds(p.label), watts: p.watts }));
  } catch {
    return null;
  }
}

interface Loaded {
  recent: Signature | null;
  allTime: Signature | null;
  recentCurve: MmpPoint[];
}

function loadSignatures(sportFilter: SportFilter): Loaded {
  const recent = loadCurve(`power_curve_${sportFilter}_90d`);
  const allTime = loadCurve(`power_curve_alltime_${sportFilter}`);
  return {
    recent: recent ? computeSignature(recent) : null,
    allTime: allTime ? computeSignature(allTime) : null,
    recentCurve: recent ?? [],
  };
}

const CHART_DURATIONS = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];

function durationLabel(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${s / 60}min`;
  return `${s / 3600}h`;
}

interface ChartPoint {
  label: string;
  recentModel?: number;
  peakModel?: number;
  measured?: number;
}

interface Props {
  sportFilter: SportFilter;
}

export function FitnessSignature({ sportFilter }: Props) {
  const [sigs, setSigs] = useState(() => loadSignatures(sportFilter));

  useEffect(() => {
    const refresh = () => setSigs(loadSignatures(sportFilter));
    refresh();
    window.addEventListener(POWER_CURVE_UPDATED, refresh);
    return () => window.removeEventListener(POWER_CURVE_UPDATED, refresh);
  }, [sportFilter]);

  const xert = useMemo(() => getCachedTrainingInfo()?.signature ?? null, []);
  const { recent, allTime, recentCurve } = sigs;

  const chartData = useMemo((): ChartPoint[] => {
    const measured = new Map(recentCurve.map((p) => [p.seconds, p.watts]));
    return CHART_DURATIONS.map((t) => ({
      label: durationLabel(t),
      recentModel: recent ? Math.round(modelPower(recent.model, t)) : undefined,
      peakModel: allTime ? Math.round(modelPower(allTime.model, t)) : undefined,
      measured: measured.get(t),
    }));
  }, [recent, allTime, recentCurve]);

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

  return (
    <CollapsibleSection title="Fitness Signature">
      <div className={`stats-grid ${styles.cards}`}>
        {cards.map((c) => {
          const value = c.recent ?? c.peak;
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
                {value ?? "–"}
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
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => [`${value} W`, name]}
          />
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

      <p className={styles.note}>
        Current = last 90 days, Peak = best across synced history. FTP is the modelled 60-minute power
        {recent && ` (CP ${recent.cp} W`}{recent?.ftp20 != null && `, 95% of best 20 min ${recent.ftp20} W`}{recent && ")"}.
        LTP is estimated as 75% of CP. Morton 3-parameter model fitted to efforts from 5 s to 30 min
        {err != null && ` (fit error ${(err * 100).toFixed(1)}%)`}. Experimental: compare against XERT before trusting it.
      </p>
    </CollapsibleSection>
  );
}
