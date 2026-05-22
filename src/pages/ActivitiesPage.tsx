import { useState, useMemo, useCallback } from "react";
import { format, parseISO, isWithinInterval, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import type { Activity } from "../api/strava";
import { formatDuration, formatDistance, formatPace, RUN_TYPES, normalizeSportLabel } from "../lib/utils";
import { CollapsibleSection } from "../lib/CollapsibleSection";
import { ActivityDetail } from "./ActivityDetail";
import { StravaIcon, SortDescIcon, SortAscIcon } from "../lib/icons";
import { PeriodToggle } from "../components/PeriodToggle";
import styles from "./ActivitiesPage.module.css";

type Period = "week" | "month" | "year" | "last7" | "last30";

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
}

type SortOrder = "newest" | "oldest";

export function ActivitiesPage({ activities }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const filtered = useMemo(() => {
    const { start, end } = getInterval(period);
    const list = activities.filter((a) => isWithinInterval(parseISO(a.start_date_local), { start, end }));
    const dir = sortOrder === "newest" ? -1 : 1;
    return list.sort((a, b) => dir * (new Date(a.start_date_local).getTime() - new Date(b.start_date_local).getTime()));
  }, [activities, period, sortOrder]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div>
      <PeriodToggle
        options={["last7", "last30", "week", "month", "year"] as const}
        selected={period}
        onSelect={setPeriod}
        renderLabel={(p) => p === "last7" ? "Last 7 days" : p === "last30" ? "Last 30 days" : `This ${p}`}
      />
      <CollapsibleSection title="Recent Activities" extra={
        <button
          className={`sort-toggle ${styles.extraActions}`}
          onClick={(e) => { e.stopPropagation(); setSortOrder((s) => s === "newest" ? "oldest" : "newest"); }}
          title={sortOrder === "newest" ? "Newest first" : "Oldest first"}
        >
          <span className={styles.activityCount}>{filtered.length} activities</span>
          {sortOrder === "newest" ? <SortDescIcon /> : <SortAscIcon />}
        </button>
      }>
        <div className="recent-activities">
          {filtered.length === 0 && (
            <div className="activities-empty">No activities in this period.</div>
          )}
          {filtered.map((a) => {
            const isRunActivity = RUN_TYPES.has(a.sport_type) || RUN_TYPES.has(a.type);
            const isExpanded = expandedId === a.id;
            return (
              <div key={a.id} className={`activity-item${isExpanded ? " expanded" : ""}`}>
                <div
                  className="activity-row"
                  onClick={() => toggleExpand(a.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div>
                    <div className="activity-name">
                      {a.name}
                      <a
                        className="strava-link"
                        href={`https://www.strava.com/activities/${a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="View on Strava"
                      >
                        <StravaIcon />
                      </a>
                    </div>
                    <div className="activity-type">
                      {normalizeSportLabel(a.sport_type || a.type)} &middot;{" "}
                      {format(parseISO(a.start_date_local), "MMM d, yyyy")}
                    </div>
                  </div>
                  <div className="activity-stats">
                    <div><span>{formatDistance(a.distance)}</span> km</div>
                    <div><span>{formatDuration(a.moving_time)}</span></div>
                    {isRunActivity ? (
                      <div><span>{formatPace(a.average_speed)}</span> /km</div>
                    ) : (
                      <div><span>{Math.round(a.total_elevation_gain)}</span> m elev</div>
                    )}
                    {a.average_watts && (
                      <div><span>{Math.round(a.average_watts)}</span> W</div>
                    )}
                  </div>
                </div>
                {isExpanded && <ActivityDetail activity={a} />}
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}
