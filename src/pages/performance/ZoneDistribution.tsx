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
import { fetchActivityWatts, type Activity } from "../../api/strava";
import { FTP_KEY } from "../Settings";
import { formatTime, TOOLTIP_STYLE } from "../../lib/utils";

type Range = "30d" | "90d";

// Standard 7-zone power model (% of FTP)
const POWER_ZONES = [
  { label: "Z1 · Recovery",      min: 0,    max: 0.55,       color: "#7c90aa" },
  { label: "Z2 · Endurance",     min: 0.55, max: 0.75,       color: "#3b8fd4" },
  { label: "Z3 · Tempo",         min: 0.75, max: 0.90,       color: "#22a06b" },
  { label: "Z4 · Threshold",     min: 0.90, max: 1.05,       color: "#d4a820" },
  { label: "Z5 · VO2 Max",       min: 1.05, max: 1.20,       color: "#e07820" },
  { label: "Z6 · Anaerobic",     min: 1.20, max: 1.50,       color: "#e03535" },
  { label: "Z7 · Neuromuscular", min: 1.50, max: Infinity,   color: "#9333ea" },
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

// Seiler 3-zone model: Easy (Z1+Z2), Moderate (Z3+Z4), Hard (Z5+Z6+Z7)
const TRAINING_MODELS = [
  { name: "Polarized",   easy: 80, moderate: 5,  hard: 15, description: "80% easy, 15% hard" },
  { name: "Pyramidal",   easy: 75, moderate: 20, hard: 5,  description: "75% easy, 20% moderate" },
  { name: "Threshold",   easy: 55, moderate: 35, hard: 10, description: "55% easy, 35% moderate" },
  { name: "Sweet Spot",  easy: 60, moderate: 30, hard: 10, description: "60% easy, 30% moderate" },
];

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

function TrainingDistribution({ data }: { data: ZonePoint[] }) {
  const easy     = (data[0]?.seconds ?? 0) + (data[1]?.seconds ?? 0);
  const moderate = (data[2]?.seconds ?? 0) + (data[3]?.seconds ?? 0);
  const hard     = (data[4]?.seconds ?? 0) + (data[5]?.seconds ?? 0) + (data[6]?.seconds ?? 0);
  const total = easy + moderate + hard;
  if (total === 0) return null;

  const easyPct     = (easy / total) * 100;
  const moderatePct = (moderate / total) * 100;
  const hardPct     = (hard / total) * 100;
  const actual = [easyPct, moderatePct, hardPct];

  const scored = TRAINING_MODELS.map((m) => ({
    ...m,
    score: cosineSimilarity(actual, [m.easy, m.moderate, m.hard]),
  })).sort((a, b) => b.score - a.score);

  const MACRO_ZONES = [
    { label: "Easy",     pct: easyPct,     color: "#3b8fd4", sub: "Z1+Z2 · <75% FTP" },
    { label: "Moderate", pct: moderatePct, color: "#d4a820", sub: "Z3+Z4 · 75–105% FTP" },
    { label: "Hard",     pct: hardPct,     color: "#e03535", sub: "Z5–Z7 · >105% FTP" },
  ];

  return (
    <div style={{ marginTop: "2rem", minWidth: 0, overflow: "hidden" }}>
      <h3 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
        Training Distribution
      </h3>

      {/* Actual distribution stacked bar */}
      <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", marginBottom: "0.5rem" }}>
        {MACRO_ZONES.map((z) => (
          <div
            key={z.label}
            style={{ flex: z.pct, background: z.color, minWidth: z.pct > 0 ? 2 : 0 }}
            title={`${z.label}: ${z.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: "1.25rem", marginBottom: "1.5rem" }}>
        {MACRO_ZONES.map((z) => (
          <div key={z.label} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: z.color, flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
                {z.pct.toFixed(0)}%
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: "0.3rem" }}>{z.label}</span>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{z.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Model comparison cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "0.75rem" }}>
        {scored.map((m, rank) => (
          <div
            key={m.name}
            style={{
              background: rank === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
              border: rank === 0 ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: rank === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)" }}>
                {m.name}
              </span>
              {rank === 0 && (
                <span style={{ fontSize: 10, color: "#fc4c02", fontWeight: 600 }}>Best match</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: "0.6rem" }}>{m.description}</div>
            {/* Mini stacked bar */}
            <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: "0.5rem" }}>
              <div style={{ flex: m.easy,     background: "#3b8fd4" }} />
              <div style={{ flex: m.moderate, background: "#d4a820" }} />
              <div style={{ flex: m.hard,     background: "#e03535" }} />
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              {(m.score * 100).toFixed(0)}% match
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "1rem", fontSize: 11, color: "rgba(255,255,255,0.22)", lineHeight: 1.5 }}>
        3-zone model (Easy / Moderate / Hard) based on{" "}
        <a
          href="https://pubmed.ncbi.nlm.nih.gov/20492317/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(255,255,255,0.35)", textDecoration: "underline" }}
        >
          Seiler &amp; Tønnessen (2009)
        </a>
        . Power zone boundaries from{" "}
        <a
          href="https://www.trainingpeaks.com/blog/power-training-levels/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(255,255,255,0.35)", textDecoration: "underline" }}
        >
          Coggan's 7-zone model
        </a>
        . Model targets adapted from{" "}
        <a
          href="https://pubmed.ncbi.nlm.nih.gov/23752040/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(255,255,255,0.35)", textDecoration: "underline" }}
        >
          Stöggl &amp; Sperlich (2014)
        </a>
        .
      </div>
    </div>
  );
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

  const computingRef = useRef(false);

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
    if (!zones[range] && !computingRef.current && ftpValid) {
      const id = setTimeout(() => {
        computingRef.current = true;
        compute().finally(() => { computingRef.current = false; });
      }, 0);
      return () => clearTimeout(id);
    }
  }, [range, zones, ftpValid, compute]);

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
              margin={{ top: 4, right: 64, left: 0, bottom: 4 }}
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
          <TrainingDistribution data={data} />
        </>
      )}
    </div>
  );
}
