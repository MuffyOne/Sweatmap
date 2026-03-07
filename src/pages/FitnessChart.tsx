import { useMemo } from "react";
import {
  ComposedChart,
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
    <div>
      {/* Stat cards */}
      <div className="stats-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="label">Fitness (CTL)</div>
          <div className="value" style={{ color: "#4a9eca" }}>{current.ctl}</div>
        </div>
        <div className="stat-card">
          <div className="label">Fatigue (ATL)</div>
          <div className="value" style={{ color: "#9b7ec8" }}>{current.atl}</div>
        </div>
        <div className="stat-card">
          <div className="label">Form (TSB)</div>
          <div className="value" style={{ color: status.color }}>
            {current.tsb > 0 ? "+" : ""}{current.tsb}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Status</div>
          <div className="value" style={{ color: status.color, fontSize: "1.1rem" }}>{status.label}</div>
        </div>
      </div>

      {/* CTL + ATL */}
      <div className="chart-section">
        <div className="power-curve-header">
          <h3>Fitness &amp; Fatigue</h3>
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.72rem" }}>
            <span style={{ color: "#4a9eca", opacity: 0.8 }}>● CTL 42d</span>
            <span style={{ color: "#9b7ec8", opacity: 0.8 }}>● ATL 7d</span>
            <span style={{ opacity: 0.3 }}>{ftp ? "power-based" : "suffer score"}</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="ctlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4a9eca" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#4a9eca" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="atlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#9b7ec8" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#9b7ec8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
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
              labelStyle={{ color: "#e8eaf0", fontWeight: 600, marginBottom: 4 }}
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
              fill="url(#ctlGrad)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: "#4a9eca", strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="atl"
              stroke="#9b7ec8"
              fill="url(#atlGrad)"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 5, fill: "#9b7ec8", strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* TSB / Form */}
      <div className="chart-section">
        <div className="power-curve-header">
          <h3>Form (TSB)</h3>
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.72rem" }}>
            <span style={{ color: "#4aaa7a", opacity: 0.8 }}>● Fresh</span>
            <span style={{ color: "#c94040", opacity: 0.8 }}>● Fatigued</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="tsbPosGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4aaa7a" stopOpacity={0.65} />
                <stop offset="95%" stopColor="#4aaa7a" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="tsbNegGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="5%" stopColor="#c94040" stopOpacity={0.65} />
                <stop offset="95%" stopColor="#c94040" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "#e8eaf0", fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ color: "#e8eaf0" }}
              labelFormatter={(_val, payload) => (payload?.[0]?.payload as DayPoint | undefined)?.fullDate ?? ""}
              formatter={(value: unknown, name: string) => {
                if (name === "tsbPos" || name === "tsbNeg") return [value, "Form (TSB)"];
                return [value, name];
              }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
            <Area
              type="monotone"
              dataKey="tsbPos"
              stroke="#4aaa7a"
              fill="url(#tsbPosGrad)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="tsbNeg"
              stroke="#c94040"
              fill="url(#tsbNegGrad)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontSize: "0.67rem", color: "rgba(255,255,255,0.18)", marginTop: "0.25rem", lineHeight: 1.5 }}>
        CTL = 42-day chronic load &nbsp;·&nbsp; ATL = 7-day acute load &nbsp;·&nbsp; Form = CTL − ATL &nbsp;·&nbsp; First weeks may underestimate fitness (warms up from zero)
      </div>
    </div>
  );
}
