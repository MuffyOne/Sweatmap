import { useMemo, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { Activity } from "./strava";

type Metric = "speed" | "watts";
type SportFilter = "all" | "run" | "ride";

const RUN_TYPES = new Set(["Run", "TrailRun", "Treadmill", "VirtualRun"]);
const RIDE_TYPES = new Set(["Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide"]);

interface Props {
  activities: Activity[];
}

export function TempPerformance({ activities }: Props) {
  const [sport, setSport] = useState<SportFilter>("all");
  const [metric, setMetric] = useState<Metric>("speed");

  const data = useMemo(() => {
    return activities
      .filter((a) => {
        if (a.average_temp === undefined || a.average_temp === null) return false;
        if (sport === "run") return RUN_TYPES.has(a.sport_type) || RUN_TYPES.has(a.type);
        if (sport === "ride") return RIDE_TYPES.has(a.sport_type) || RIDE_TYPES.has(a.type);
        return true;
      })
      .filter((a) => (metric === "watts" ? !!a.average_watts : a.average_speed > 0))
      .map((a) => ({
        temp: a.average_temp!,
        value:
          metric === "watts"
            ? Math.round(a.average_watts!)
            : parseFloat((a.average_speed * 3.6).toFixed(1)),
        name: a.name,
      }));
  }, [activities, sport, metric]);

  const yUnit = metric === "watts" ? "W" : "km/h";
  const yLabel = metric === "watts" ? "Avg Power" : "Avg Speed";

  return (
    <div className="chart-section">
      <div className="power-curve-header">
        <h3>Temperature vs Performance</h3>
        <div className="power-curve-controls">
          <div className="period-toggle" style={{ marginBottom: 0 }}>
            {(["all", "run", "ride"] as SportFilter[]).map((s) => (
              <button key={s} className={sport === s ? "active" : ""} onClick={() => setSport(s)}>
                {s === "all" ? "All" : s === "run" ? "Runs" : "Rides"}
              </button>
            ))}
          </div>
          <div className="period-toggle" style={{ marginBottom: 0 }}>
            <button className={metric === "speed" ? "active" : ""} onClick={() => setMetric("speed")}>Speed</button>
            <button className={metric === "watts" ? "active" : ""} onClick={() => setMetric("watts")}>Power</button>
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="power-curve-empty">
          No activities with temperature data found for this filter. Temperature is recorded by GPS watches and bike computers.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 24, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="temp"
                name="Temperature"
                unit="°C"
                type="number"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 12 }}
                label={{ value: "Temperature (°C)", position: "insideBottom", offset: -14, fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
              />
              <YAxis
                dataKey="value"
                name={yLabel}
                unit={yUnit}
                type="number"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(12, 15, 24, 0.92)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: 10,
                  color: "#e8eaf0",
                }}
                labelStyle={{ color: "#e8eaf0" }}
                itemStyle={{ color: "#e8eaf0" }}
                formatter={(value: unknown, name: unknown) => {
                  if (name === "Temperature") return [`${value}°C`, "Temp"];
                  return [`${value} ${yUnit}`, yLabel];
                }}
                cursor={{ strokeDasharray: "3 3" }}
              />
              <Scatter data={data} fill="#fc4c02" fillOpacity={0.55} />
            </ScatterChart>
          </ResponsiveContainer>
          <div style={{ textAlign: "center", fontSize: "0.72rem", color: "rgba(255,255,255,0.25)", marginTop: "0.25rem" }}>
            {data.length} {data.length === 1 ? "activity" : "activities"} with temperature data
          </div>
        </>
      )}
    </div>
  );
}
