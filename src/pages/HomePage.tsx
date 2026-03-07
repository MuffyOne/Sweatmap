import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  isWithinInterval, format, subWeeks, subMonths, subDays, parseISO,
} from "date-fns";
import type { Activity } from "../api/strava";
import type { Page } from "../Dashboard";
import { formatDuration, formatDistance, TOOLTIP_STYLE } from "../lib/utils";

type Period = "week" | "month" | "year" | "last7" | "last30";

const ALL_STATS = [
  { id: "count",        label: "Activities"     },
  { id: "distance",     label: "Distance"       },
  { id: "time",         label: "Moving Time"    },
  { id: "elevation",    label: "Elevation"      },
  { id: "heartrate",    label: "Avg Heart Rate" },
  { id: "watts",        label: "Avg Power"      },
  { id: "prcount",      label: "PRs"            },
  { id: "achievements", label: "Achievements"   },
] as const;

type StatId = typeof ALL_STATS[number]["id"];
const DEFAULT_STATS = new Set<StatId>(["count", "distance", "time", "heartrate", "watts"]);

function normalizeSportGroup(raw: string): string {
  if (raw === "VirtualRide") return "Virtual Rides";
  if (raw === "Ride" || raw === "EBikeRide" || raw === "GravelRide" || raw === "MountainBikeRide")
    return "Rides";
  return raw;
}

function getInterval(period: Period): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case "week":  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month": return { start: startOfMonth(now), end: endOfMonth(now) };
    case "year":  return { start: startOfYear(now), end: endOfYear(now) };
    case "last7": return { start: subDays(now, 7), end: now };
    case "last30":return { start: subDays(now, 30), end: now };
  }
}

interface Props {
  activities: Activity[];
  onNavigate: (page: Page) => void;
}

export function HomePage({ activities, onNavigate }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const [enabledStats, setEnabledStats] = useState<Set<StatId>>(DEFAULT_STATS);
  const [statsMenuOpen, setStatsMenuOpen] = useState(false);

  function toggleStat(id: StatId) {
    setEnabledStats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const { start, end } = getInterval(period);
    return activities.filter((a) => isWithinInterval(parseISO(a.start_date_local), { start, end }));
  }, [activities, period]);

  const stats = useMemo(() => {
    const withHR = filtered.filter((a) => a.average_heartrate);
    const withWatts = filtered.filter((a) => a.average_watts);
    return {
      count: filtered.length,
      totalDistance: filtered.reduce((s, a) => s + a.distance, 0),
      totalTime: filtered.reduce((s, a) => s + a.moving_time, 0),
      totalElevation: filtered.reduce((s, a) => s + a.total_elevation_gain, 0),
      avgHeartrate: withHR.length > 0
        ? withHR.reduce((s, a) => s + (a.average_heartrate ?? 0), 0) / withHR.length
        : null,
      avgWatts: withWatts.length > 0
        ? withWatts.reduce((s, a) => s + (a.average_watts ?? 0), 0) / withWatts.length
        : null,
      totalPRs: filtered.reduce((s, a) => s + (a.pr_count ?? 0), 0),
      totalAchievements: filtered.reduce((s, a) => s + (a.achievement_count ?? 0), 0),
    };
  }, [filtered]);

  const sportBreakdown = useMemo(() => {
    const map = new Map<string, { distance: number; time: number; count: number; elevation: number }>();
    for (const a of filtered) {
      const type = normalizeSportGroup(a.sport_type || a.type);
      const cur = map.get(type) ?? { distance: 0, time: 0, count: 0, elevation: 0 };
      cur.distance += a.distance;
      cur.time += a.moving_time;
      cur.count += 1;
      cur.elevation += a.total_elevation_gain;
      map.set(type, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].distance - a[1].distance)
      .map(([name, data]) => ({ name, ...data }));
  }, [filtered]);

  const weeklyChart = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const weekStart = startOfWeek(subWeeks(now, 11 - i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(subWeeks(now, 11 - i), { weekStartsOn: 1 });
      const acts = activities.filter((a) =>
        isWithinInterval(parseISO(a.start_date_local), { start: weekStart, end: weekEnd })
      );
      return {
        label: format(weekStart, "MMM d"),
        distance: Number((acts.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(1)),
        time: Number((acts.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)),
      };
    });
  }, [activities]);

  const monthlyChart = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const monthStart = startOfMonth(subMonths(now, 11 - i));
      const monthEnd = endOfMonth(subMonths(now, 11 - i));
      const acts = activities.filter((a) =>
        isWithinInterval(parseISO(a.start_date_local), { start: monthStart, end: monthEnd })
      );
      return {
        label: format(monthStart, "MMM yy"),
        distance: Number((acts.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(1)),
        time: Number((acts.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)),
      };
    });
  }, [activities]);

  const periodToggle = (
    <div className="period-toggle">
      {(["last7", "last30", "week", "month", "year"] as Period[]).map((p) => (
        <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>
          {p === "last7" ? "Last 7 days" : p === "last30" ? "Last 30 days" : `This ${p}`}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      {periodToggle}

      <div className="stats-section-header">
        <div className="stats-filter-wrapper">
          <button className="stats-filter-btn" onClick={() => setStatsMenuOpen((o) => !o)}>
            Customize
          </button>
          {statsMenuOpen && (
            <>
              <div className="stats-filter-backdrop" onClick={() => setStatsMenuOpen(false)} />
              <div className="stats-filter-menu">
                {ALL_STATS.map((s) => (
                  <label key={s.id} className="stats-filter-item">
                    <input
                      type="checkbox"
                      checked={enabledStats.has(s.id)}
                      onChange={() => toggleStat(s.id)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="stats-grid">
        {enabledStats.has("count") && (
          <div className="stat-card stat-card--clickable" onClick={() => onNavigate("activities")}>
            <div className="label">Activities</div>
            <div className="value">{stats.count}</div>
          </div>
        )}
        {enabledStats.has("distance") && (
          <div className="stat-card stat-card--clickable" onClick={() => onNavigate("activities")}>
            <div className="label">Distance</div>
            <div className="value">{formatDistance(stats.totalDistance)}<span className="unit">km</span></div>
          </div>
        )}
        {enabledStats.has("time") && (
          <div className="stat-card stat-card--clickable" onClick={() => onNavigate("activities")}>
            <div className="label">Moving Time</div>
            <div className="value">{formatDuration(stats.totalTime)}</div>
          </div>
        )}
        {enabledStats.has("elevation") && (
          <div className="stat-card stat-card--clickable" onClick={() => onNavigate("activities")}>
            <div className="label">Elevation</div>
            <div className="value">{Math.round(stats.totalElevation)}<span className="unit">m</span></div>
          </div>
        )}
        {enabledStats.has("heartrate") && stats.avgHeartrate && (
          <div className="stat-card stat-card--clickable" onClick={() => onNavigate("performance")}>
            <div className="label">Avg Heart Rate</div>
            <div className="value">{Math.round(stats.avgHeartrate)}<span className="unit">bpm</span></div>
          </div>
        )}
        {enabledStats.has("watts") && stats.avgWatts && (
          <div className="stat-card stat-card--clickable" onClick={() => onNavigate("performance")}>
            <div className="label">Avg Power</div>
            <div className="value">{Math.round(stats.avgWatts)}<span className="unit">W</span></div>
          </div>
        )}
        {enabledStats.has("prcount") && (
          <div className="stat-card stat-card--clickable" onClick={() => onNavigate("records")}>
            <div className="label">PRs</div>
            <div className="value">{stats.totalPRs}</div>
          </div>
        )}
        {enabledStats.has("achievements") && (
          <div className="stat-card stat-card--clickable" onClick={() => onNavigate("records")}>
            <div className="label">Achievements</div>
            <div className="value">{stats.totalAchievements}</div>
          </div>
        )}
      </div>

      {sportBreakdown.length > 0 && (
        <div className="sport-breakdown">
          {sportBreakdown.map((sport) => (
            <div key={sport.name} className="sport-card">
              <div className="sport-name">{sport.name}</div>
              <div className="sport-stat"><span>Activities</span><span>{sport.count}</span></div>
              <div className="sport-stat"><span>Distance</span><span>{formatDistance(sport.distance)} km</span></div>
              <div className="sport-stat"><span>Time</span><span>{formatDuration(sport.time)}</span></div>
              <div className="sport-stat"><span>Elevation</span><span>{Math.round(sport.elevation)} m</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="chart-section">
        <h3>Weekly Distance (last 12 weeks)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={weeklyChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 12 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${value} km`, "Distance"]}
            />
            <Bar dataKey="distance" fill="#fc4c02" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-section">
        <h3>Monthly Distance (last 12 months)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 12 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${value} km`, "Distance"]}
            />
            <Bar dataKey="distance" fill="#fc4c02" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
