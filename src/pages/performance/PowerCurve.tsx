import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { subDays, parseISO, isAfter } from "date-fns";
import { clsx } from "clsx";
import { fetchActivityWatts, type Activity } from "../../api/strava";
import { TOOLTIP_STYLE } from "../../lib/utils";
import { CollapsibleSection } from "../../lib/CollapsibleSection";
import { PeriodToggle } from "../../components/PeriodToggle";
import { StreamProgress } from "../../components/StreamProgress";
import styles from "./PowerCurve.module.css";

const ALL_DURATIONS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 5400, 7200, 10800, 14400, 18000, 21600];

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${secs / 60}min`;
  return `${secs / 3600}h`;
}

function computeMMP(watts: number[], secs: number): number {
  if (watts.length < secs) return 0;
  let sum = 0;
  for (let i = 0; i < secs; i++) sum += watts[i];
  let max = sum;
  for (let i = secs; i < watts.length; i++) {
    sum += watts[i] - watts[i - secs];
    if (sum > max) max = sum;
  }
  return Math.round(max / secs);
}

function buildCurve(streams: number[][]): CurvePoint[] {
  if (streams.length === 0) return [];
  const maxLen = Math.max(...streams.map((s) => s.length));
  return ALL_DURATIONS
    .filter((d) => d <= maxLen)
    .map((d) => ({
      label: formatDuration(d),
      watts: Math.max(...streams.map((w) => computeMMP(w, d)).filter((v) => v > 0), 0),
    }))
    .filter((p) => p.watts > 0);
}

type CurveRange = "30d" | "90d";

interface CurvePoint {
  label: string;
  watts: number;
}

interface ChartPoint {
  label: string;
  current?: number;
  best?: number;
}

const CACHE_KEY_PREFIX = "power_curve_";
const BEST_CACHE_KEY = "power_curve_alltime";

interface CachedCurve {
  data: CurvePoint[];
  activityCount: number;
}

function loadCachedCurve(range: CurveRange): CachedCurve | null {
  const raw = localStorage.getItem(CACHE_KEY_PREFIX + range);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { data: parsed, activityCount: -1 };
    return parsed as CachedCurve;
  } catch {
    return null;
  }
}

function loadBestCurve(): CachedCurve | null {
  const raw = localStorage.getItem(BEST_CACHE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as CachedCurve; } catch { return null; }
}

function saveCurveCache(range: CurveRange, data: CurvePoint[], activityCount: number) {
  localStorage.setItem(CACHE_KEY_PREFIX + range, JSON.stringify({ data, activityCount }));
}

interface Props {
  activities: Activity[];
}

export function PowerCurve({ activities }: Props) {
  const [range, setRange] = useState<CurveRange>("30d");
  const [curves, setCurves] = useState<Partial<Record<CurveRange, CachedCurve>>>(() => ({
    "30d": loadCachedCurve("30d") ?? undefined,
    "90d": loadCachedCurve("90d") ?? undefined,
  }));
  const [bestCurve, setBestCurve] = useState<CachedCurve | null>(loadBestCurve);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const cached = curves[range] ?? null;
  const curve = cached?.data ?? null;

  const computingRef = useRef(false);

  const compute = useCallback(async () => {
    const now = new Date();
    const since = subDays(now, range === "30d" ? 30 : 90);

    const allPowerActs = activities.filter((a) => a.average_watts);
    const inRangeIds = new Set(
      allPowerActs
        .filter((a) => isAfter(parseISO(a.start_date_local), since))
        .map((a) => a.id)
    );

    if (inRangeIds.size === 0) {
      setError("No activities with power data in this period.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress({ done: 0, total: allPowerActs.length });

    const rangeStreams: number[][] = [];
    const allStreams: number[][] = [];

    for (let i = 0; i < allPowerActs.length; i++) {
      try {
        const watts = await fetchActivityWatts(allPowerActs[i].id);
        if (watts && watts.length > 0) {
          allStreams.push(watts);
          if (inRangeIds.has(allPowerActs[i].id)) rangeStreams.push(watts);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "rate_limited") {
          setError(`Strava's API rate limit was reached after ${i} activities. This happens when too many requests are made in a short period — please wait 15 minutes and try again.`);
          setLoading(false);
          return;
        }
      }
      setProgress({ done: i + 1, total: allPowerActs.length });
    }

    if (rangeStreams.length === 0) {
      setError("No power stream data found for activities in this period.");
      setLoading(false);
      return;
    }

    const chartData = buildCurve(rangeStreams);
    const entry: CachedCurve = { data: chartData, activityCount: inRangeIds.size };
    setCurves((prev) => ({ ...prev, [range]: entry }));
    saveCurveCache(range, chartData, inRangeIds.size);

    const bestData = buildCurve(allStreams);
    const bestEntry: CachedCurve = { data: bestData, activityCount: allPowerActs.length };
    setBestCurve(bestEntry);
    localStorage.setItem(BEST_CACHE_KEY, JSON.stringify(bestEntry));

    setLoading(false);
  }, [activities, range]);

  const eligibleCount = useMemo(() => {
    const since = subDays(new Date(), range === "30d" ? 30 : 90);
    return activities.filter((a) => a.average_watts && isAfter(parseISO(a.start_date_local), since)).length;
  }, [activities, range]);

  const allPowerCount = useMemo(
    () => activities.filter((a) => a.average_watts).length,
    [activities]
  );

  useEffect(() => {
    const rangeStale = !cached || cached.activityCount !== eligibleCount;
    const bestStale = !bestCurve || bestCurve.activityCount !== allPowerCount;
    if ((rangeStale || bestStale) && !computingRef.current && eligibleCount > 0) {
      const id = setTimeout(() => {
        computingRef.current = true;
        compute().finally(() => { computingRef.current = false; });
      }, 0);
      return () => clearTimeout(id);
    }
  }, [range, cached, bestCurve, eligibleCount, allPowerCount, compute]);

  const mergedCurve = useMemo((): ChartPoint[] | null => {
    if (!curve && !bestCurve?.data.length) return null;
    const curMap = new Map((curve ?? []).map((p) => [p.label, p.watts]));
    const bestMap = new Map((bestCurve?.data ?? []).map((p) => [p.label, p.watts]));
    const labels = ALL_DURATIONS
      .map((d) => formatDuration(d))
      .filter((l) => curMap.has(l) || bestMap.has(l));
    return labels.map((label) => ({
      label,
      current: curMap.get(label),
      best: bestMap.get(label),
    }));
  }, [curve, bestCurve]);

  const rangeLabel = range === "30d" ? "Last 30 days" : "Last 90 days";

  return (
    <CollapsibleSection title="Power Curve">
      <div className={clsx("power-curve-controls", styles.controls)}>
        <PeriodToggle
          options={["30d", "90d"] as const}
          selected={range}
          onSelect={setRange}
          renderLabel={(r) => r === "30d" ? "Last 30 days" : "Last 90 days"}
          inline
        />
      </div>

      {error && <div className="power-curve-error">{error}</div>}

      {loading && <StreamProgress done={progress.done} total={progress.total} />}

      {mergedCurve && !loading && (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={mergedCurve}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" />
            <XAxis dataKey="label" tick={{ fill: "var(--tick-color)", fontSize: 12 }} />
            <YAxis tick={{ fill: "var(--tick-color)", fontSize: 12 }} unit="W" />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => [
                `${value} W`,
                name === "current" ? rangeLabel : "All-time best",
              ]}
            />
            <Line
              type="monotone"
              dataKey="best"
              name="best"
              stroke="#7a8fa6"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 4, fill: "#7a8fa6" }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="current"
              name="current"
              stroke="#fc4c02"
              strokeWidth={2}
              dot={{ fill: "#fc4c02", r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </CollapsibleSection>
  );
}
