import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Activity } from "../api/strava";
import {
  loadAllTimeCache,
  isAllTimeCacheFresh,
  fetchAndCacheAllTime,
} from "../api/strava";
import { PeriodToggle } from "../components/PeriodToggle";
import styles from "./MapPage.module.css";

type TimeRange = "30d" | "90d" | "1y" | "all";
type SportFilter = "all" | "rides" | "runs" | "hikes";
type RenderMode = "heatmap" | "routes";

function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

function FitBounds({ routes }: { routes: [number, number][][] }) {
  const map = useMap();
  useEffect(() => {
    if (routes.length === 0) return;
    const all = routes.flat();
    if (all.length === 0) return;
    const lats = all.map((c) => c[0]);
    const lngs = all.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [20, 20] }
    );
  }, [routes, map]);
  return null;
}

interface Props {
  activities: Activity[];
}

const RANGE_OPTIONS = ["30d", "90d", "1y", "all"] as const satisfies readonly TimeRange[];
const RANGE_LABELS: Record<TimeRange, string> = { "30d": "30d", "90d": "90d", "1y": "1y", all: "All time" };

const SPORT_OPTIONS = ["all", "rides", "runs", "hikes"] as const satisfies readonly SportFilter[];
const SPORT_LABELS: Record<SportFilter, string> = { all: "All", rides: "Rides", runs: "Runs", hikes: "Hikes" };

const MODE_OPTIONS = ["heatmap", "routes"] as const satisfies readonly RenderMode[];
const MODE_LABELS: Record<RenderMode, string> = { heatmap: "Heatmap", routes: "Routes" };

export function MapPage({ activities }: Props) {
  const [range, setRange] = useState<TimeRange>("1y");
  const [sport, setSport] = useState<SportFilter>("all");
  const [renderMode, setRenderMode] = useState<RenderMode>("heatmap");
  const [isDark, setIsDark] = useState(() => !document.body.classList.contains("light"));
  const [today] = useState<number>(Date.now);

  // All-time data state
  const [allTimeActivities, setAllTimeActivities] = useState<Activity[] | null>(null);
  const [allTimeFetching, setAllTimeFetching] = useState(false);
  const [allTimeFetchCount, setAllTimeFetchCount] = useState(0);
  const [allTimeFetched, setAllTimeFetched] = useState(false);
  const [allTimeError, setAllTimeError] = useState<string | null>(null);
  const [allTimeDeclined, setAllTimeDeclined] = useState(false);

  useEffect(() => {
    loadAllTimeCache().then((c) => {
      if (c && isAllTimeCacheFresh(c)) {
        setAllTimeActivities(c.activities);
        setAllTimeFetched(true);
      }
    });
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(!document.body.classList.contains("light"));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  async function handleFetchAllTime() {
    setAllTimeFetching(true);
    setAllTimeError(null);
    setAllTimeFetchCount(0);
    try {
      const acts = await fetchAndCacheAllTime((count) => setAllTimeFetchCount(count));
      setAllTimeActivities(acts);
      setAllTimeFetched(true);
    } catch (e) {
      setAllTimeError(String(e));
    } finally {
      setAllTimeFetching(false);
    }
  }

  const cutoffMs = useMemo(() => {
    if (range === "all") return 0;
    const days = range === "30d" ? 30 : range === "90d" ? 90 : 365;
    return today - days * 24 * 60 * 60 * 1000;
  }, [range, today]);

  const routes = useMemo(() => {
    const source = range === "all" ? (allTimeActivities ?? activities) : activities;
    return source
      .filter((a) => {
        if (a.sport_type === "VirtualRide" || a.type === "VirtualRide") return false;
        if (range !== "all" && new Date(a.start_date).getTime() < cutoffMs) return false;
        if (sport === "rides") return a.type === "Ride" || a.sport_type === "Ride" || a.sport_type === "GravelRide" || a.sport_type === "MountainBikeRide";
        if (sport === "runs") return a.type === "Run" || a.sport_type === "Run" || a.sport_type === "TrailRun";
        if (sport === "hikes") return a.sport_type === "Hike" || a.type === "Hike";
        return true;
      })
      .map((a) => (a.map?.summary_polyline ? decodePolyline(a.map.summary_polyline) : []))
      .filter((r) => r.length > 0);
  }, [activities, allTimeActivities, range, sport, cutoffMs]);

  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  const pathOptions = useMemo(
    () =>
      renderMode === "heatmap"
        ? { color: "#fc4c02", weight: 3, opacity: 0.2 }
        : { color: "#fc4c02", weight: 1.5, opacity: 1 },
    [renderMode]
  );

  const showAllTimePrompt = range === "all" && !allTimeFetched && !allTimeDeclined && !allTimeFetching;

  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <PeriodToggle
          options={RANGE_OPTIONS}
          selected={range}
          onSelect={setRange}
          renderLabel={(v) => RANGE_LABELS[v]}
          inline
        />
        <span className={styles.divider} />
        <PeriodToggle
          options={SPORT_OPTIONS}
          selected={sport}
          onSelect={setSport}
          renderLabel={(v) => SPORT_LABELS[v]}
          inline
        />
        <span className={styles.divider} />
        <PeriodToggle
          options={MODE_OPTIONS}
          selected={renderMode}
          onSelect={setRenderMode}
          renderLabel={(v) => MODE_LABELS[v]}
          inline
        />
      </div>

      <div className={styles.mapWrap}>
        {showAllTimePrompt ? (
          <div className={styles.prompt}>
            <div className={styles.promptTitle}>Load all-time activities?</div>
            <div className={styles.promptBody}>
              This will fetch your entire Strava history. It may take a minute and uses
              throttled requests to stay within rate limits. The result is cached for 30 days.
            </div>
            <div className={styles.promptActions}>
              <button className={styles.btnPrimary} onClick={handleFetchAllTime}>
                Fetch all activities
              </button>
              <button className={styles.btnSecondary} onClick={() => setAllTimeDeclined(true)}>
                Use cached year
              </button>
            </div>
          </div>
        ) : allTimeFetching ? (
          <div className={styles.fetchingStatus}>
            <div className={styles.fetchCount}>{allTimeFetchCount}</div>
            <div>activities fetched…</div>
          </div>
        ) : allTimeError ? (
          <div className={styles.errorText}>Failed to fetch: {allTimeError}</div>
        ) : routes.length === 0 ? (
          <div className={styles.empty}>No activities with GPS data for this filter.</div>
        ) : (
          <MapContainer
            center={[20, 0]}
            zoom={2}
            className={styles.map}
            zoomControl={true}
            attributionControl={false}
          >
            <TileLayer url={tileUrl} />
            <FitBounds routes={routes} />
            {routes.map((positions, i) => (
              <Polyline key={i} positions={positions} pathOptions={pathOptions} />
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
