import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  isWithinInterval, format, subWeeks, subMonths, subDays, subYears, parseISO,
  differenceInDays, getDayOfYear, getDaysInYear,
} from "date-fns";
import type { Activity } from "../api/strava";
import type { Page } from "../Dashboard";
import { formatDuration, formatDistance, TOOLTIP_STYLE } from "../lib/utils";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { CollapsibleSection } from "../lib/CollapsibleSection";
import { WEEKLY_KM_GOAL_KEY, YEARLY_KM_GOAL_KEY } from "./Settings";

type Period = "week" | "month" | "year" | "last7" | "last30";

const ALL_STATS = [
  { id: "count",        label: "Activities"     },
  { id: "distance",     label: "Distance"       },
  { id: "time",         label: "Moving Time"    },
  { id: "elevation",    label: "Elevation"      },
  { id: "heartrate",    label: "Avg Heart Rate" },
  { id: "watts",        label: "Avg Power"      },
  { id: "maxwatts",     label: "Peak Power"     },
  { id: "weeklygoal",   label: "Weekly Goal"    },
  { id: "yearlygoal",   label: "Yearly Goal"    },
  { id: "prcount",      label: "PRs"            },
  { id: "achievements", label: "Achievements"   },
] as const;

type StatId = typeof ALL_STATS[number]["id"];

function getDefaultStats(): Set<StatId> {
  const defaults: StatId[] = ["count", "distance", "time", "elevation", "heartrate", "watts", "maxwatts"];
  const wg = parseFloat(localStorage.getItem(WEEKLY_KM_GOAL_KEY) ?? "");
  const yg = parseFloat(localStorage.getItem(YEARLY_KM_GOAL_KEY) ?? "");
  if (!isNaN(wg) && wg > 0) defaults.push("weeklygoal");
  if (!isNaN(yg) && yg > 0) defaults.push("yearlygoal");
  return new Set(defaults);
}

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

function getPrevInterval(period: Period): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case "week": {
      const prevWeek = subWeeks(now, 1);
      return { start: startOfWeek(prevWeek, { weekStartsOn: 1 }), end: endOfWeek(prevWeek, { weekStartsOn: 1 }) };
    }
    case "month": {
      const prevMonth = subMonths(now, 1);
      return { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) };
    }
    case "year": {
      const prevYear = subYears(now, 1);
      return { start: startOfYear(prevYear), end: endOfYear(prevYear) };
    }
    case "last7":  return { start: subDays(now, 14), end: subDays(now, 7) };
    case "last30": return { start: subDays(now, 60), end: subDays(now, 30) };
  }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const pct = pctChange(current, previous);
  if (pct === null) {
    return <span className="stat-delta stat-delta--neutral">━ 0%</span>;
  }
  const up = pct >= 0;
  const display = Math.abs(pct) >= 1000 ? "—" : `${Math.abs(Math.round(pct))}%`;
  return (
    <span className={`stat-delta ${up ? "stat-delta--up" : "stat-delta--down"}`}>
      {up ? "▲" : "▼"} {display}
    </span>
  );
}

interface Props {
  activities: Activity[];
  onNavigate: (page: Page) => void;
}

export function HomePage({ activities, onNavigate }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const [enabledStats, setEnabledStats] = useState<Set<StatId>>(getDefaultStats);
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

  const prevFiltered = useMemo(() => {
    const { start, end } = getPrevInterval(period);
    return activities.filter((a) => isWithinInterval(parseISO(a.start_date_local), { start, end }));
  }, [activities, period]);

  const computeStats = (acts: Activity[]) => {
    const withHR = acts.filter((a) => a.average_heartrate);
    const withWatts = acts.filter((a) => a.average_watts);
    return {
      count: acts.length,
      totalDistance: acts.reduce((s, a) => s + a.distance, 0),
      totalTime: acts.reduce((s, a) => s + a.moving_time, 0),
      totalElevation: acts.reduce((s, a) => s + a.total_elevation_gain, 0),
      avgHeartrate: withHR.length > 0
        ? withHR.reduce((s, a) => s + (a.average_heartrate ?? 0), 0) / withHR.length
        : null,
      avgWatts: withWatts.length > 0
        ? withWatts.reduce((s, a) => s + (a.average_watts ?? 0), 0) / withWatts.length
        : null,
      maxWatts: (() => {
        const withMax = acts.filter((a) => a.max_watts);
        return withMax.length > 0 ? Math.max(...withMax.map((a) => a.max_watts!)) : null;
      })(),
      totalPRs: acts.reduce((s, a) => s + (a.pr_count ?? 0), 0),
      totalAchievements: acts.reduce((s, a) => s + (a.achievement_count ?? 0), 0),
    };
  };

  const stats = useMemo(() => computeStats(filtered), [filtered]);
  const prevStats = useMemo(() => computeStats(prevFiltered), [prevFiltered]);

  /* ── km goal cards ── */
  const weeklyGoalKm = useMemo(() => {
    const v = parseFloat(localStorage.getItem(WEEKLY_KM_GOAL_KEY) ?? "");
    return isNaN(v) || v <= 0 ? null : v;
  }, []);

  const yearlyGoalKm = useMemo(() => {
    const v = parseFloat(localStorage.getItem(YEARLY_KM_GOAL_KEY) ?? "");
    return isNaN(v) || v <= 0 ? null : v;
  }, []);

  const weeklyGoalData = useMemo(() => {
    if (!weeklyGoalKm) return null;
    const now = new Date();
    const wStart = startOfWeek(now, { weekStartsOn: 1 });
    const wEnd = endOfWeek(now, { weekStartsOn: 1 });
    const weekActs = activities.filter((a) =>
      isWithinInterval(parseISO(a.start_date_local), { start: wStart, end: wEnd })
    );
    const distKm = weekActs.reduce((s, a) => s + a.distance, 0) / 1000;
    const daysLeft = differenceInDays(wEnd, now) + 1;
    const remaining = weeklyGoalKm - distKm;
    const kmPerDay = remaining > 0 && daysLeft > 0 ? remaining / daysLeft : 0;
    const pct = Math.min((distKm / weeklyGoalKm) * 100, 100);
    return { distKm, goal: weeklyGoalKm, remaining, kmPerDay, pct, ahead: remaining <= 0 };
  }, [activities, weeklyGoalKm]);

  const yearlyGoalData = useMemo(() => {
    if (!yearlyGoalKm) return null;
    const now = new Date();
    const yStart = startOfYear(now);
    const yEnd = endOfYear(now);
    const yearActs = activities.filter((a) =>
      isWithinInterval(parseISO(a.start_date_local), { start: yStart, end: yEnd })
    );
    const distKm = yearActs.reduce((s, a) => s + a.distance, 0) / 1000;
    const dayOfYear = getDayOfYear(now);
    const totalDays = getDaysInYear(now);
    const daysLeft = totalDays - dayOfYear;
    const expectedKm = (yearlyGoalKm / totalDays) * dayOfYear;
    const diff = distKm - expectedKm;
    const remaining = yearlyGoalKm - distKm;
    const kmPerDay = remaining > 0 && daysLeft > 0 ? remaining / daysLeft : 0;
    const pct = Math.min((distKm / yearlyGoalKm) * 100, 100);
    return { distKm, goal: yearlyGoalKm, remaining, kmPerDay, pct, diff, ahead: diff >= 0 };
  }, [activities, yearlyGoalKm]);

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
    <div className="period-toggle" style={{ marginBottom: 0 }}>
      {(["last7", "last30", "week", "month", "year"] as Period[]).map((p) => (
        <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>
          {p === "last7" ? "Last 7 days" : p === "last30" ? "Last 30 days" : `This ${p}`}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <CollapsibleSection title="Stats">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          {periodToggle}
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
        {((enabledStats.has("weeklygoal") && weeklyGoalData) || (enabledStats.has("yearlygoal") && yearlyGoalData)) && (
          <div className="stats-grid" style={{ marginBottom: "1rem" }}>
            {enabledStats.has("weeklygoal") && weeklyGoalData && (
              <div className="stat-card goal-card stat-card--clickable" onClick={() => onNavigate("settings")}>
                <div className="stat-card-header">
                  <span className="label">Weekly Goal</span>
                  <span className={`stat-delta ${weeklyGoalData.ahead ? "stat-delta--up" : "stat-delta--down"}`}>
                    {weeklyGoalData.ahead ? "▲ On track" : `▼ ${Math.abs(weeklyGoalData.remaining).toFixed(1)} km`}
                  </span>
                </div>
                <div className="value">{weeklyGoalData.distKm.toFixed(1)}<span className="unit"> / {weeklyGoalData.goal} km</span></div>
                <div className="goal-progress-bar">
                  <div className="goal-progress-fill" style={{ width: `${weeklyGoalData.pct}%` }} />
                </div>
                <div className="goal-meta">
                  {weeklyGoalData.ahead ? "Goal reached!" : `${weeklyGoalData.kmPerDay.toFixed(1)} km/day needed`}
                </div>
              </div>
            )}
            {enabledStats.has("yearlygoal") && yearlyGoalData && (
              <div className="stat-card goal-card stat-card--clickable" onClick={() => onNavigate("settings")}>
                <div className="stat-card-header">
                  <span className="label">Yearly Goal</span>
                  <span className={`stat-delta ${yearlyGoalData.ahead ? "stat-delta--up" : "stat-delta--down"}`}>
                    {yearlyGoalData.ahead
                      ? `▲ ${Math.abs(yearlyGoalData.diff!).toFixed(0)} km ahead`
                      : `▼ ${Math.abs(yearlyGoalData.diff!).toFixed(0)} km behind`}
                  </span>
                </div>
                <div className="value">{yearlyGoalData.distKm.toFixed(0)}<span className="unit"> / {yearlyGoalData.goal.toLocaleString()} km</span></div>
                <div className="goal-progress-bar">
                  <div className="goal-progress-fill" style={{ width: `${yearlyGoalData.pct}%` }} />
                </div>
                <div className="goal-meta">
                  {yearlyGoalData.remaining <= 0 ? "Goal reached!" : `${yearlyGoalData.kmPerDay.toFixed(1)} km/day needed`}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="stats-grid">
          {enabledStats.has("count") && (
            <div className="stat-card stat-card--clickable" onClick={() => onNavigate("activities")}>
              <div className="stat-card-header"><span className="label">Activities</span><DeltaBadge current={stats.count} previous={prevStats.count} /></div>
              <div className="value">{stats.count}</div>
            </div>
          )}
          {enabledStats.has("distance") && (
            <div className="stat-card stat-card--clickable" onClick={() => onNavigate("activities")}>
              <div className="stat-card-header"><span className="label">Distance</span><DeltaBadge current={stats.totalDistance} previous={prevStats.totalDistance} /></div>
              <div className="value">{formatDistance(stats.totalDistance)}<span className="unit">km</span></div>
            </div>
          )}
          {enabledStats.has("time") && (
            <div className="stat-card stat-card--clickable" onClick={() => onNavigate("activities")}>
              <div className="stat-card-header"><span className="label">Moving Time</span><DeltaBadge current={stats.totalTime} previous={prevStats.totalTime} /></div>
              <div className="value">{formatDuration(stats.totalTime)}</div>
            </div>
          )}
          {enabledStats.has("elevation") && (
            <div className="stat-card stat-card--clickable" onClick={() => onNavigate("activities")}>
              <div className="stat-card-header"><span className="label">Elevation</span><DeltaBadge current={stats.totalElevation} previous={prevStats.totalElevation} /></div>
              <div className="value">{Math.round(stats.totalElevation)}<span className="unit">m</span></div>
            </div>
          )}
          {enabledStats.has("heartrate") && stats.avgHeartrate && (
            <div className="stat-card stat-card--clickable" onClick={() => onNavigate("performance")}>
              <div className="stat-card-header"><span className="label">Avg Heart Rate</span><DeltaBadge current={stats.avgHeartrate} previous={prevStats.avgHeartrate ?? 0} /></div>
              <div className="value">{Math.round(stats.avgHeartrate)}<span className="unit">bpm</span></div>
            </div>
          )}
          {enabledStats.has("watts") && stats.avgWatts && (
            <div className="stat-card stat-card--clickable" onClick={() => onNavigate("performance")}>
              <div className="stat-card-header"><span className="label">Avg Power</span><DeltaBadge current={stats.avgWatts} previous={prevStats.avgWatts ?? 0} /></div>
              <div className="value">{Math.round(stats.avgWatts)}<span className="unit">W</span></div>
            </div>
          )}
          {enabledStats.has("maxwatts") && stats.maxWatts && (
            <div className="stat-card stat-card--clickable" onClick={() => onNavigate("performance")}>
              <div className="stat-card-header"><span className="label">Peak Power</span><DeltaBadge current={stats.maxWatts} previous={prevStats.maxWatts ?? 0} /></div>
              <div className="value">{Math.round(stats.maxWatts)}<span className="unit">W</span></div>
            </div>
          )}
          {enabledStats.has("prcount") && (
            <div className="stat-card stat-card--clickable" onClick={() => onNavigate("records")}>
              <div className="stat-card-header"><span className="label">PRs</span><DeltaBadge current={stats.totalPRs} previous={prevStats.totalPRs} /></div>
              <div className="value">{stats.totalPRs}</div>
            </div>
          )}
          {enabledStats.has("achievements") && (
            <div className="stat-card stat-card--clickable" onClick={() => onNavigate("records")}>
              <div className="stat-card-header"><span className="label">Achievements</span><DeltaBadge current={stats.totalAchievements} previous={prevStats.totalAchievements} /></div>
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
      </CollapsibleSection>

      <CollapsibleSection title="Weekly Distance">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={weeklyChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${value} km`, "Distance"]}
            />
            <Bar dataKey="distance" fill="#fc4c02" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CollapsibleSection>

      <CollapsibleSection title="Monthly Distance">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${value} km`, "Distance"]}
            />
            <Bar dataKey="distance" fill="#fc4c02" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CollapsibleSection>

      <CollapsibleSection title="Activity Heatmap">
        <CalendarHeatmap activities={activities} />
      </CollapsibleSection>
    </div>
  );
}
