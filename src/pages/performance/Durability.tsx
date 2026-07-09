import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";
import { fetchActivityStreams, type Activity } from "../../api/strava";
import { TOOLTIP_STYLE } from "../../lib/utils";
import { CollapsibleSection } from "../../lib/CollapsibleSection";
import { StreamProgress } from "../../components/StreamProgress";
import styles from "./Durability.module.css";

const MIN_MOVING_TIME = 3600; // 60 min — need a sustained effort to measure fade
const MIN_SAMPLES = 120; // ~2 min per half, at minimum
const MAX_RIDES = 60; // bounds worst-case Strava rate-limit exposure

const DURABILITY_ZONES = [
  { label: "Excellent", y1: -50, y2: 5, color: "#22a06b" },
  { label: "Good", y1: 5, y2: 10, color: "#3b8fd4" },
  { label: "Moderate fade", y1: 10, y2: 15, color: "#d4a820" },
  { label: "Significant fade", y1: 15, y2: 100, color: "#e03535" },
];

function getStatus(decoupling: number): { label: string; color: string } {
  const zone = DURABILITY_ZONES.find((z) => decoupling < z.y2) ?? DURABILITY_ZONES[DURABILITY_ZONES.length - 1];
  return { label: zone.label, color: zone.color };
}

function computeDecoupling(watts: number[], hr: number[]): number | null {
  const n = Math.min(watts.length, hr.length);
  if (n < MIN_SAMPLES) return null;
  const mid = Math.floor(n / 2);
  const avg = (arr: number[], a: number, b: number) => {
    let sum = 0;
    for (let i = a; i < b; i++) sum += arr[i];
    return sum / (b - a);
  };
  const p1 = avg(watts, 0, mid), h1 = avg(hr, 0, mid);
  const p2 = avg(watts, mid, n), h2 = avg(hr, mid, n);
  if (h1 === 0 || h2 === 0 || p1 === 0) return null;
  const ratio1 = p1 / h1;
  const ratio2 = p2 / h2;
  return ((ratio1 - ratio2) / ratio1) * 100;
}

interface RidePoint {
  activityId: number;
  date: string;
  fullDate: string;
  label: string;
  decoupling: number;
}

interface CachedDurability {
  data: RidePoint[];
  activityCount: number;
}

const CACHE_KEY = "durability_alltime";

function loadCache(): CachedDurability | null {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as CachedDurability; } catch { return null; }
}

function saveCache(data: RidePoint[], activityCount: number) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data, activityCount }));
}

interface Props {
  activities: Activity[];
}

export function Durability({ activities }: Props) {
  const [cached, setCached] = useState<CachedDurability | null>(loadCache);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const computingRef = useRef(false);

  const eligible = useMemo(
    () =>
      activities
        .filter((a) => a.average_watts && a.average_heartrate && a.moving_time >= MIN_MOVING_TIME)
        .sort((a, b) => (a.start_date_local < b.start_date_local ? 1 : -1)),
    [activities]
  );

  const hasPowerHR = useMemo(
    () => activities.some((a) => a.average_watts && a.average_heartrate),
    [activities]
  );

  const compute = useCallback(async () => {
    const toFetch = eligible.slice(0, MAX_RIDES);
    setLoading(true);
    setError(null);
    setProgress({ done: 0, total: toFetch.length });

    const results: RidePoint[] = [];

    for (let i = 0; i < toFetch.length; i++) {
      const a = toFetch[i];
      try {
        const streams = await fetchActivityStreams(a.id);
        if (streams?.watts && streams?.heartrate) {
          const decoupling = computeDecoupling(streams.watts, streams.heartrate);
          if (decoupling !== null) {
            const date = parseISO(a.start_date_local);
            results.push({
              activityId: a.id,
              date: a.start_date_local,
              fullDate: format(date, "MMM d, yyyy"),
              label: format(date, "MMM d"),
              decoupling: Math.round(decoupling * 10) / 10,
            });
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "rate_limited") {
          setError(`Strava's API rate limit was reached after ${i} activities. This happens when too many requests are made in a short period — please wait 15 minutes and try again.`);
          setLoading(false);
          return;
        }
      }
      setProgress({ done: i + 1, total: toFetch.length });
    }

    results.sort((a, b) => (a.date < b.date ? -1 : 1));

    if (results.length === 0) {
      setError("No usable power + heart-rate stream data found for long rides yet.");
      setLoading(false);
      return;
    }

    const entry: CachedDurability = { data: results, activityCount: eligible.length };
    setCached(entry);
    saveCache(results, eligible.length);
    setLoading(false);
  }, [eligible]);

  useEffect(() => {
    const stale = !cached || cached.activityCount !== eligible.length;
    if (stale && !computingRef.current && eligible.length > 0) {
      const id = setTimeout(() => {
        computingRef.current = true;
        compute().finally(() => { computingRef.current = false; });
      }, 0);
      return () => clearTimeout(id);
    }
  }, [cached, eligible, compute]);

  const data = cached?.data ?? null;
  const latest = data?.[data.length - 1] ?? null;
  const rollingAvg = useMemo(() => {
    if (!data || data.length === 0) return null;
    const last5 = data.slice(-5);
    return Math.round((last5.reduce((s, d) => s + d.decoupling, 0) / last5.length) * 10) / 10;
  }, [data]);

  const latestStatus = latest ? getStatus(latest.decoupling) : null;

  return (
    <CollapsibleSection title="Durability">
      {error && <div className="power-curve-error">{error}</div>}

      {!data && !loading && !error && !hasPowerHR && (
        <div className="power-curve-empty">
          Durability needs a power meter and heart-rate data — none found yet.
        </div>
      )}

      {!data && !loading && !error && hasPowerHR && eligible.length === 0 && (
        <div className="power-curve-empty">
          No long steady rides (60+ min) found yet — durability needs a sustained effort to measure fade.
        </div>
      )}

      {loading && <StreamProgress done={progress.done} total={progress.total} label="Fetching rides…" />}

      {data && !loading && latest && latestStatus && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="label">Latest ride</div>
              <div className="value">{latest.decoupling > 0 ? "+" : ""}{latest.decoupling}%</div>
            </div>
            <div className="stat-card">
              <div className="label">Rolling avg (last 5)</div>
              <div className="value">{rollingAvg !== null && rollingAvg > 0 ? "+" : ""}{rollingAvg}%</div>
            </div>
            <div className="stat-card">
              <div className="label">Status</div>
              <div className="value" style={{ color: latestStatus.color, fontSize: "1.1rem" }}>{latestStatus.label}</div>
            </div>
          </div>

          <div className={styles.legendRow}>
            {DURABILITY_ZONES.map((z) => (
              <span key={z.label} className={styles.zoneLabel} style={{ color: z.color }}>● {z.label}</span>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--tick-color)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--tick-color)", fontSize: 11 }} axisLine={false} tickLine={false} width={36} unit="%" />
              {DURABILITY_ZONES.map((z) => (
                <ReferenceArea key={z.label} y1={z.y1} y2={z.y2} fill={z.color} fillOpacity={0.1} ifOverflow="hidden" />
              ))}
              <ReferenceLine y={0} stroke="var(--border-hover)" strokeWidth={1} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: "var(--text-primary)" }}
                labelFormatter={(_val, payload) => (payload?.[0]?.payload as RidePoint | undefined)?.fullDate ?? ""}
                formatter={(value) => [`${value}%`, "Decoupling"]}
              />
              <Line
                type="monotone"
                dataKey="decoupling"
                stroke="#fc4c02"
                strokeWidth={2}
                dot={{ fill: "#fc4c02", r: 3 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className={styles.footnote}>
            Aerobic decoupling compares the power-to-heart-rate ratio in the first vs. second half of each ride — a
            rising number means power faded relative to heart rate. Based on the{" "}
            <a
              href="https://www.trainingpeaks.com/blog/aerobic-endurance-and-decoupling/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footnoteLink}
            >
              Pw:Hr decoupling
            </a>{" "}
            metric. Only rides 60+ minutes with power and heart-rate data are used.
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}
