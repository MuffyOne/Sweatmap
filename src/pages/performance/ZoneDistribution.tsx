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
import { fetchActivityWatts, type Activity } from "../../api/strava";
import { FTP_KEY } from "../Settings";
import { formatTime, TOOLTIP_STYLE } from "../../lib/utils";

type Range = "30d" | "90d";

// Standard 7-zone power model (% of FTP)
const POWER_ZONES = [
  { label: "Z1 · Recovery",      min: 0,    max: 0.55,       color: "#4a5568" },
  { label: "Z2 · Endurance",     min: 0.55, max: 0.75,       color: "#2d6a9f" },
  { label: "Z3 · Tempo",         min: 0.75, max: 0.90,       color: "#276d4e" },
  { label: "Z4 · Threshold",     min: 0.90, max: 1.05,       color: "#92780f" },
  { label: "Z5 · VO2 Max",       min: 1.05, max: 1.20,       color: "#b05a18" },
  { label: "Z6 · Anaerobic",     min: 1.20, max: 1.50,       color: "#9b2c2c" },
  { label: "Z7 · Neuromuscular", min: 1.50, max: Infinity,   color: "#6b35a8" },
];

const CACHE_KEY_PREFIX = "power_zones_";

function getZoneIndex(watts: number, ftp: number): number {
  const ratio = watts / ftp;
  for (let i = POWER_ZONES.length - 1; i >= 0; i--) {
    if (ratio >= POWER_ZONES[i].min) return i;
  }
  return 0;
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
  onNavigate: (page: "settings") => void;
}

export function ZoneDistribution({ activities, onNavigate }: Props) {
  const [range, setRange] = useState<Range>("30d");
  const [zones, setZones] = useState<Partial<Record<Range, ZonePoint[]>>>(() => ({
    "30d": loadCache("30d") ?? undefined,
    "90d": loadCache("90d") ?? undefined,
  }));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const data = zones[range] ?? null;
  const ftpVal = parseInt(localStorage.getItem(FTP_KEY) ?? "", 10);
  const ftpValid = !isNaN(ftpVal) && ftpVal > 0;

  const compute = useCallback(async () => {
    if (!ftpValid) return;

    const now = new Date();
    const since = subDays(now, range === "30d" ? 30 : 90);
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

    const zoneTotals = new Array<number>(POWER_ZONES.length).fill(0);

    for (let i = 0; i < eligible.length; i++) {
      try {
        const watts = await fetchActivityWatts(eligible[i].id);
        if (watts) {
          for (const w of watts) {
            if (w > 0) {
              zoneTotals[getZoneIndex(w, ftpVal)]++;
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
      setError("No power stream data found for activities in this period.");
      setLoading(false);
      return;
    }

    const result: ZonePoint[] = POWER_ZONES.map((z, i) => ({
      label: z.label,
      seconds: zoneTotals[i],
      color: z.color,
    }));

    setZones((prev) => ({ ...prev, [range]: result }));
    saveCache(range, result);
    setLoading(false);
  }, [activities, range, ftpValid, ftpVal]);

  useEffect(() => {
    if (!zones[range] && !loading && ftpValid) {
      compute();
    }
  }, [range, zones, loading, ftpValid, compute]);

  const totalSeconds = data?.reduce((s, z) => s + z.seconds, 0) ?? 0;

  return (
    <div className="chart-section" style={{ marginTop: "1.25rem" }}>
      <div className="power-curve-header">
        <h3>Time in Power Zones</h3>
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
          {ftpValid
            ? <>Computing your power zone distribution…</>
            : <>Set your <strong>FTP</strong> in <button className="link-btn" onClick={() => onNavigate("settings")}>Settings</button> to compute power zones.</>}
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

      {data && !loading && (
        <>
          <div className="zone-summary">
            Total power time: <strong>{formatTime(totalSeconds)}</strong>
            <span style={{ marginLeft: "0.75rem", opacity: 0.5 }}>FTP {ftpVal} W</span>
          </div>
          <ResponsiveContainer width="100%" height={POWER_ZONES.length * 46 + 20}>
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
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "#e8eaf0" }}
                itemStyle={{ color: "#e8eaf0" }}
                formatter={(value: unknown) => [formatTime(Number(value)), "Time"]}
              />
              <Bar dataKey="seconds" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
