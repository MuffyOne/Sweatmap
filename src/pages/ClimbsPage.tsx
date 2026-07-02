import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fetchSegmentEfforts, type ClimbEffort, type CustomClimb } from "../api/strava";
import { PRESET_CLIMBS } from "../lib/presetClimbs";
import { formatTime } from "../lib/utils";
import type { Page } from "../Dashboard";
import styles from "./ClimbsPage.module.css";

export const CUSTOM_CLIMBS_KEY = "custom_climbs";


interface ClimbConfig {
  segmentId: number;
  name: string;
  country: string | null;
  region?: string;
  length_km?: number;
  elevation_m?: number;
  avg_gradient?: number;
  isCustom: boolean;
}

type EffortState =
  | { status: "loading" }
  | { status: "done"; efforts: ClimbEffort[] }
  | { status: "error" };

function loadCustomClimbs(): CustomClimb[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_CLIMBS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

interface Props {
  onNavigate: (page: Page) => void;
}

export function ClimbsPage({ onNavigate }: Props) {
  const [effortMap, setEffortMap] = useState<Map<number, EffortState>>(new Map());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [customClimbs, setCustomClimbs] = useState<CustomClimb[]>(loadCustomClimbs);

  const allClimbs = useMemo<ClimbConfig[]>(() => {
    const presets: ClimbConfig[] = PRESET_CLIMBS.map((c) => ({ ...c, isCustom: false }));
    const custom: ClimbConfig[] = customClimbs.map((c) => ({
      segmentId: c.segmentId,
      name: c.name,
      country: c.country,
      length_km: c.length_km,
      elevation_m: c.elevation_m,
      avg_gradient: c.avg_gradient,
      isCustom: true,
    }));
    const presetIds = new Set(presets.map((p) => p.segmentId));
    return [...presets, ...custom.filter((c) => !presetIds.has(c.segmentId))];
  }, [customClimbs]);

  const climbKey = allClimbs.map((c) => c.segmentId).join(",");

  useEffect(() => {
    for (const climb of allClimbs) {
      const id = climb.segmentId;
      setEffortMap((prev) => {
        if (prev.has(id)) return prev;
        const next = new Map(prev);
        next.set(id, { status: "loading" });
        return next;
      });
      fetchSegmentEfforts(id)
        .then((efforts) =>
          setEffortMap((prev) => new Map(prev).set(id, { status: "done", efforts }))
        )
        .catch(() =>
          setEffortMap((prev) => new Map(prev).set(id, { status: "error" }))
        );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [climbKey]);

  // Listen for custom climb changes from the Settings page
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === CUSTOM_CLIMBS_KEY) setCustomClimbs(loadCustomClimbs());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function toggleExpanded(segmentId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(segmentId)) next.delete(segmentId);
      else next.add(segmentId);
      return next;
    });
  }

  return (
    <div>
      <p className={styles.hint}>
        Segment IDs for famous climbs are approximate — if a climb shows 0 ascents and you have ridden it, add the exact Strava segment in{" "}
        <span className={styles.hintLink} onClick={() => onNavigate("settings")}>Settings → My Climbs</span>.
      </p>

      <div className={styles.grid}>
        {allClimbs.map((climb) => {
          const state = effortMap.get(climb.segmentId);
          const efforts = state?.status === "done" ? state.efforts : [];
          const loading = !state || state.status === "loading";
          const isExpanded = expanded.has(climb.segmentId);

          // Prefer preset metadata; fall back to live segment data from first effort
          const seg = efforts[0]?.segment;
          const displayLength = climb.length_km ?? (seg ? Math.round((seg.distance / 1000) * 10) / 10 : null);
          const displayElevation = climb.elevation_m ?? (seg ? Math.round(seg.elevation_high - seg.elevation_low) : null);
          const displayGradient = climb.avg_gradient ?? seg?.average_grade ?? null;

          const bestTime = efforts.length
            ? Math.min(...efforts.map((e) => e.elapsed_time))
            : null;
          const bestPower = efforts.reduce<number | null>((best, e) => {
            if (!e.average_watts || !e.device_watts) return best;
            return best === null || e.average_watts > best ? e.average_watts : best;
          }, null);
          const bestHR = efforts.reduce<number | null>((best, e) => {
            if (!e.average_heartrate) return best;
            return best === null || e.average_heartrate > best ? e.average_heartrate : best;
          }, null);
          const lastEffort = efforts[0];

          return (
            <div key={climb.segmentId} className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.climbName}>{climb.name}</div>
                <div className={styles.chips}>
                  {climb.region && <span className={styles.chip}>{climb.region}</span>}
                  {climb.country && <span className={styles.chip}>{climb.country}</span>}
                </div>
              </div>

              <div className={styles.meta}>
                {displayLength !== null ? <><span>{displayLength} km</span><span className={styles.metaDot}>·</span></> : null}
                {displayElevation !== null ? <><span>{displayElevation.toLocaleString()} m</span><span className={styles.metaDot}>·</span></> : null}
                {displayGradient !== null ? <span>{displayGradient}%</span> : null}
                {loading && !displayLength && <span className={styles.metaPlaceholder}>Loading…</span>}
              </div>

              <div className={styles.statsRow}>
                {loading ? (
                  <div className={styles.skeleton} />
                ) : efforts.length === 0 ? (
                  <div className={styles.noEfforts}>No ascents recorded</div>
                ) : (
                  <>
                    <div className={styles.statItem}>
                      <div className={styles.statValue}>{efforts.length}</div>
                      <div className={styles.statLabel}>ascents</div>
                    </div>
                    {bestTime !== null && (
                      <div className={styles.statItem}>
                        <div className={styles.statValue}>{formatTime(bestTime)}</div>
                        <div className={styles.statLabel}>best time</div>
                      </div>
                    )}
                    {bestPower !== null && (
                      <div className={styles.statItem}>
                        <div className={styles.statValue}>{Math.round(bestPower)}<span className={styles.statUnit}>W</span></div>
                        <div className={styles.statLabel}>best power</div>
                      </div>
                    )}
                    {bestHR !== null && (
                      <div className={styles.statItem}>
                        <div className={styles.statValue}>{Math.round(bestHR)}<span className={styles.statUnit}>bpm</span></div>
                        <div className={styles.statLabel}>best HR</div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {!loading && lastEffort && (
                <div className={styles.lastEffort}>
                  Last: {format(parseISO(lastEffort.start_date_local), "d MMM yyyy")}
                </div>
              )}

              {!loading && efforts.length > 0 && (
                <button
                  className={styles.expandBtn}
                  onClick={() => toggleExpanded(climb.segmentId)}
                >
                  {isExpanded ? "Hide attempts ▴" : `Show ${efforts.length} attempt${efforts.length !== 1 ? "s" : ""} ▾`}
                </button>
              )}

              {isExpanded && (
                <div className={styles.effortTable}>
                  <div className={styles.effortHeader}>
                    <span>Date</span>
                    <span>Time</span>
                    <span>Power</span>
                    <span>HR</span>
                    <span>Rank</span>
                    <span></span>
                  </div>
                  {efforts.map((e) => (
                    <div key={e.id} className={styles.effortRow}>
                      <span className={styles.effortDate}>
                        {format(parseISO(e.start_date_local), "d MMM yyyy")}
                      </span>
                      <span className={styles.effortTime}>{formatTime(e.elapsed_time)}</span>
                      <span className={styles.effortMuted}>
                        {e.average_watts && e.device_watts
                          ? `${Math.round(e.average_watts)} W`
                          : "—"}
                      </span>
                      <span className={styles.effortMuted}>
                        {e.average_heartrate ? `${Math.round(e.average_heartrate)} bpm` : "—"}
                      </span>
                      <span className={styles.effortMuted}>
                        {e.pr_rank === 1 ? "🥇" : e.pr_rank === 2 ? "🥈" : e.pr_rank === 3 ? "🥉" : e.pr_rank ? `#${e.pr_rank}` : "—"}
                      </span>
                      <span>
                        <a
                          href={`https://www.strava.com/activities/${e.activity.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.stravaLink}
                        >
                          ↗
                        </a>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
