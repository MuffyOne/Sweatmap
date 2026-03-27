import { useState, useEffect } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fetchActivityStreams, type Activity, type ActivityStreams } from "../api/strava";
import { TOOLTIP_STYLE } from "../lib/utils";

function formatStreamTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}`;
  return `${m}m`;
}

/** Downsample an array to ~maxPoints for chart performance */
function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = arr.length / maxPoints;
  const result: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

interface Props {
  activity: Activity;
}

interface ChartPoint {
  time: number;
  altitude?: number;
  heartrate?: number;
  watts?: number;
  cadence?: number;
  speed?: number;
}

const STREAM_CACHE_PREFIX = "activity_streams_";

function getCachedStreams(id: number): ActivityStreams | null {
  const raw = localStorage.getItem(STREAM_CACHE_PREFIX + id);
  if (!raw) return null;
  return JSON.parse(raw) as ActivityStreams;
}

function cacheStreams(id: number, streams: ActivityStreams) {
  try {
    localStorage.setItem(STREAM_CACHE_PREFIX + id, JSON.stringify(streams));
  } catch {
    // localStorage full — silently skip caching
  }
}

export function ActivityDetail({ activity }: Props) {
  const [streams, setStreams] = useState<ActivityStreams | null>(() => getCachedStreams(activity.id));
  const [loading, setLoading] = useState(!getCachedStreams(activity.id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (streams) return; // already cached
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchActivityStreams(activity.id)
      .then((s) => {
        if (!cancelled && s) {
          cacheStreams(activity.id, s);
          setStreams(s);
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activity.id, streams]);

  if (loading) {
    return <div className="activity-detail-loading">Loading streams...</div>;
  }

  if (error) {
    return <div className="activity-detail-error">{error === "rate_limited" ? "Rate limited — try again later" : error}</div>;
  }

  if (!streams) {
    return <div className="activity-detail-empty">No stream data available for this activity.</div>;
  }

  const timeArr = streams.time ?? Array.from({ length: streams.altitude?.length ?? 0 }, (_, i) => i);
  if (timeArr.length === 0) {
    return <div className="activity-detail-empty">No stream data available.</div>;
  }

  const raw: ChartPoint[] = timeArr.map((t, i) => ({
    time: t,
    altitude: streams.altitude?.[i],
    heartrate: streams.heartrate?.[i],
    watts: streams.watts?.[i],
    cadence: streams.cadence?.[i],
    speed: streams.velocity_smooth?.[i] != null ? Math.round(streams.velocity_smooth[i] * 3.6 * 10) / 10 : undefined,
  }));

  const data = downsample(raw, 400);

  const hasAlt = streams.altitude && streams.altitude.length > 0;
  const hasHR = streams.heartrate && streams.heartrate.length > 0;
  const hasWatts = streams.watts && streams.watts.length > 0;
  const hasCadence = streams.cadence && streams.cadence.length > 0;
  const hasSpeed = streams.velocity_smooth && streams.velocity_smooth.length > 0;

  return (
    <div className="activity-detail">
      {hasAlt && (
        <div className="activity-detail-chart">
          <div className="activity-detail-chart-label">Elevation</div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" />
              <XAxis dataKey="time" tickFormatter={formatStreamTime} tick={{ fill: "var(--tick-color)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--tick-color)", fontSize: 10 }} width={40} axisLine={false} tickLine={false} unit="m" domain={["dataMin - 10", "dataMax + 10"]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => formatStreamTime(v as number)} formatter={(v: number) => [`${Math.round(v)} m`, "Elevation"]} />
              <Area type="monotone" dataKey="altitude" stroke="#22a06b" fill="#22a06b" fillOpacity={0.15} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {(hasHR || hasWatts) && (
        <div className="activity-detail-chart">
          <div className="activity-detail-chart-label">
            {hasHR && hasWatts ? "Heart Rate & Power" : hasHR ? "Heart Rate" : "Power"}
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" />
              <XAxis dataKey="time" tickFormatter={formatStreamTime} tick={{ fill: "var(--tick-color)", fontSize: 10 }} axisLine={false} tickLine={false} />
              {hasHR && <YAxis yAxisId="hr" tick={{ fill: "var(--tick-color)", fontSize: 10 }} width={35} axisLine={false} tickLine={false} domain={["dataMin - 5", "dataMax + 5"]} />}
              {hasWatts && <YAxis yAxisId="watts" orientation="right" tick={{ fill: "var(--tick-color)", fontSize: 10 }} width={35} axisLine={false} tickLine={false} />}
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => formatStreamTime(v as number)} />
              {hasHR && <Line yAxisId="hr" type="monotone" dataKey="heartrate" stroke="#e03535" strokeWidth={1.2} dot={false} name="HR (bpm)" isAnimationActive={false} />}
              {hasWatts && <Line yAxisId={hasHR ? "watts" : "hr"} type="monotone" dataKey="watts" stroke="#3b8fd4" strokeWidth={1.2} dot={false} name="Power (W)" isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {(hasSpeed || hasCadence) && (
        <div className="activity-detail-chart">
          <div className="activity-detail-chart-label">
            {hasSpeed && hasCadence ? "Speed & Cadence" : hasSpeed ? "Speed" : "Cadence"}
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" />
              <XAxis dataKey="time" tickFormatter={formatStreamTime} tick={{ fill: "var(--tick-color)", fontSize: 10 }} axisLine={false} tickLine={false} />
              {hasSpeed && <YAxis yAxisId="speed" tick={{ fill: "var(--tick-color)", fontSize: 10 }} width={35} axisLine={false} tickLine={false} />}
              {hasCadence && <YAxis yAxisId="cadence" orientation="right" tick={{ fill: "var(--tick-color)", fontSize: 10 }} width={35} axisLine={false} tickLine={false} />}
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => formatStreamTime(v as number)} />
              {hasSpeed && <Line yAxisId="speed" type="monotone" dataKey="speed" stroke="#3b8fd4" strokeWidth={1.2} dot={false} name="Speed (km/h)" isAnimationActive={false} />}
              {hasCadence && <Line yAxisId={hasSpeed ? "cadence" : "speed"} type="monotone" dataKey="cadence" stroke="#9b7ec8" strokeWidth={1.2} dot={false} name="Cadence (rpm)" isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
