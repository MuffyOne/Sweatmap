import { useState, useEffect, useCallback, useRef } from "react";
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
import { fetchActivityWatts, type Activity } from "../../api/strava";
import { TOOLTIP_STYLE } from "../../lib/utils";

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

function loadCachedCurve(range: CurveRange): CurvePoint[] | null {
  const raw = localStorage.getItem(CACHE_KEY_PREFIX + range);
  if (!raw) return null;
  return JSON.parse(raw) as CurvePoint[];
}

function saveCurveCache(range: CurveRange, curve: CurvePoint[]) {
  localStorage.setItem(CACHE_KEY_PREFIX + range, JSON.stringify(curve));
}

interface Props {
  activities: Activity[];
}

export function PowerCurve({ activities }: Props) {
  const [range, setRange] = useState<CurveRange>("30d");
  const [curves, setCurves] = useState<Partial<Record<CurveRange, CurvePoint[]>>>(() => ({
    "30d": loadCachedCurve("30d") ?? undefined,
    "90d": loadCachedCurve("90d") ?? undefined,
  }));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const curve = curves[range] ?? null;

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

    setCurves((prev) => ({ ...prev, [range]: chartData }));
    saveCurveCache(range, chartData);
    setLoading(false);
  }, [activities, range]);

  useEffect(() => {
    if (!curves[range] && !computingRef.current) {
      const id = setTimeout(() => {
        computingRef.current = true;
        compute().finally(() => { computingRef.current = false; });
      }, 0);
      return () => clearTimeout(id);
    }
  }, [range, curves, compute]);

  return (
    <div className="chart-section">
      <div className="power-curve-header">
        <h3>Power Curve</h3>
        <div className="power-curve-controls">
          <div className="period-toggle" style={{ marginBottom: 0 }}>
            {(["30d", "90d"] as CurveRange[]).map((r) => (
              <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
                {r === "30d" ? "Last 30 days" : "Last 90 days"}
              </button>
            ))}
          </div>
          <button className="btn-compute" onClick={compute} disabled={loading}>
            {loading ? `${progress.done} / ${progress.total}…` : curve ? "Refresh" : "Compute"}
          </button>
        </div>
      </div>

      {error && <div className="power-curve-error">{error}</div>}

      {!curve && !loading && !error && (
        <div className="power-curve-empty">
          Click <strong>Compute</strong> to build your power curve — fetches a stream for each
          activity with power data in the selected period.
        </div>
      )}

      {loading && (
        <div className="power-curve-empty">
          Fetching streams… {progress.done} / {progress.total}
          <div className="loading-bar-track" style={{ marginTop: "0.75rem" }}>
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
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 12 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 12 }} unit="W" />
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
    </div>
  );
}
