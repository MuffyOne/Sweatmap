import { useMemo, useRef } from "react";
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
import { format, parseISO, startOfMonth, subMonths, endOfMonth, isWithinInterval, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import type { Activity, SegmentEffort } from "../api/strava";
import { TOOLTIP_STYLE, formatDistance, formatTime, normalizeSportLabel } from "../lib/utils";

interface Props {
  activities: Activity[];
  koms: SegmentEffort[];
}

const SPORT_COLORS = [
  "#fc4c02", "#4a9eca", "#9b7ec8", "#4aaa7a", "#c4943a",
  "#c94040", "#2d6a9f", "#276d4e",
];

const CLIMB_CATEGORY: Record<number, string> = { 1: "Cat 4", 2: "Cat 3", 3: "Cat 2", 4: "Cat 1", 5: "HC" };

export function RecordsPage({ activities, koms }: Props) {
  const komsRef = useRef<HTMLDivElement>(null);

  const allTimePRs = useMemo(
    () => activities.reduce((s, a) => s + (a.pr_count ?? 0), 0),
    [activities]
  );

  const allTimeAchievements = useMemo(
    () => activities.reduce((s, a) => s + (a.achievement_count ?? 0), 0),
    [activities]
  );

  const prActivities = useMemo(
    () => activities.filter((a) => (a.pr_count ?? 0) > 0),
    [activities]
  );

  const prRate = activities.length > 0
    ? Math.round((prActivities.length / activities.length) * 100)
    : 0;

  const bestActivity = useMemo(
    () => activities.reduce<Activity | null>((best, a) =>
      (a.pr_count ?? 0) > (best?.pr_count ?? 0) ? a : best, null),
    [activities]
  );

  // Monthly PR trend (last 12 months)
  const monthlyPRs = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const ref = subMonths(now, 11 - i);
      const start = startOfMonth(ref);
      const end = endOfMonth(ref);
      const prs = activities
        .filter((a) => isWithinInterval(parseISO(a.start_date_local), { start, end }))
        .reduce((s, a) => s + (a.pr_count ?? 0), 0);
      return { label: format(start, "MMM yy"), prs };
    });
  }, [activities]);

  // PR streak (consecutive weeks with at least one PR)
  const { longestStreak, currentStreak } = useMemo(() => {
    const now = new Date();
    // Build set of week-start strings that had PRs
    const weeksWithPR = new Set<string>();
    for (const a of activities) {
      if ((a.pr_count ?? 0) > 0) {
        const ws = startOfWeek(parseISO(a.start_date_local), { weekStartsOn: 1 });
        weeksWithPR.add(format(ws, "yyyy-MM-dd"));
      }
    }

    // Check last 52 weeks for longest and current streaks
    let longest = 0;
    let cur = 0;
    let curStreak = 0;
    let countingCurrent = true;

    for (let i = 0; i < 52; i++) {
      const ws = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      // Skip current (possibly incomplete) week for current streak
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      const isCurrentWeek = we >= now;
      const hasPR = weeksWithPR.has(format(ws, "yyyy-MM-dd"));

      if (i === 0 && isCurrentWeek) {
        // current week: only counts if it already has a PR
        if (!hasPR) countingCurrent = false;
        else curStreak = 1;
        continue;
      }

      if (hasPR) {
        cur++;
        if (countingCurrent) curStreak++;
      } else {
        if (cur > longest) longest = cur;
        cur = 0;
        countingCurrent = false;
      }
    }
    if (cur > longest) longest = cur;

    return { longestStreak: longest, currentStreak: curStreak };
  }, [activities]);

  // Sport breakdown of PRs
  const sportPRs = useMemo(() => {
    const map = new Map<string, { prs: number; acts: number }>();
    for (const a of activities) {
      if ((a.pr_count ?? 0) === 0) continue;
      const sport = normalizeSportLabel(a.sport_type || a.type);
      const cur = map.get(sport) ?? { prs: 0, acts: 0 };
      cur.prs += a.pr_count ?? 0;
      cur.acts += 1;
      map.set(sport, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].prs - a[1].prs)
      .map(([name, data]) => ({ name, ...data }));
  }, [activities]);

  // Top 15 activities by PR count
  const topPRActivities = useMemo(
    () => [...activities]
      .filter((a) => (a.pr_count ?? 0) > 0)
      .sort((a, b) => (b.pr_count ?? 0) - (a.pr_count ?? 0))
      .slice(0, 15),
    [activities]
  );

  return (
    <div>
      {/* Summary stat cards */}
      <div className="stats-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="label">All-time PRs</div>
          <div className="value" style={{ color: "#fc4c02" }}>{allTimePRs.toLocaleString()}</div>
        </div>
        <div className="stat-card stat-card--clickable" onClick={() => komsRef.current?.scrollIntoView({ behavior: "smooth" })}>
          <div className="label">KOMs / QOMs</div>
          <div className="value" style={{ color: "#fc4c02" }}>{koms.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Achievements</div>
          <div className="value">{allTimeAchievements.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">PR Rate</div>
          <div className="value">
            {prRate}
            <span className="unit">%</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Current PR Streak</div>
          <div className="value">
            {currentStreak}
            <span className="unit">wk{currentStreak !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Longest PR Streak</div>
          <div className="value">
            {longestStreak}
            <span className="unit">wk{longestStreak !== 1 ? "s" : ""}</span>
          </div>
        </div>
        {bestActivity && (
          <div className="stat-card">
            <div className="label">Best Single Activity</div>
            <div className="value" style={{ fontSize: "1.35rem", lineHeight: 1.2 }}>
              {bestActivity.pr_count} <span className="unit">PRs</span>
            </div>
            <div className="records-best-name">{bestActivity.name}</div>
          </div>
        )}
      </div>

      {/* Monthly PR trend */}
      <div className="chart-section">
        <div className="power-curve-header">
          <h3>PRs per Month</h3>
          <span style={{ fontSize: "0.75rem", opacity: 0.4 }}>last 12 months</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyPRs} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={28}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "#e8eaf0" }}
              itemStyle={{ color: "#e8eaf0" }}
              formatter={(value: unknown) => [value, "PRs"]}
            />
            <Bar dataKey="prs" fill="#fc4c02" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sport PR breakdown */}
      {sportPRs.length > 0 && (
        <div className="chart-section">
          <div className="power-curve-header">
            <h3>PRs by Sport</h3>
            <span style={{ fontSize: "0.75rem", opacity: 0.4 }}>
              {prActivities.length} activities with PRs
            </span>
          </div>
          <ResponsiveContainer width="100%" height={sportPRs.length * 46 + 20}>
            <BarChart
              data={sportPRs}
              layout="vertical"
              margin={{ top: 4, right: 64, bottom: 4, left: 90 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                width={88}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "#e8eaf0" }}
                itemStyle={{ color: "#e8eaf0" }}
                formatter={(value: unknown, _name, props) => [
                  `${value} PRs across ${(props.payload as { acts: number }).acts} activities`,
                  props.payload.name as string,
                ]}
              />
              <Bar dataKey="prs" radius={[0, 6, 6, 0]} maxBarSize={28} isAnimationActive={false}>
                {sportPRs.map((_, i) => (
                  <Cell key={i} fill={SPORT_COLORS[i % SPORT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top PR activities */}
      {topPRActivities.length > 0 && (
        <div className="chart-section">
          <div className="power-curve-header">
            <h3>Top Activities by PR Count</h3>
            <span style={{ fontSize: "0.75rem", opacity: 0.4 }}>click to view on Strava</span>
          </div>
          <div className="records-table">
            <div className="records-table-header">
              <span>Activity</span>
              <span>Date</span>
              <span>Distance</span>
              <span style={{ textAlign: "center" }}>PRs</span>
              <span style={{ textAlign: "center" }}>Achievements</span>
            </div>
            {topPRActivities.map((a) => (
              <a
                key={a.id}
                className="records-table-row"
                href={`https://www.strava.com/activities/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="records-activity-name">
                  {a.name}
                  <span className="records-sport-tag">{normalizeSportLabel(a.sport_type || a.type)}</span>
                </span>
                <span className="records-cell-muted">
                  {format(parseISO(a.start_date_local), "MMM d, yyyy")}
                </span>
                <span className="records-cell-muted">{formatDistance(a.distance)} km</span>
                <span style={{ textAlign: "center" }}>
                  <span className="records-pr-badge">{a.pr_count}</span>
                </span>
                <span style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: "0.85rem" }}>
                  {a.achievement_count ?? 0}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {koms.length > 0 && (
        <div className="chart-section" ref={komsRef}>
          <div className="power-curve-header">
            <h3>KOM / QOM Segments</h3>
            <span style={{ fontSize: "0.75rem", opacity: 0.4 }}>click to view on Strava</span>
          </div>
          <div className="records-table">
            <div className="records-table-header" style={{ gridTemplateColumns: "1fr 80px 70px 70px 90px" }}>
              <span>Segment</span>
              <span>Distance</span>
              <span>Avg Grade</span>
              <span>Max Grade</span>
              <span>KOM Time</span>
            </div>
            {koms.map((k) => (
              <a
                key={k.id}
                className="records-table-row"
                style={{ gridTemplateColumns: "1fr 80px 70px 70px 90px" }}
                href={`https://www.strava.com/segments/${k.segment.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="records-activity-name">
                  {k.segment.name}
                  {k.segment.climb_category > 0 && (
                    <span className="records-sport-tag">{CLIMB_CATEGORY[k.segment.climb_category] ?? `Cat ${k.segment.climb_category}`}</span>
                  )}
                </span>
                <span className="records-cell-muted">{formatDistance(k.segment.distance)} km</span>
                <span className="records-cell-muted">{k.segment.average_grade.toFixed(1)}%</span>
                <span className="records-cell-muted">{k.segment.maximum_grade.toFixed(1)}%</span>
                <span className="records-pr-badge">{formatTime(k.elapsed_time)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {allTimePRs === 0 && (
        <div className="power-curve-empty">
          No PR data found. Make sure your activities have been synced recently.
        </div>
      )}
    </div>
  );
}
