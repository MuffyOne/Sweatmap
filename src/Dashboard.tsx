import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isWithinInterval,
  format,
  subWeeks,
  subMonths,
  parseISO,
} from "date-fns";
import type { Activity } from "./strava";

type Period = "week" | "month" | "year";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(1);
}

function formatPace(avgSpeed: number): string {
  if (avgSpeed === 0) return "--";
  const paceMinPerKm = 1000 / 60 / avgSpeed;
  const min = Math.floor(paceMinPerKm);
  const sec = Math.round((paceMinPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function getInterval(period: Period): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case "week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "year":
      return { start: startOfYear(now), end: endOfYear(now) };
  }
}

function filterActivities(activities: Activity[], period: Period): Activity[] {
  const { start, end } = getInterval(period);
  return activities.filter((a) =>
    isWithinInterval(parseISO(a.start_date_local), { start, end })
  );
}

interface Props {
  activities: Activity[];
}

export function Dashboard({ activities }: Props) {
  const [period, setPeriod] = useState<Period>("week");

  const filtered = useMemo(
    () => filterActivities(activities, period),
    [activities, period]
  );

  const stats = useMemo(() => {
    const totalDistance = filtered.reduce((s, a) => s + a.distance, 0);
    const totalTime = filtered.reduce((s, a) => s + a.moving_time, 0);
    const totalElevation = filtered.reduce((s, a) => s + a.total_elevation_gain, 0);
    const count = filtered.length;
    const avgHeartrate =
      filtered.filter((a) => a.average_heartrate).length > 0
        ? filtered
            .filter((a) => a.average_heartrate)
            .reduce((s, a) => s + (a.average_heartrate || 0), 0) /
          filtered.filter((a) => a.average_heartrate).length
        : null;

    return { totalDistance, totalTime, totalElevation, count, avgHeartrate };
  }, [filtered]);

  const sportBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { distance: number; time: number; count: number; elevation: number }
    >();
    for (const a of filtered) {
      const type = a.sport_type || a.type;
      const cur = map.get(type) || { distance: 0, time: 0, count: 0, elevation: 0 };
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
    const weeks: { label: string; distance: number; time: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const weekActivities = activities.filter((a) =>
        isWithinInterval(parseISO(a.start_date_local), {
          start: weekStart,
          end: weekEnd,
        })
      );
      weeks.push({
        label: format(weekStart, "MMM d"),
        distance: Number((weekActivities.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(1)),
        time: Number((weekActivities.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)),
      });
    }
    return weeks;
  }, [activities]);

  const monthlyChart = useMemo(() => {
    const months: { label: string; distance: number; time: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i));
      const monthEnd = endOfMonth(subMonths(now, i));
      const monthActivities = activities.filter((a) =>
        isWithinInterval(parseISO(a.start_date_local), {
          start: monthStart,
          end: monthEnd,
        })
      );
      months.push({
        label: format(monthStart, "MMM yy"),
        distance: Number((monthActivities.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(1)),
        time: Number((monthActivities.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1)),
      });
    }
    return months;
  }, [activities]);

  return (
    <div>
      <div className="period-toggle">
        {(["week", "month", "year"] as Period[]).map((p) => (
          <button
            key={p}
            className={period === p ? "active" : ""}
            onClick={() => setPeriod(p)}
          >
            This {p}
          </button>
        ))}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Activities</div>
          <div className="value">{stats.count}</div>
        </div>
        <div className="stat-card">
          <div className="label">Distance</div>
          <div className="value">
            {formatDistance(stats.totalDistance)}
            <span className="unit">km</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Moving Time</div>
          <div className="value">{formatDuration(stats.totalTime)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Elevation</div>
          <div className="value">
            {Math.round(stats.totalElevation)}
            <span className="unit">m</span>
          </div>
        </div>
        {stats.avgHeartrate && (
          <div className="stat-card">
            <div className="label">Avg Heart Rate</div>
            <div className="value">
              {Math.round(stats.avgHeartrate)}
              <span className="unit">bpm</span>
            </div>
          </div>
        )}
      </div>

      {sportBreakdown.length > 0 && (
        <div className="sport-breakdown">
          {sportBreakdown.map((sport) => (
            <div key={sport.name} className="sport-card">
              <div className="sport-name">{sport.name}</div>
              <div className="sport-stat">
                <span>Activities</span>
                <span>{sport.count}</span>
              </div>
              <div className="sport-stat">
                <span>Distance</span>
                <span>{formatDistance(sport.distance)} km</span>
              </div>
              <div className="sport-stat">
                <span>Time</span>
                <span>{formatDuration(sport.time)}</span>
              </div>
              <div className="sport-stat">
                <span>Elevation</span>
                <span>{Math.round(sport.elevation)} m</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="chart-section">
        <h3>Weekly Distance (last 12 weeks)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={weeklyChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d333b" />
            <XAxis dataKey="label" tick={{ fill: "#8b949e", fontSize: 12 }} />
            <YAxis tick={{ fill: "#8b949e", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: "#1c2028",
                border: "1px solid #2d333b",
                borderRadius: 8,
                color: "#e1e4e8",
              }}
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
            <CartesianGrid strokeDasharray="3 3" stroke="#2d333b" />
            <XAxis dataKey="label" tick={{ fill: "#8b949e", fontSize: 12 }} />
            <YAxis tick={{ fill: "#8b949e", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: "#1c2028",
                border: "1px solid #2d333b",
                borderRadius: 8,
                color: "#e1e4e8",
              }}
              formatter={(value) => [`${value} km`, "Distance"]}
            />
            <Bar dataKey="distance" fill="#fc4c02" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="recent-activities">
        <h3>Recent Activities</h3>
        {filtered.slice(0, 10).map((a) => (
          <div key={a.id} className="activity-row">
            <div>
              <div className="activity-name">{a.name}</div>
              <div className="activity-type">
                {a.sport_type || a.type} &middot;{" "}
                {format(parseISO(a.start_date_local), "MMM d, yyyy")}
              </div>
            </div>
            <div className="activity-stats">
              <div>
                <span>{formatDistance(a.distance)}</span> km
              </div>
              <div>
                <span>{formatDuration(a.moving_time)}</span>
              </div>
              <div>
                <span>{formatPace(a.average_speed)}</span> /km
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
