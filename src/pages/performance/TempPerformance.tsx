import { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { clsx } from "clsx";
import type { Activity } from "../../api/strava";
import { TOOLTIP_STYLE, RUN_TYPES, RIDE_TYPES } from "../../lib/utils";
import { CollapsibleSection } from "../../lib/CollapsibleSection";
import { PeriodToggle } from "../../components/PeriodToggle";
import styles from "./TempPerformance.module.css";

type Metric = "efficiency" | "watts" | "speed";
type SportFilter = "all" | "run" | "ride";
type Length = "any" | "long";

const BIN_SIZE = 5; // °C
const MIN_BIN_COUNT = 4; // bins with fewer rides are not summarised, their dots still show
const LONG_RIDE_SECONDS = 45 * 60;

const METRIC_LABELS: Record<Metric, string> = { efficiency: "Efficiency", watts: "Power", speed: "Speed" };
const METRIC_UNITS: Record<Metric, string> = { efficiency: "W/bpm", watts: "W", speed: "km/h" };
const METRIC_NAMES: Record<Metric, string> = { efficiency: "Efficiency", watts: "Avg power", speed: "Avg speed" };

interface Props {
  activities: Activity[];
}

interface Dot {
  x: number;
  value: number;
  temp: number;
  name: string;
}

interface Bin {
  x: number;
  lo: number;
  hi: number;
  n: number;
  median: number;
  q1: number;
  q3: number;
  band: [number, number];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function formatValue(v: number, metric: Metric): string {
  if (metric === "efficiency") return v.toFixed(2);
  if (metric === "speed") return v.toFixed(1);
  return String(Math.round(v));
}

function binLabel(b: { lo: number; hi: number }): string {
  return `${b.lo}–${b.hi} °C`;
}

export function TempPerformance({ activities }: Props) {
  const [sport, setSport] = useState<SportFilter>("ride");
  const [metric, setMetric] = useState<Metric>("efficiency");
  const [length, setLength] = useState<Length>("long");

  const speedNeedsSport = metric === "speed" && sport === "all";

  const dots = useMemo<Dot[]>(() => {
    if (speedNeedsSport) return [];
    return activities
      .filter((a) => {
        if (a.average_temp === undefined || a.average_temp === null) return false;
        if (length === "long" && a.moving_time < LONG_RIDE_SECONDS) return false;
        if (sport === "run") return RUN_TYPES.has(a.sport_type) || RUN_TYPES.has(a.type);
        if (sport === "ride") return RIDE_TYPES.has(a.sport_type) || RIDE_TYPES.has(a.type);
        return true;
      })
      .flatMap((a, i): Dot[] => {
        let value: number | null = null;
        if (metric === "efficiency") {
          if (a.average_watts && a.average_heartrate) value = a.average_watts / a.average_heartrate;
        } else if (metric === "watts") {
          if (a.average_watts) value = a.average_watts;
        } else if (a.average_speed > 0) {
          value = a.average_speed * 3.6;
        }
        if (value === null) return [];
        // Temperatures are whole degrees, so dots stack in columns. A small deterministic offset spreads them.
        const jitter = (((i * 37) % 100) / 100 - 0.5) * 0.8;
        return [{ x: a.average_temp! + jitter, value, temp: a.average_temp!, name: a.name }];
      });
  }, [activities, sport, metric, length, speedNeedsSport]);

  const bins = useMemo<Bin[]>(() => {
    const groups = new Map<number, number[]>();
    for (const d of dots) {
      const lo = Math.floor(d.temp / BIN_SIZE) * BIN_SIZE;
      groups.set(lo, [...(groups.get(lo) ?? []), d.value]);
    }
    return [...groups.entries()]
      .filter(([, vals]) => vals.length >= MIN_BIN_COUNT)
      .sort(([a], [b]) => a - b)
      .map(([lo, vals]) => {
        const sorted = [...vals].sort((a, b) => a - b);
        const q1 = percentile(sorted, 0.25);
        const q3 = percentile(sorted, 0.75);
        return { x: lo + BIN_SIZE / 2, lo, hi: lo + BIN_SIZE, n: vals.length, median: percentile(sorted, 0.5), q1, q3, band: [q1, q3] as [number, number] };
      });
  }, [dots]);

  // Axis limits come from the middle 96% of values so a few outliers (very short or easy rides) don't flatten the chart.
  const { xDomain, yDomain, xTicks } = useMemo(() => {
    const temps = dots.map((d) => d.temp);
    const loX = Math.floor(Math.min(...temps, 0) / BIN_SIZE) * BIN_SIZE;
    const hiX = Math.ceil(Math.max(...temps, 5) / BIN_SIZE) * BIN_SIZE;
    const sorted = dots.map((d) => d.value).sort((a, b) => a - b);
    const lo = percentile(sorted, 0.02);
    const hi = percentile(sorted, 0.98);
    const pad = (hi - lo) * 0.08 || 1;
    return {
      xDomain: [loX, hiX] as [number, number],
      yDomain: [lo - pad, hi + pad] as [number, number],
      xTicks: Array.from({ length: (hiX - loX) / BIN_SIZE + 1 }, (_, i) => loX + i * BIN_SIZE),
    };
  }, [dots]);

  const summary = useMemo(() => {
    if (bins.length < 2) return null;
    const best = bins.reduce((a, b) => (b.median > a.median ? b : a));
    const vs = (b: Bin) => {
      const pct = ((b.median - best.median) / best.median) * 100;
      return `${binLabel(b)}: ${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(0)}%`;
    };
    const cold = bins[0];
    const warm = bins[bins.length - 1];
    const parts = [`Best at ${binLabel(best)} (median ${formatValue(best.median, metric)} ${METRIC_UNITS[metric]})`];
    if (cold !== best) parts.push(vs(cold));
    if (warm !== best) parts.push(vs(warm));
    return parts.join(" · ");
  }, [bins, metric]);

  const unit = METRIC_UNITS[metric];
  const name = METRIC_NAMES[metric];

  return (
    <CollapsibleSection title="Temperature vs Performance">
      <div className={clsx("power-curve-controls", styles.controls)}>
        <PeriodToggle
          options={["all", "run", "ride"] as const}
          selected={sport}
          onSelect={setSport}
          renderLabel={(s) => (s === "all" ? "All" : s === "run" ? "Runs" : "Rides")}
          inline
        />
        <PeriodToggle
          options={["efficiency", "watts", "speed"] as const}
          selected={metric}
          onSelect={setMetric}
          renderLabel={(m) => METRIC_LABELS[m]}
          inline
        />
        <PeriodToggle
          options={["long", "any"] as const}
          selected={length}
          onSelect={setLength}
          renderLabel={(l) => (l === "long" ? "45 min+" : "Any length")}
          inline
        />
      </div>

      {speedNeedsSport ? (
        <div className="power-curve-empty">Speed mixes runs and rides. Pick Runs or Rides to compare like with like.</div>
      ) : dots.length === 0 ? (
        <div className="power-curve-empty">
          No activities with temperature data found for this filter. Temperature is recorded by GPS watches and bike computers
          {metric === "efficiency" && ", and efficiency also needs power and heart rate"}.
        </div>
      ) : (
        <>
          {summary && <div className={styles.summary}>{summary}</div>}
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart margin={{ top: 8, right: 24, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" />
              <XAxis
                dataKey="x"
                type="number"
                domain={xDomain}
                ticks={xTicks}
                allowDataOverflow
                tickFormatter={(v: number) => `${v}°`}
                tick={{ fill: "var(--tick-color)", fontSize: 12 }}
                label={{ value: "Temperature (°C)", position: "insideBottom", offset: -14, fill: "var(--tick-color)", fontSize: 11 }}
              />
              <YAxis
                type="number"
                domain={yDomain}
                allowDataOverflow
                tickFormatter={(v: number) => formatValue(v, metric)}
                unit={metric === "efficiency" ? "" : unit}
                tick={{ fill: "var(--tick-color)", fontSize: 12 }}
                width={metric === "speed" ? 56 : 48}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const item = active ? (payload?.[0]?.payload as (Dot & Partial<Bin>) | undefined) : undefined;
                  if (!item) return null;
                  const isBin = item.n !== undefined;
                  return (
                    <div style={{ ...TOOLTIP_STYLE, padding: "0.5rem 0.7rem", fontSize: "0.8rem" }}>
                      {isBin ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{binLabel(item as Bin)} · {item.n} rides</div>
                          <div>Median {formatValue(item.median!, metric)} {unit}</div>
                          <div style={{ opacity: 0.7 }}>
                            Middle half {formatValue(item.q1!, metric)}–{formatValue(item.q3!, metric)} {unit}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div>{formatValue(item.value, metric)} {unit} at {item.temp}°C</div>
                        </>
                      )}
                    </div>
                  );
                }}
              />
              <Scatter data={dots} dataKey="value" name={name} fill="#fc4c02" fillOpacity={0.18} isAnimationActive={false} />
              <Area data={bins} dataKey="band" name="Middle half" type="monotone" stroke="none" fill="#fc4c02" fillOpacity={0.16} isAnimationActive={false} />
              <Line
                data={bins}
                dataKey="median"
                name="Median"
                type="monotone"
                stroke="#fc4c02"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#fc4c02", stroke: "var(--bg-base)", strokeWidth: 2 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className={styles.dataCount}>
            {dots.length} {dots.length === 1 ? "activity" : "activities"} · line is the median per {BIN_SIZE}°C band, shaded area is the middle half
            {bins.length === 0 && ` · not enough rides per band (${MIN_BIN_COUNT}+) to draw a trend yet`}
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}
