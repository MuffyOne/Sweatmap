import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";
import {
  isGarminConnected,
  fetchGarminHealth,
  getCachedGarminHealth,
  type GarminHealthData,
} from "../api/garmin";
import { TOOLTIP_STYLE } from "../lib/utils";
import { CollapsibleSection } from "../lib/CollapsibleSection";

const STAGE_COLORS = { deep: "#3b8fd4", light: "#7c90aa", rem: "#9333ea", awake: "#e03535" };

export function HealthPage() {
  const connected = isGarminConnected();
  const [health, setHealth] = useState<GarminHealthData | null>(() => {
    try {
      return getCachedGarminHealth();
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!connected) return;
    setLoading(true);
    setError("");
    fetchGarminHealth()
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [connected]);

  async function handleRefresh() {
    setLoading(true);
    setError("");
    try {
      setHealth(await fetchGarminHealth());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  }

  const weightChart = useMemo(
    () => (health?.weight ?? []).map((d) => ({ ...d, label: format(parseISO(d.date), "MMM d") })),
    [health]
  );
  const sleepChart = useMemo(
    () => (health?.sleep ?? []).map((d) => ({ ...d, label: format(parseISO(d.date), "MMM d") })),
    [health]
  );
  const batteryChart = useMemo(
    () => (health?.bodyBattery ?? []).map((d) => ({ ...d, label: format(parseISO(d.date), "MMM d") })),
    [health]
  );

  const weightDomain = useMemo((): [number, number] | undefined => {
    if (weightChart.length === 0) return undefined;
    const values = weightChart.map((d) => d.weightKg);
    // Whole-kg bounds (not fractional padding) so recharts' tick generator
    // lands on clean round numbers instead of odd decimals.
    return [Math.floor(Math.min(...values) - 1), Math.ceil(Math.max(...values) + 1)];
  }, [weightChart]);

  const latestWeight = weightChart.length > 0 ? weightChart[weightChart.length - 1] : null;
  const earliestWeight = weightChart.length > 0 ? weightChart[0] : null;
  const latestSleep = sleepChart.length > 0 ? sleepChart[sleepChart.length - 1] : null;
  const latestBattery = batteryChart.length > 0 ? batteryChart[batteryChart.length - 1] : null;

  if (!connected) return null;

  return (
    <div>
      {loading && <div className="xert-loading">Loading health data...</div>}
      {error && <div className="xert-error">{error}</div>}

      <CollapsibleSection title="Weight">
        {latestWeight ? (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="label">Latest</div>
                <div className="value">
                  {latestWeight.weightKg}
                  <span className="unit">kg</span>
                </div>
              </div>
              {earliestWeight && earliestWeight !== latestWeight && (
                <div className="stat-card">
                  <div className="label">21 Days Ago</div>
                  <div className="value">
                    {earliestWeight.weightKg}
                    <span className="unit">kg</span>
                  </div>
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightChart} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--tick-color)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--tick-color)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} unit="kg" domain={weightDomain} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} kg`, "Weight"]} />
                <Line type="monotone" dataKey="weightKg" stroke="#fc4c02" strokeWidth={2} dot={{ fill: "#fc4c02", r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="power-curve-empty">No weight entries found in the last 21 days.</div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Sleep">
        {latestSleep ? (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="label">Latest Sleep Score</div>
                <div className="value">{latestSleep.score}</div>
              </div>
              <div className="stat-card">
                <div className="label">Total Sleep</div>
                <div className="value">
                  {Math.floor(latestSleep.totalMin / 60)}h {latestSleep.totalMin % 60}m
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={sleepChart} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--tick-color)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--tick-color)", fontSize: 11 }} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [v, "Sleep Score"]} />
                <Line type="monotone" dataKey="score" stroke="#9333ea" strokeWidth={2} dot={{ fill: "#9333ea", r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>

            <div className={"chart-section"}>
              <h3>Sleep Stages</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sleepChart} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--tick-color)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--tick-color)", fontSize: 11 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${v}m`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [`${v}m`, name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="deepMin" name="Deep" stackId="sleep" fill={STAGE_COLORS.deep} isAnimationActive={false} />
                  <Bar dataKey="lightMin" name="Light" stackId="sleep" fill={STAGE_COLORS.light} isAnimationActive={false} />
                  <Bar dataKey="remMin" name="REM" stackId="sleep" fill={STAGE_COLORS.rem} isAnimationActive={false} />
                  <Bar dataKey="awakeMin" name="Awake" stackId="sleep" fill={STAGE_COLORS.awake} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="power-curve-empty">No sleep data found in the last 21 days.</div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Recovery (Body Battery)">
        {latestBattery ? (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="label">Latest High</div>
                <div className="value">{latestBattery.high}</div>
              </div>
              <div className="stat-card">
                <div className="label">Latest Low</div>
                <div className="value">{latestBattery.low}</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={batteryChart} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--tick-color)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--tick-color)", fontSize: 11 }} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="high" name="High" stroke="#22a06b" strokeWidth={2} dot={{ fill: "#22a06b", r: 3 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="low" name="Low" stroke="#d4a820" strokeWidth={2} dot={{ fill: "#d4a820", r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="settings-field-hint">
              Body Battery is Garmin's energy-reserve gauge (0-100), used here as a recovery proxy since Garmin
              has no public recovery/readiness endpoint that supports fetching a date range efficiently.
            </div>
          </>
        ) : (
          <div className="power-curve-empty">No recovery data found in the last 21 days.</div>
        )}
      </CollapsibleSection>

      <div className="xert-actions">
        <button className="btn-compute" onClick={handleRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}
