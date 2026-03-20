import { useState, useMemo } from "react";
import { format, parseISO, isWithinInterval, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import type { Activity } from "../api/strava";
import { formatDuration, formatDistance, formatPace, RUN_TYPES, normalizeSportLabel } from "../lib/utils";
import { CollapsibleSection } from "../lib/CollapsibleSection";

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

export function ActivitiesPage({ activities }: Props) {
  const [period, setPeriod] = useState<Period>("week");

  const filtered = useMemo(() => {
    const { start, end } = getInterval(period);
    return activities.filter((a) => isWithinInterval(parseISO(a.start_date_local), { start, end }));
  }, [activities, period]);

  return (
    <div>
      <div className="period-toggle">
        {(["last7", "last30", "week", "month", "year"] as Period[]).map((p) => (
          <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>
            {p === "last7" ? "Last 7 days" : p === "last30" ? "Last 30 days" : `This ${p}`}
          </button>
        ))}
      </div>
      <CollapsibleSection title="Recent Activities" extra={
        <span style={{ fontSize: "0.75rem", opacity: 0.4 }}>{filtered.length} activities</span>
      }>
        <div className="recent-activities">
          {filtered.length === 0 && (
            <div className="activities-empty">No activities in this period.</div>
          )}
          {filtered.map((a) => {
            const isRunActivity = RUN_TYPES.has(a.sport_type) || RUN_TYPES.has(a.type);
            return (
              <a
                key={a.id}
                className="activity-row"
                href={`https://www.strava.com/activities/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Strava"
              >
                <div>
                  <div className="activity-name">{a.name}</div>
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
              </a>
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}
