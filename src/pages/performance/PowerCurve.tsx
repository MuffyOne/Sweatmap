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
import styles from "./PowerCurve.module.css";

const DURATIONS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];

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

type CurveRange = "30d" | "90d";

interface CurvePoint {
  label: string;
  watts: number;
}

const CACHE_KEY_PREFIX = "power_curve_";

interface CachedCurve {
  data: CurvePoint[];
  activityCount: number;
}

function loadCachedCurve(range: CurveRange): CachedCurve | null {
  const raw = localStorage.getItem(CACHE_KEY_PREFIX + range);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  // migrate old format (plain array) to new format
  if (Array.isArray(parsed)) return { data: parsed, activityCount: -1 };
  return parsed as CachedCurve;
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
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const cached = curves[range] ?? null;
  const curve = cached?.data ?? null;

  const computingRef = useRef(false);

  const compute = useCallback(async () => {
    const now = new Date();
    const since = range === "30d" ? subDays(now, 30) : subDays(now, 90);

    const eligible = activities.filter(
      (a) => a.average_watts && isAfter(parseISO(a.start_date_local), since)
    );

    if (eligible.length === 0) {
      setError("No activities with power data in this period.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress({ done: 0, total: eligible.length });

    const allStreams: number[][] = [];
    for (let i = 0; i < eligible.length; i++) {
      try {
        const watts = await fetchActivityWatts(eligible[i].id);
        if (watts && watts.length > 0) allStreams.push(watts);
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "rate_limited") {
          setError(`Strava's API rate limit was reached after ${i} activities. This happens when too many requests are made in a short period — please wait 15 minutes and try again.`);
        } else {
          setError(`Failed fetching activity ${eligible[i].id}.`);
        }
        setLoading(false);
        return;
      }
      setProgress({ done: i + 1, total: eligible.length });
    }

    if (allStreams.length === 0) {
      setError("No power stream data found for activities in this period.");
      setLoading(false);
      return;
    }

    const chartData: CurvePoint[] = DURATIONS.map((d) => ({
      label: formatDuration(d),
      watts: Math.max(...allStreams.map((w) => computeMMP(w, d)).filter((v) => v > 0), 0),
    })).filter((d) => d.watts > 0);

    const entry: CachedCurve = { data: chartData, activityCount: eligible.length };
    setCurves((prev) => ({ ...prev, [range]: entry }));
    saveCurveCache(range, chartData, eligible.length);
    setLoading(false);
  }, [activities, range]);

  // auto-compute when no cache or when activity count changed
  const eligibleCount = useMemo(() => {
    const since = subDays(new Date(), range === "30d" ? 30 : 90);
    return activities.filter((a) => a.average_watts && isAfter(parseISO(a.start_date_local), since)).length;
  }, [activities, range]);

  useEffect(() => {
    const needsCompute = !cached || cached.activityCount !== eligibleCount;
    if (needsCompute && !computingRef.current && eligibleCount > 0) {
      const id = setTimeout(() => {
        computingRef.current = true;
        compute().finally(() => { computingRef.current = false; });
      }, 0);
      return () => clearTimeout(id);
    }
  }, [range, cached, eligibleCount, compute]);

  return (
    <CollapsibleSection title="Power Curve">
      <div className={clsx("power-curve-controls", styles.controls)}>
        <div className={clsx("period-toggle", styles.periodToggleInline)}>
          {(["30d", "90d"] as CurveRange[]).map((r) => (
            <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
              {r === "30d" ? "Last 30 days" : "Last 90 days"}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="power-curve-error">{error}</div>}

      {loading && (
        <div className="power-curve-empty">
          Fetching streams… {progress.done} / {progress.total}
          <div className={clsx("loading-bar-track", styles.loadingTrack)}>
            <div
              className="loading-bar-fill"
              style={{
                width:
                  progress.total > 0
                    ? `${Math.round((progress.done / progress.total) * 100)}%`
                    : "5%",
                animation: "none",
                opacity: 1,
              }}
            />
          </div>
        </div>
      )}

      {curve && !loading && (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={curve}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" />
            <XAxis dataKey="label" tick={{ fill: "var(--tick-color)", fontSize: 12 }} />
            <YAxis tick={{ fill: "var(--tick-color)", fontSize: 12 }} unit="W" />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${value} W`, "Best power"]}
            />
            <Line
              type="monotone"
              dataKey="watts"
              stroke="#fc4c02"
              strokeWidth={2}
              dot={{ fill: "#fc4c02", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </CollapsibleSection>
  );
}
