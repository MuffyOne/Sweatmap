import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { subDays, parseISO, isAfter } from "date-fns";
import { clsx } from "clsx";
import { fetchActivityWatts, type Activity } from "../../api/strava";
import { FTP_KEY } from "../Settings";
import { formatTime } from "../../lib/utils";
import { CollapsibleSection } from "../../lib/CollapsibleSection";
import { PeriodToggle } from "../../components/PeriodToggle";
import { StreamProgress } from "../../components/StreamProgress";
import { ZoneBarChart } from "../../components/ZoneBarChart";
import styles from "./ZoneDistribution.module.css";

type Range = "30d" | "90d";

const RANGE_DAYS: Record<Range, number> = { "30d": 30, "90d": 90 };

const POWER_ZONES = [
  { label: "Z1", name: "Recovery",      min: 0,    max: 0.55,       color: "#7c90aa" },
  { label: "Z2", name: "Endurance",     min: 0.55, max: 0.75,       color: "#3b8fd4" },
  { label: "Z3", name: "Tempo",         min: 0.75, max: 0.90,       color: "#22a06b" },
  { label: "Z4", name: "Threshold",     min: 0.90, max: 1.05,       color: "#d4a820" },
  { label: "Z5", name: "VO2 Max",       min: 1.05, max: 1.20,       color: "#e07820" },
  { label: "Z6", name: "Anaerobic",     min: 1.20, max: 1.50,       color: "#e03535" },
  { label: "Z7", name: "Neuromuscular", min: 1.50, max: Infinity,   color: "#9333ea" },
];

// Seiler 3-zone model: Easy (Z1+Z2), Moderate (Z3+Z4), Hard (Z5+Z6+Z7)
const TRAINING_MODELS = [
  { name: "Polarized",   easy: 80, moderate: 5,  hard: 15, description: "80% easy, 15% hard" },
  { name: "Pyramidal",   easy: 75, moderate: 20, hard: 5,  description: "75% easy, 20% moderate" },
  { name: "Threshold",   easy: 55, moderate: 35, hard: 10, description: "55% easy, 35% moderate" },
  { name: "Sweet Spot",  easy: 60, moderate: 30, hard: 10, description: "60% easy, 30% moderate" },
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

interface CachedZones {
  data: ZonePoint[];
  activityCount: number;
}

function loadCache(range: Range): CachedZones | null {
  const raw = localStorage.getItem(CACHE_KEY_PREFIX + range);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { data: parsed, activityCount: -1 };
    return parsed as CachedZones;
  } catch {
    return null;
  }
}

function saveCache(range: Range, data: ZonePoint[], activityCount: number) {
  localStorage.setItem(CACHE_KEY_PREFIX + range, JSON.stringify({ data, activityCount }));
}

interface Props {
  activities: Activity[];
  onNavigate: (page: "settings") => void;
}

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
    <div className={styles.trainingContainer}>
      <h3 className={styles.sectionTitle}>Training Distribution</h3>

      <div className={styles.distributionBar}>
        {MACRO_ZONES.map((z) => (
          <div
            key={z.label}
            style={{ flex: z.pct, background: z.color, minWidth: z.pct > 0 ? 2 : 0 }}
            title={`${z.label}: ${z.pct.toFixed(1)}%`}
          />
        ))}
      </div>

      <div className={styles.legendRow}>
        {MACRO_ZONES.map((z) => (
          <div key={z.label} className={styles.legendItem}>
            <div className={styles.legendSwatch} style={{ background: z.color }} />
            <div>
              <span className={styles.legendPct}>{z.pct.toFixed(0)}%</span>
              <span className={styles.legendLabel}>{z.label}</span>
              <div className={styles.legendSub}>{z.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.modelGrid}>
        {scored.map((m, rank) => (
          <div key={m.name} className={clsx(styles.modelCard, rank === 0 && styles.modelCardBest)}>
            <div className={styles.modelCardHeader}>
              <span className={clsx(styles.modelName, rank === 0 && styles.modelNameBest)}>
                {m.name}
              </span>
              {rank === 0 && <span className={styles.bestBadge}>Best match</span>}
            </div>
            <div className={clsx(styles.modelDesc, rank === 0 && styles.modelDescBest)}>{m.description}</div>
            <div className={clsx(styles.miniBar, rank === 0 && styles.miniBarBest)}>
              <div style={{ flex: m.easy,     background: "#3b8fd4" }} />
              <div style={{ flex: m.moderate, background: "#d4a820" }} />
              <div style={{ flex: m.hard,     background: "#e03535" }} />
            </div>
            <div className={clsx(styles.modelScore, rank === 0 && styles.modelScoreBest)}>
              {(m.score * 100).toFixed(0)}% match
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footnote}>
        3-zone model (Easy / Moderate / Hard) based on{" "}
        <a
          href="https://pubmed.ncbi.nlm.nih.gov/20492317/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.footnoteLink}
        >
          Seiler &amp; Tønnessen (2009)
        </a>
        . Power zone boundaries from{" "}
        <a
          href="https://www.trainingpeaks.com/blog/power-training-levels/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.footnoteLink}
        >
          Coggan's 7-zone model
        </a>
        . Model targets adapted from{" "}
        <a
          href="https://pubmed.ncbi.nlm.nih.gov/23752040/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.footnoteLink}
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
  const [zones, setZones] = useState<Partial<Record<Range, CachedZones>>>(() => ({
    "30d": loadCache("30d") ?? undefined,
    "90d": loadCache("90d") ?? undefined,
  }));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const cached = zones[range] ?? null;
  const data = cached?.data ?? null;
  const ftpVal = parseInt(localStorage.getItem(FTP_KEY) ?? "", 10);
  const ftpValid = !isNaN(ftpVal) && ftpVal > 0;

  const computingRef = useRef(false);

  const compute = useCallback(async () => {
    if (!ftpValid) return;

    const now = new Date();
    const since = subDays(now, RANGE_DAYS[range]);
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

    const entry: CachedZones = { data: result, activityCount: eligible.length };
    setZones((prev) => ({ ...prev, [range]: entry }));
    saveCache(range, result, eligible.length);
    setLoading(false);
  }, [activities, range, ftpValid, ftpVal]);

  const eligibleCount = useMemo(() => {
    const since = subDays(new Date(), RANGE_DAYS[range]);
    return activities.filter((a) => a.average_watts && isAfter(parseISO(a.start_date_local), since)).length;
  }, [activities, range]);

  useEffect(() => {
    const needsCompute = !cached || cached.activityCount !== eligibleCount;
    if (needsCompute && !computingRef.current && ftpValid && eligibleCount > 0) {
      const id = setTimeout(() => {
        computingRef.current = true;
        compute().finally(() => { computingRef.current = false; });
      }, 0);
      return () => clearTimeout(id);
    }
  }, [range, cached, eligibleCount, ftpValid, compute]);

  const totalSeconds = data?.reduce((s, z) => s + z.seconds, 0) ?? 0;

  return (
    <CollapsibleSection title="Time in Power Zones">
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

      {!data && !loading && !error && !ftpValid && (
        <div className="power-curve-empty">
          Set your <strong>FTP</strong> in <button className="link-btn" onClick={() => onNavigate("settings")}>Settings</button> to compute power zones.
        </div>
      )}

      {loading && <StreamProgress done={progress.done} total={progress.total} />}

      {data && !loading && (
        <>
          <div className="zone-summary">
            Total power time: <strong>{formatTime(totalSeconds)}</strong>
            <span className={styles.ftpBadge}>FTP {ftpVal} W</span>
          </div>
          <ZoneBarChart
            data={data}
            dataKey="seconds"
            tickFormatter={(v) => formatTime(v as number)}
            tooltipLabelFormatter={(label) => {
              const zone = POWER_ZONES.find((z) => z.label === label);
              return zone ? `${zone.label} · ${zone.name}` : String(label);
            }}
            tooltipFormatter={(value) => [formatTime(Number(value)), "Time"]}
          />
          <TrainingDistribution data={data} />
        </>
      )}
    </CollapsibleSection>
  );
}
