import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { subDays, subYears } from "date-fns";
import type { Activity } from "../api/strava";
import { getAllTimeCache, fetchAndCacheAllTime } from "../api/strava";
import { PeriodToggle } from "../components/PeriodToggle";
import styles from "./MapPage.module.css";

type TimeRange = "30d" | "90d" | "1y" | "all";
type SportFilter = "all" | "rides" | "runs" | "hikes";
type RenderMode = "heatmap" | "routes";

const RENDER_MODES: RenderMode[] = ["heatmap", "routes"];
const RENDER_LABEL: Record<RenderMode, string> = {
  heatmap: "Heatmap",
  routes: "Routes",
};

const RANGES: TimeRange[] = ["30d", "90d", "1y", "all"];
const SPORTS: SportFilter[] = ["all", "rides", "runs", "hikes"];

const RANGE_LABEL: Record<TimeRange, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
  all: "All time",
};
const SPORT_LABEL: Record<SportFilter, string> = {
  all: "All",
  rides: "Rides",
  runs: "Runs",
  hikes: "Hikes",
};

function decodePolyline(encoded: string): [number, number][] {
  if (!encoded) return [];
  const coords: [number, number][] = [];
  let idx = 0,
    lat = 0,
    lng = 0;
  while (idx < encoded.length) {
    let b,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(idx++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(idx++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

interface Route {
  id: number;
  positions: [number, number][];
  isRide: boolean;
}

function FitBounds({ routes }: { routes: Route[] }) {
  const map = useMap();
  useEffect(() => {
    const allCoords = routes.flatMap((r) => r.positions);
    if (allCoords.length < 2) return;
    map.fitBounds(L.latLngBounds(allCoords), { padding: [32, 32], maxZoom: 14 });
  }, [map, routes]);
  return null;
}

interface Props {
  activities: Activity[];
}

export function MapPage({ activities }: Props) {
  const [range, setRange] = useState<TimeRange>("90d");
  const [sport, setSport] = useState<SportFilter>("all");
  const [renderMode, setRenderMode] = useState<RenderMode>("heatmap");
  const [isDark, setIsDark] = useState(() => !document.body.classList.contains("light"));
  // Stable "now" captured once at mount — avoids calling Date.now() during render.
  const [today] = useState<number>(Date.now);

  // All-time state
  const [allTimeActivities, setAllTimeActivities] = useState<Activity[] | null>(
    () => getAllTimeCache()?.activities ?? null
  );
  const [allTimeFetching, setAllTimeFetching] = useState(false);
  const [allTimeFetched, setAllTimeFetched] = useState(0);
  const [allTimeError, setAllTimeError] = useState<string | null>(null);

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
    setAllTimeFetched(0);
    try {
      const all = await fetchAndCacheAllTime((n) => setAllTimeFetched(n));
      setAllTimeActivities(all);
    } catch {
      setAllTimeError("Failed to fetch activity history. Please try again.");
    } finally {
      setAllTimeFetching(false);
    }
  }

  const routes = useMemo<Route[]>(() => {
    const source = range === "all" && allTimeActivities ? allTimeActivities : activities;
    const cutoff =
      range === "30d"
        ? subDays(today, 30).getTime()
        : range === "90d"
          ? subDays(today, 90).getTime()
          : range === "1y"
            ? subYears(today, 1).getTime()
            : 0;

    return source
      .filter((a) => {
        if (new Date(a.start_date).getTime() < cutoff) return false;
        if (!a.map?.summary_polyline) return false;
        if (a.sport_type === "VirtualRide" || a.type === "VirtualRide") return false;
        if (sport === "rides" && a.type !== "Ride") return false;
        if (sport === "runs" && a.type !== "Run") return false;
        if (sport === "hikes" && a.type !== "Hike") return false;
        return true;
      })
      .map((a) => ({
        id: a.id,
        positions: decodePolyline(a.map!.summary_polyline),
        isRide: a.type === "Ride",
      }))
      .filter((r) => r.positions.length > 1);
  }, [activities, allTimeActivities, range, sport, today]);

  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  const attribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  const pathOptions = (isRide: boolean) =>
    renderMode === "heatmap"
      ? { color: isRide ? "#fc4c02" : "#4c9eff", weight: 3, opacity: 0.2 }
      : { color: isRide ? "#fc4c02" : "#4c9eff", weight: 1.5, opacity: 0.7 };

  const needsAllTimeFetch = range === "all" && !allTimeActivities && !allTimeFetching;

  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <PeriodToggle
          options={RANGES}
          selected={range}
          onSelect={setRange}
          renderLabel={(r) => RANGE_LABEL[r]}
          inline
        />
        <span className={styles.divider} />
        <PeriodToggle
          options={SPORTS}
          selected={sport}
          onSelect={setSport}
          renderLabel={(s) => SPORT_LABEL[s]}
          inline
        />
        <span className={styles.divider} />
        <PeriodToggle
          options={RENDER_MODES}
          selected={renderMode}
          onSelect={setRenderMode}
          renderLabel={(m) => RENDER_LABEL[m]}
          inline
        />
      </div>
      {!needsAllTimeFetch && !allTimeFetching && (
        <div className={styles.meta}>
          {routes.length} activit{routes.length === 1 ? "y" : "ies"} with GPS
        </div>
      )}
      <div className={styles.mapWrap}>
        {needsAllTimeFetch ? (
          <div className={styles.prompt}>
            <div className={styles.promptTitle}>Load your complete history?</div>
            <p className={styles.promptBody}>
              This fetches every activity from your Strava account — not just the last year.
              It's a one-time download (cached for 30 days) and may take a minute if you have
              many activities. Requests are throttled to stay within Strava's rate limits.
            </p>
            <div className={styles.promptActions}>
              <button className={styles.btnPrimary} onClick={handleFetchAllTime}>
                Fetch all activities
              </button>
              <button className={styles.btnSecondary} onClick={() => setRange("1y")}>
                Use last year instead
              </button>
            </div>
          </div>
        ) : allTimeFetching ? (
          <div className={styles.fetchingStatus}>
            <div>Fetching your activity history…</div>
            <div className={styles.fetchCount}>{allTimeFetched} activities downloaded</div>
            <div className="loading-bar-track" style={{ width: 220 }}>
              <div className="loading-bar-fill" />
            </div>
          </div>
        ) : allTimeError ? (
          <div className={styles.fetchingStatus}>
            <div className={styles.errorText}>{allTimeError}</div>
            <button className={styles.btnPrimary} onClick={handleFetchAllTime}>
              Retry
            </button>
          </div>
        ) : routes.length === 0 ? (
          <div className={styles.empty}>No activities with GPS data for this filter.</div>
        ) : (
          <MapContainer center={[48.8566, 2.3522]} zoom={11} className={styles.map} scrollWheelZoom>
            <TileLayer url={tileUrl} attribution={attribution} />
            <FitBounds routes={routes} />
            {routes.map((r) => (
              <Polyline
                key={r.id}
                positions={r.positions}
                pathOptions={pathOptions(r.isRide)}
              />
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
