import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { format, eachDayOfInterval, subDays } from "date-fns";
import type { Activity } from "../api/strava";
import { FTP_KEY } from "./Settings";
import { TOOLTIP_STYLE } from "../lib/utils";

const CTL_DECAY = Math.exp(-1 / 42);
const ATL_DECAY = Math.exp(-1 / 7);

interface DayPoint {
  date: string;
  fullDate: string;
  ctl: number;
  atl: number;
  tsb: number;
  tsbPos: number;
  tsbNeg: number;
  load: number;
}

function getFormStatus(tsb: number): { label: string; color: string } {
  if (tsb > 5)   return { label: "Fresh",         color: "#4aaa7a" };
  if (tsb > -10) return { label: "Optimal",       color: "#c4943a" };
  if (tsb > -30) return { label: "Training Load", color: "#b05a18" };
  return           { label: "High Risk",         color: "#c94040" };
}

function computeLoad(a: Activity, ftp: number | null): number {
  // Power-based TSS (approximate, uses avg watts instead of normalized power)
  if (a.average_watts && ftp && ftp > 0) {
    const if_ = a.average_watts / ftp;
    return (a.moving_time * a.average_watts * if_) / (ftp * 3600) * 100;
  }
  // Strava's HR-based suffer score
  if (a.suffer_score && a.suffer_score > 0) return a.suffer_score;
  // Fallback: 1 point per minute of activity
  return a.moving_time / 60;
}

function computePMC(activities: Activity[], ftp: number | null): DayPoint[] {
  const loadByDate = new Map<string, number>();
  for (const a of activities) {
    const date = a.start_date_local.slice(0, 10);
    const load = computeLoad(a, ftp);
    loadByDate.set(date, (loadByDate.get(date) ?? 0) + load);
  }

  const today = new Date();
  const start = subDays(today, 364);
  const days = eachDayOfInterval({ start, end: today });

  let ctl = 0;
  let atl = 0;

  return days.map((day, i) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const load = loadByDate.get(dateStr) ?? 0;
    ctl = ctl * CTL_DECAY + load * (1 - CTL_DECAY);
    atl = atl * ATL_DECAY + load * (1 - ATL_DECAY);
    const tsb = ctl - atl;
    const isMonthStart = day.getDate() === 1;
    const isLast = i === days.length - 1;
    const ctlR = Math.round(ctl * 10) / 10;
    const atlR = Math.round(atl * 10) / 10;
    const tsbR = Math.round(tsb * 10) / 10;
    return {
      date: isLast ? "Today" : isMonthStart ? format(day, "MMM") : "",
      fullDate: format(day, "MMM d, yyyy"),
      ctl: ctlR,
      atl: atlR,
      tsb: tsbR,
      tsbPos: tsbR > 0 ? tsbR : 0,
      tsbNeg: tsbR < 0 ? tsbR : 0,
      load: Math.round(load),
    };
  });
}

interface Props {
  activities: Activity[];
}

export function FitnessChart({ activities }: Props) {
  const ftp = useMemo(() => {
    const v = parseInt(localStorage.getItem(FTP_KEY) ?? "", 10);
    return !isNaN(v) && v > 0 ? v : null;
  }, []);

  const data = useMemo(() => computePMC(activities, ftp), [activities, ftp]);

  const current = data[data.length - 1];
  const status = getFormStatus(current.tsb);

  return (
    <div className="chart-section">
      <div className="power-curve-header">
        <h3>Fitness &amp; Form</h3>
        <span style={{ fontSize: "0.75rem", opacity: 0.4 }}>
          {ftp ? "TSS (power) · Suffer Score · duration" : "Suffer Score · duration-based"}
        </span>
      </div>

      <div className="pmc-stats">
        <div className="pmc-stat">
          <div className="pmc-stat-label">Fitness (CTL)</div>
          <div className="pmc-stat-value" style={{ color: "#4a9eca" }}>{current.ctl}</div>
        </div>
        <div className="pmc-stat">
          <div className="pmc-stat-label">Fatigue (ATL)</div>
          <div className="pmc-stat-value" style={{ color: "#9b7ec8" }}>{current.atl}</div>
        </div>
        <div className="pmc-stat">
          <div className="pmc-stat-label">Form (TSB)</div>
          <div className="pmc-stat-value" style={{ color: status.color }}>
            {current.tsb > 0 ? "+" : ""}{current.tsb}
          </div>
        </div>
        <div className="pmc-stat">
          <div className="pmc-stat-label">Status</div>
          <div className="pmc-stat-value pmc-stat-status" style={{ color: status.color }}>{status.label}</div>
        </div>
      </div>

      {/* CTL + ATL */}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#e8eaf0" }}
            itemStyle={{ color: "#e8eaf0" }}
            labelFormatter={(_val, payload) => (payload?.[0]?.payload as DayPoint | undefined)?.fullDate ?? ""}
            formatter={(value: unknown, name: string) => {
              if (name === "ctl") return [value, "Fitness (CTL)"];
              if (name === "atl") return [value, "Fatigue (ATL)"];
              return [value, name];
            }}
          />
          <Area
            type="monotone"
            dataKey="ctl"
            stroke="#4a9eca"
            fill="#4a9eca"
            fillOpacity={0.15}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="atl"
            stroke="#9b7ec8"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* TSB / Form */}
      <div style={{ marginTop: "0.5rem" }}>
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" hide />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "#e8eaf0" }}
              itemStyle={{ color: "#e8eaf0" }}
              labelFormatter={(_val, payload) => (payload?.[0]?.payload as DayPoint | undefined)?.fullDate ?? ""}
              formatter={(value: unknown, name: string) => {
                if (name === "tsbPos" || name === "tsbNeg") return [value, "Form (TSB)"];
                return [value, name];
              }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
            <Area
              type="monotone"
              dataKey="tsbPos"
              stroke="#276d4e"
              fill="#276d4e"
              fillOpacity={0.55}
              strokeWidth={0}
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="tsbNeg"
              stroke="#9b2c2c"
              fill="#9b2c2c"
              fillOpacity={0.55}
              strokeWidth={0}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.2)", marginTop: "0.6rem", lineHeight: 1.5 }}>
        CTL (blue) = 42-day fitness &nbsp;·&nbsp; ATL (purple) = 7-day fatigue &nbsp;·&nbsp; Form = CTL − ATL
        &nbsp;·&nbsp; Green = fresh / Red = fatigued &nbsp;·&nbsp; First few months may underestimate fitness (warmup from 0)
      </div>
    </div>
  );
}
