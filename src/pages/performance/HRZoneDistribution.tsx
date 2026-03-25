import { useState, useEffect, useCallback, useRef } from "react";
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
import { fetchActivityHeartrate, type Activity } from "../../api/strava";
import { AGE_KEY } from "../Settings";
import { formatTime, TOOLTIP_STYLE } from "../../lib/utils";
import { CollapsibleSection } from "../../lib/CollapsibleSection";

type Range = "30d" | "90d";

const HR_ZONE_DEFS = [
  { label: "Z1", name: "Recovery",  min: 0,    max: 0.60, color: "#7c90aa" },
  { label: "Z2", name: "Aerobic",   min: 0.60, max: 0.70, color: "#3b8fd4" },
  { label: "Z3", name: "Tempo",     min: 0.70, max: 0.80, color: "#22a06b" },
  { label: "Z4", name: "Threshold", min: 0.80, max: 0.90, color: "#e07820" },
  { label: "Z5", name: "Max",       min: 0.90, max: 1.00, color: "#e03535" },
];

const CACHE_KEY_PREFIX = "hr_zones_v2_";

function getHRZoneIndex(bpm: number, maxHR: number): number {
  const ratio = bpm / maxHR;
  for (let i = HR_ZONE_DEFS.length - 1; i >= 0; i--) {
    if (ratio >= HR_ZONE_DEFS[i].min) return i;
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

export function HRZoneDistribution({ activities, onNavigate }: Props) {
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

  const computingRef = useRef(false);

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
    if (!zones[range] && !computingRef.current && ageValid) {
      const id = setTimeout(() => {
        computingRef.current = true;
        compute().finally(() => { computingRef.current = false; });
      }, 0);
      return () => clearTimeout(id);
    }
  }, [range, zones, ageValid, compute]);

  const totalSeconds = data?.reduce((s, z) => s + z.seconds, 0) ?? 0;

  return (
    <CollapsibleSection title="Time in HR Zones">
      <div className="power-curve-controls" style={{ marginBottom: "1rem" }}>
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

      {error && <div className="power-curve-error">{error}</div>}

      {!data && !loading && !error && (
        <div className="power-curve-empty">
          {ageValid
            ? <>Computing your HR zone distribution…</>
            : <>Set your <strong>Age</strong> in <button className="link-btn" onClick={() => onNavigate("settings")}>Settings</button> to compute HR zones.</>}
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
            {maxHR && <span style={{ marginLeft: "0.75rem", opacity: 0.5 }}>Max HR {maxHR} bpm</span>}
          </div>
          <ResponsiveContainer width="100%" height={HR_ZONE_DEFS.length * 46 + 20}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 64, left: 8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={(v) => formatTime(v as number)}
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                width={40}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "#e8eaf0" }}
                itemStyle={{ color: "#e8eaf0" }}
                labelFormatter={(label) => {
                  const zone = HR_ZONE_DEFS.find((z) => z.label === label);
                  return zone ? `${zone.label} · ${zone.name}` : String(label);
                }}
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
    </CollapsibleSection>
  );
}
