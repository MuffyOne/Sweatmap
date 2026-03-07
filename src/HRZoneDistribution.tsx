import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { subDays, parseISO, isAfter } from "date-fns";
import { fetchActivityZones, type Activity } from "./strava";

type Range = "30d" | "90d";

const HR_ZONES = [
  { label: "Z1 · Recovery",    color: "#6b7280" },
  { label: "Z2 · Aerobic",     color: "#3b82f6" },
  { label: "Z3 · Tempo",       color: "#22c55e" },
  { label: "Z4 · Threshold",   color: "#f97316" },
  { label: "Z5 · Max",         color: "#ef4444" },
];

const CACHE_KEY_PREFIX = "hr_zones_";

function formatTime(seconds: number): string {
  if (seconds === 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface ZonePoint {
  label: string;
  seconds: number;
  color: string;
}

function loadCache(range: Range): ZonePoint[] | null {
  const raw = localStorage.getItem(CACHE_KEY_PREFIX + range);
  if (!raw) return null;
  return JSON.parse(raw) as ZonePoint[];
}

function saveCache(range: Range, data: ZonePoint[]) {
  localStorage.setItem(CACHE_KEY_PREFIX + range, JSON.stringify(data));
}

interface Props {
  activities: Activity[];
}

export function HRZoneDistribution({ activities }: Props) {
  const [range, setRange] = useState<Range>("30d");
  const [zones, setZones] = useState<Partial<Record<Range, ZonePoint[]>>>(() => ({
    "30d": loadCache("30d") ?? undefined,
    "90d": loadCache("90d") ?? undefined,
  }));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const data = zones[range] ?? null;

  const compute = useCallback(async () => {
    const now = new Date();
    const since = subDays(now, range === "30d" ? 30 : 90);
    const eligible = activities.filter(
      (a) => a.average_heartrate && isAfter(parseISO(a.start_date_local), since)
    );

    if (eligible.length === 0) {
      setError("No activities with heart rate data in this period.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress({ done: 0, total: eligible.length });

    const zoneTotals = new Array<number>(HR_ZONES.length).fill(0);

    for (let i = 0; i < eligible.length; i++) {
      try {
        const zoneData = await fetchActivityZones(eligible[i].id);
        const hrZone = zoneData.find((z) => z.type === "heartrate");
        if (hrZone) {
          hrZone.distribution_buckets.forEach((bucket, idx) => {
            if (idx < HR_ZONES.length) {
              zoneTotals[idx] += bucket.time;
            }
          });
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "rate_limited") {
          setError(`Rate limited after ${i} activities. Wait 15 min and try again.`);
          setLoading(false);
          return;
        }
      }
      setProgress({ done: i + 1, total: eligible.length });
    }

    if (zoneTotals.every((t) => t === 0)) {
      setError("No heart rate zone data found for activities in this period.");
      setLoading(false);
      return;
    }

    const result: ZonePoint[] = HR_ZONES.map((z, i) => ({
      label: z.label,
      seconds: zoneTotals[i],
      color: z.color,
    }));

    setZones((prev) => ({ ...prev, [range]: result }));
    saveCache(range, result);
    setLoading(false);
  }, [activities, range]);

  useEffect(() => {
    if (!zones[range] && !loading) {
      compute();
    }
  }, [range, zones, loading, compute]);

  const totalSeconds = data?.reduce((s, z) => s + z.seconds, 0) ?? 0;

  return (
    <div className="chart-section" style={{ marginTop: "1.25rem" }}>
      <div className="power-curve-header">
        <h3>Time in HR Zones</h3>
        <div className="power-curve-controls">
          <div className="period-toggle" style={{ marginBottom: 0 }}>
            {(["30d", "90d"] as Range[]).map((r) => (
              <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
                {r === "30d" ? "Last 30 days" : "Last 90 days"}
              </button>
            ))}
          </div>
          <button className="btn-compute" onClick={compute} disabled={loading}>
            {loading ? `${progress.done} / ${progress.total}…` : data ? "Refresh" : "Compute"}
          </button>
        </div>
      </div>

      {error && <div className="power-curve-error">{error}</div>}

      {!data && !loading && !error && (
        <div className="power-curve-empty">
          Click <strong>Compute</strong> to see how you distribute time across heart rate zones.
        </div>
      )}

      {loading && (
        <div className="power-curve-empty">
          Fetching zones… {progress.done} / {progress.total}
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

      {data && !loading && (
        <>
          <div className="zone-summary">
            Total HR time: <strong>{formatTime(totalSeconds)}</strong>
          </div>
          <ResponsiveContainer width="100%" height={HR_ZONES.length * 46 + 20}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 64, left: 116, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={(v) => formatTime(v as number)}
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                width={114}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
                contentStyle={{
                  background: "rgba(12, 15, 24, 0.92)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: 10,
                  color: "#e8eaf0",
                }}
                labelStyle={{ color: "#e8eaf0" }}
                itemStyle={{ color: "#e8eaf0" }}
                formatter={(value: unknown) => [formatTime(Number(value)), "Time"]}
              />
              <Bar dataKey="seconds" radius={[0, 6, 6, 0]} maxBarSize={28} isAnimationActive={false}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
