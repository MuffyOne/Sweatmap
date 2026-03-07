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
import { fetchActivityHeartrate, type Activity } from "./strava";
import { AGE_KEY } from "./Settings";

type Range = "30d" | "90d";

const HR_ZONE_DEFS = [
  { label: "Z1 · Recovery",  min: 0,    max: 0.60, color: "#4a5568" },
  { label: "Z2 · Aerobic",   min: 0.60, max: 0.70, color: "#2d6a9f" },
  { label: "Z3 · Tempo",     min: 0.70, max: 0.80, color: "#276d4e" },
  { label: "Z4 · Threshold", min: 0.80, max: 0.90, color: "#b05a18" },
  { label: "Z5 · Max",       min: 0.90, max: 1.00, color: "#9b2c2c" },
];

const CACHE_KEY_PREFIX = "hr_zones_v2_";

function getHRZoneIndex(bpm: number, maxHR: number): number {
  const ratio = bpm / maxHR;
  for (let i = HR_ZONE_DEFS.length - 1; i >= 0; i--) {
    if (ratio >= HR_ZONE_DEFS[i].min) return i;
  }
  return 0;
}

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
  const ageVal = parseInt(localStorage.getItem(AGE_KEY) ?? "", 10);
  const ageValid = !isNaN(ageVal) && ageVal > 0 && ageVal < 120;
  const maxHR = ageValid ? 220 - ageVal : null;

  const compute = useCallback(async () => {
    if (!maxHR) return;

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

    const zoneTotals = new Array<number>(HR_ZONE_DEFS.length).fill(0);

    for (let i = 0; i < eligible.length; i++) {
      try {
        const hrStream = await fetchActivityHeartrate(eligible[i].id);
        if (hrStream) {
          for (const bpm of hrStream) {
            if (bpm > 0) {
              zoneTotals[getHRZoneIndex(bpm, maxHR)]++;
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "rate_limited") {
          setError(`Strava's API rate limit was reached after ${i} activities. This happens when too many requests are made in a short period — please wait 15 minutes and try again.`);
          setLoading(false);
          return;
        }
      }
      setProgress({ done: i + 1, total: eligible.length });
    }

    if (zoneTotals.every((t) => t === 0)) {
      setError("No heart rate stream data found for activities in this period.");
      setLoading(false);
      return;
    }

    const result: ZonePoint[] = HR_ZONE_DEFS.map((z, i) => ({
      label: z.label,
      seconds: zoneTotals[i],
      color: z.color,
    }));

    setZones((prev) => ({ ...prev, [range]: result }));
    saveCache(range, result);
    setLoading(false);
  }, [activities, range, maxHR]);

  useEffect(() => {
    if (!zones[range] && !loading && ageValid) {
      compute();
    }
  }, [range, zones, loading, ageValid, compute]);

  const totalSeconds = data?.reduce((s, z) => s + z.seconds, 0) ?? 0;

  return (
    <div className="chart-section" style={{ marginTop: "1.25rem" }}>
      <div className="power-curve-header">
        <h3>Time in HR Zones</h3>
        <div className="power-curve-controls">
          {maxHR && (
            <span style={{ fontSize: "0.78rem", opacity: 0.4 }}>Max HR {maxHR} bpm</span>
          )}
          <div className="period-toggle" style={{ marginBottom: 0 }}>
            {(["30d", "90d"] as Range[]).map((r) => (
              <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
                {r === "30d" ? "Last 30 days" : "Last 90 days"}
              </button>
            ))}
          </div>
          <button className="btn-compute" onClick={compute} disabled={loading || !ageValid}>
            {loading ? `${progress.done} / ${progress.total}…` : data ? "Refresh" : "Compute"}
          </button>
        </div>
      </div>

      {error && <div className="power-curve-error">{error}</div>}

      {!data && !loading && !error && (
        <div className="power-curve-empty">
          {ageValid
            ? <>Computing your HR zone distribution…</>
            : <>Set your <strong>Age</strong> in <strong>Settings</strong> to compute HR zones.</>}
        </div>
      )}

      {loading && (
        <div className="power-curve-empty">
          Fetching streams… {progress.done} / {progress.total}
          <div className="loading-bar-track" style={{ marginTop: "0.75rem" }}>
            <div
              className="loading-bar-fill"
              style={{
                width: progress.total > 0
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
          <ResponsiveContainer width="100%" height={HR_ZONE_DEFS.length * 46 + 20}>
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
