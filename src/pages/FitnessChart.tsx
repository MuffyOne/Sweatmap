import { useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { format, eachDayOfInterval, subDays } from "date-fns";
import type { Activity } from "../api/strava";
import { FTP_KEY } from "./Settings";
import { TOOLTIP_STYLE } from "../lib/utils";
import { CollapsibleSection } from "../lib/CollapsibleSection";

const CTL_DECAY = Math.exp(-1 / 42);
const ATL_DECAY = Math.exp(-1 / 7);

interface DayPoint {
  ix: number;
  date: string;
  fullDate: string;
  ctl: number;
  atl: number;
  tsb: number;
  tsbT: number | null;
  tsbF: number | null;
  tsbN: number | null;
  tsbP: number | null;
  tsbH: number | null;
  load: number;
}

const FORM_ZONES = [
  { label: "Transition", y1:  25, y2:  100, color: "#7c90aa", tip: "TSB > 25 — very fresh, possible detraining" },
  { label: "Fresh",      y1:   5, y2:   25, color: "#4aaa7a", tip: "TSB +5 to +25 — race-ready / peak form" },
  { label: "Neutral",    y1: -10, y2:    5, color: "#d4a820", tip: "TSB −10 to +5 — maintaining, stable load" },
  { label: "Productive", y1: -30, y2:  -10, color: "#e07820", tip: "TSB −30 to −10 — building fitness, normal fatigue" },
  { label: "High Risk",  y1: -100, y2: -30, color: "#c94040", tip: "TSB < −30 — overreaching, recovery needed" },
];

function getFormStatus(tsb: number): { label: string; color: string } {
  const zone = FORM_ZONES.find(z => tsb > z.y1) ?? FORM_ZONES[FORM_ZONES.length - 1];
  return { label: zone.label, color: zone.color };
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


function tsbZoneIndex(tsb: number): number {
  if (tsb > 25) return 0;
  if (tsb > 5)  return 1;
  if (tsb > -10) return 2;
  if (tsb > -30) return 3;
  return 4;
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

  // y value of the boundary between zone[i] and zone[i+1]
  const ZONE_BOUNDARIES = [25, 5, -10, -30];

  function makePoint(base: DayPoint, tsbVal: number, z1: number, z2: number): DayPoint {
    const v: (number | null)[] = [null, null, null, null, null];
    v[z1] = tsbVal;
    v[z2] = tsbVal;
    return { ...base, ix: 0, tsb: tsbVal, tsbT: v[0], tsbF: v[1], tsbN: v[2], tsbP: v[3], tsbH: v[4], load: 0 };
  }

  const raw: DayPoint[] = days.map((day, i) => {
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
    const zi = tsbZoneIndex(tsbR);
    return {
      ix: i,
      date: isLast ? "Today" : isMonthStart ? format(day, "MMM") : "",
      fullDate: format(day, "MMM d, yyyy"),
      ctl: ctlR, atl: atlR, tsb: tsbR,
      tsbT: zi === 0 ? tsbR : null,
      tsbF: zi === 1 ? tsbR : null,
      tsbN: zi === 2 ? tsbR : null,
      tsbP: zi === 3 ? tsbR : null,
      tsbH: zi === 4 ? tsbR : null,
      load: Math.round(load),
    };
  });

  // Insert synthetic crossing points at exact boundary values so zone lines connect with no gaps/overlaps
  const output: DayPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    output.push(raw[i]);
    if (i < raw.length - 1) {
      const zi = tsbZoneIndex(raw[i].tsb);
      const ni = tsbZoneIndex(raw[i + 1].tsb);
      if (zi !== ni) {
        const lo = Math.min(zi, ni);
        const hi = Math.max(zi, ni);
        // Iterate boundaries in the direction of travel
        const bRange = zi < ni
          ? Array.from({ length: hi - lo }, (_, k) => lo + k)       // going down
          : Array.from({ length: hi - lo }, (_, k) => hi - 1 - k);  // going up
        for (const b of bRange) {
          output.push(makePoint(raw[i], ZONE_BOUNDARIES[b], b, b + 1));
        }
      }
    }
  }
  output.forEach((p, i) => { p.ix = i; });
  return output;
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
      <CollapsibleSection title="Overview">
        <div className="stats-grid" style={{ marginBottom: "1.5rem" }}>
          <div className="stat-card">
            <div className="label" style={{ display: "flex", alignItems: "center" }}>
              Fitness (CTL)
              <span className="info-tip" data-tip="Chronic Training Load — 42-day exponential average of daily training stress. Higher means more fitness built up over time.">i</span>
            </div>
            <div className="value" style={{ color: "#4a9eca" }}>{current.ctl}</div>
          </div>
          <div className="stat-card">
            <div className="label" style={{ display: "flex", alignItems: "center" }}>
              Fatigue (ATL)
              <span className="info-tip" data-tip="Acute Training Load — 7-day exponential average of daily training stress. Spikes quickly with hard training blocks.">i</span>
            </div>
            <div className="value" style={{ color: "#9b7ec8" }}>{current.atl}</div>
          </div>
          <div className="stat-card">
            <div className="label" style={{ display: "flex", alignItems: "center" }}>
              Form (TSB)
              <span className="info-tip" data-tip="Training Stress Balance = CTL − ATL. Positive means fresh and rested. Negative means fatigued or in a training block.">i</span>
            </div>
            <div className="value" style={{ color: status.color }}>
              {current.tsb > 0 ? "+" : ""}{current.tsb}
            </div>
          </div>
          <div className="stat-card">
            <div className="label" style={{ display: "flex", alignItems: "center" }}>
              Status
              <span className="info-tip" data-tip="Transition (>25) · Fresh (+5 to +25) · Neutral (−10 to +5) · Productive (−30 to −10) · High Risk (<−30)">i</span>
            </div>
            <div className="value" style={{ color: status.color, fontSize: "1.1rem" }}>{status.label}</div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Fitness & Fatigue">
        <div style={{ display: "flex", gap: "1rem", fontSize: "0.72rem", marginBottom: "0.75rem" }}>
          <span style={{ color: "#4a9eca", opacity: 0.8 }}>● CTL 42d</span>
          <span style={{ color: "#9b7ec8", opacity: 0.8 }}>● ATL 7d</span>
          <span style={{ opacity: 0.3 }}>{ftp ? "power-based" : "suffer score"}</span>
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
              tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "#e8eaf0", fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ color: "#e8eaf0" }}
              labelFormatter={(_val, payload) => (payload?.[0]?.payload as DayPoint | undefined)?.fullDate ?? ""}
              formatter={(value, name) => [value as never, name === "ctl" ? "Fitness (CTL)" : name === "atl" ? "Fatigue (ATL)" : (name ?? "")]}
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
      </CollapsibleSection>

      <CollapsibleSection title="Form (TSB)">
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.68rem", marginBottom: "0.75rem" }}>
          {FORM_ZONES.map(z => (
            <span key={z.label} title={z.tip} style={{ color: z.color, opacity: 0.85, cursor: "default" }}>● {z.label}</span>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="ix" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            {FORM_ZONES.map(z => (
              <ReferenceArea
                key={z.label}
                y1={z.y1}
                y2={z.y2}
                fill={z.color}
                fillOpacity={0.13}
                ifOverflow="hidden"
              />
            ))}
            {/* Zone boundary lines — no labels, legend in header explains colors */}
            {[25, 5, -10, -30].map((y, i) => (
              <ReferenceLine
                key={y}
                y={y}
                stroke={["#7c90aa","#4aaa7a","#d4a820","#e07820"][i]}
                strokeOpacity={0.35}
                strokeDasharray="4 3"
                strokeWidth={1}
              />
            ))}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "#e8eaf0", fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ color: "#e8eaf0" }}
              labelFormatter={(_val, payload) => (payload?.[0]?.payload as DayPoint | undefined)?.fullDate ?? ""}
              formatter={(value, name) => {
              const zoneNames: Record<string, string> = { tsbT: "Form (TSB)", tsbF: "Form (TSB)", tsbN: "Form (TSB)", tsbP: "Form (TSB)", tsbH: "Form (TSB)" };
              return [value as never, zoneNames[name as string] ?? (name ?? "")];
            }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
            {/* Transparent continuous line — gives recharts a non-null series to bisect for hover/tooltip */}
            <Line type="linear" dataKey="tsb" stroke="transparent" strokeWidth={0} dot={false} isAnimationActive={false} legendType="none" />
            {([
              { key: "tsbT", color: "#7c90aa" },
              { key: "tsbF", color: "#4aaa7a" },
              { key: "tsbN", color: "#d4a820" },
              { key: "tsbP", color: "#e07820" },
              { key: "tsbH", color: "#c94040" },
            ] as const).map(z => (
              <Line
                key={z.key}
                type="linear"
                dataKey={z.key}
                stroke={z.color}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                legendType="none"
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ fontSize: "0.67rem", color: "rgba(255,255,255,0.45)", marginTop: "0.25rem", lineHeight: 1.5 }}>
          CTL = 42-day chronic load &nbsp;·&nbsp; ATL = 7-day acute load &nbsp;·&nbsp; Form = CTL − ATL &nbsp;·&nbsp; First weeks may underestimate fitness (warms up from zero)
        </div>
      </CollapsibleSection>
    </div>
  );
}
