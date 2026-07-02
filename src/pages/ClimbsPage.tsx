import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { Activity, CustomClimb } from "../api/strava";
import { PRESET_CLIMBS } from "../lib/presetClimbs";
import { decodePolyline, haversineMeters } from "../lib/polyline";
import { formatTime } from "../lib/utils";
import { CollapsibleSection } from "../lib/CollapsibleSection";
import type { Page } from "../Dashboard";
import styles from "./ClimbsPage.module.css";

export const CUSTOM_CLIMBS_KEY = "custom_climbs";

const MATCH_RADIUS_M = 450;

interface Props {
  activities: Activity[];
  onNavigate: (page: Page) => void;
}

interface ClimbConfig {
  name: string;
  country: string | null;
  region?: string;
  start: [number, number];
  end: [number, number];
  segmentId?: number;
  length_km?: number;
  elevation_m?: number;
  avg_gradient?: number;
}

function loadCustomClimbs(): CustomClimb[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_CLIMBS_KEY) ?? "[]"); }
  catch { return []; }
}

function routeMatchesClimb(
  points: [number, number][],
  start: [number, number],
  end: [number, number],
  radius: number
): boolean {
  let hitStart = false;
  let hitEnd = false;
  for (const [lat, lng] of points) {
    if (!hitStart && haversineMeters(lat, lng, start[0], start[1]) < radius) hitStart = true;
    if (!hitEnd && haversineMeters(lat, lng, end[0], end[1]) < radius) hitEnd = true;
    if (hitStart && hitEnd) return true;
  }
  return false;
}

export function ClimbsPage({ activities, onNavigate }: Props) {
  const customClimbs = useMemo<CustomClimb[]>(loadCustomClimbs, []);

  const allClimbs = useMemo<ClimbConfig[]>(() => {
    const presetSegIds = new Set(PRESET_CLIMBS.map((p) => p.segmentId).filter(Boolean));
    const custom: ClimbConfig[] = customClimbs
      .filter((c) => !presetSegIds.has(c.segmentId))
      .map((c) => ({
        name: c.name,
        country: c.country,
        start: c.start,
        end: c.end,
        segmentId: c.segmentId,
        length_km: c.length_km,
        elevation_m: c.elevation_m,
        avg_gradient: c.avg_gradient,
      }));
    return [...(PRESET_CLIMBS as ClimbConfig[]), ...custom];
  }, [customClimbs]);

  const decodedRoutes = useMemo(
    () =>
      activities
        .filter((a) => a.map?.summary_polyline)
        .map((a) => ({
          activity: a,
          points: decodePolyline(a.map!.summary_polyline),
        })),
    [activities]
  );

  const matchedClimbs = useMemo(() => {
    return allClimbs
      .map((climb) => {
        const matches = decodedRoutes
          .filter(({ points }) =>
            routeMatchesClimb(points, climb.start, climb.end, MATCH_RADIUS_M)
          )
          .map(({ activity }) => activity)
          .sort(
            (a, b) =>
              new Date(b.start_date_local).getTime() -
              new Date(a.start_date_local).getTime()
          );
        return { climb, matches };
      })
      .filter(({ matches }) => matches.length > 0);
  }, [allClimbs, decodedRoutes]);

  if (matchedClimbs.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>No famous climbs detected yet</div>
        <p className={styles.emptyBody}>
          The app scans your GPS routes for {allClimbs.length} famous climbs automatically. Add a custom climb via{" "}
          <button className="link-btn" onClick={() => onNavigate("settings")}>Settings → My Climbs</button>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className={styles.hint}>
        Detected from your GPS routes · {matchedClimbs.length} climb{matchedClimbs.length !== 1 ? "s" : ""} found ·{" "}
        <button className="link-btn" onClick={() => onNavigate("settings")}>Add a custom climb</button>
      </p>

      {matchedClimbs.map(({ climb, matches }, i) => {
        const last = matches[0];
        const bestPower = matches.reduce<number | null>((best, a) => {
          if (!a.average_watts) return best;
          return best === null || a.average_watts > best ? a.average_watts : best;
        }, null);

        const locationLabel = [climb.region, climb.country].filter(Boolean).join(" · ");
        const extra = (
          <span className={styles.climbExtra}>
            {locationLabel && <span className={styles.location}>{locationLabel}</span>}
            <span>{matches.length} ascent{matches.length !== 1 ? "s" : ""}</span>
            <span className={styles.dot}>·</span>
            <span>last {format(parseISO(last.start_date_local), "d MMM yyyy")}</span>
          </span>
        );

        return (
          <CollapsibleSection
            key={climb.name}
            title={climb.name}
            extra={extra}
            defaultOpen={i < 3}
          >
            {(climb.length_km || climb.elevation_m || climb.avg_gradient || bestPower) && (
              <div className={styles.meta}>
                {climb.length_km && <span>{climb.length_km} km</span>}
                {climb.elevation_m && <><span className={styles.dot}>·</span><span>{climb.elevation_m.toLocaleString()} m gain</span></>}
                {climb.avg_gradient && <><span className={styles.dot}>·</span><span>{climb.avg_gradient}% avg</span></>}
                {bestPower && <><span className={styles.dot}>·</span><span>best power {Math.round(bestPower)} W</span></>}
              </div>
            )}

            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <span>Activity</span>
                <span>Date</span>
                <span>Duration</span>
                <span>Avg Power</span>
                <span>Avg HR</span>
                <span></span>
              </div>
              {matches.map((a) => (
                <a
                  key={a.id}
                  className={styles.tableRow}
                  href={`https://www.strava.com/activities/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className={styles.activityName}>{a.name}</span>
                  <span className={styles.muted}>{format(parseISO(a.start_date_local), "d MMM yyyy")}</span>
                  <span className={styles.muted}>{formatTime(a.moving_time)}</span>
                  <span className={styles.muted}>{a.average_watts ? `${Math.round(a.average_watts)} W` : "—"}</span>
                  <span className={styles.muted}>{a.average_heartrate ? `${Math.round(a.average_heartrate)} bpm` : "—"}</span>
                  <span className={styles.stravaArrow}>↗</span>
                </a>
              ))}
            </div>
          </CollapsibleSection>
        );
      })}
    </div>
  );
}
