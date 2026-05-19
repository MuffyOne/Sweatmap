import { useState, useEffect, useMemo } from "react";
import {
  isXertConnected,
  disconnectXert,
  fetchTrainingInfo,
  fetchWorkoutDetail,
  getCachedTrainingInfo,
  type XertTrainingInfo,
  type XertInterval,
} from "../api/xert";
import styles from "./XertPage.module.css";

function formatSec(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m${rem}s` : `${m}m`;
}

export function XertPage() {
  const [connected, setConnected] = useState(isXertConnected);
  const [error, setError] = useState("");
  const [info, setInfo] = useState<XertTrainingInfo | null>(() => {
    try { return getCachedTrainingInfo(); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [intervals, setIntervals] = useState<XertInterval[] | null>(null);

  useEffect(() => {
    if (!connected) return;
    setLoading(true);
    setError("");
    fetchTrainingInfo()
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [connected]);

  useEffect(() => {
    const wid = info?.wotd?.workoutId;
    if (wid) {
      fetchWorkoutDetail(wid)
        .then((d) => setIntervals(d.intervals))
        .catch(() => {});
    } else {
      setIntervals(null);
    }
  }, [info?.wotd?.workoutId]);

  async function handleRefresh() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTrainingInfo();
      setInfo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  }

  function handleDisconnect() {
    disconnectXert();
    setConnected(false);
    setInfo(null);
  }

  const sig = info?.signature;
  const tl = info?.tl;
  const target = info?.targetXSS;

  const tlParts = useMemo(() => {
    if (!tl || !tl.total) return null;
    return [
      { label: "Low", value: tl.low, color: "#4aaa7a" },
      { label: "High", value: tl.high, color: "#e0a020" },
      { label: "Peak", value: tl.peak, color: "#e05030" },
    ];
  }, [tl]);

  if (!connected) {
    return null;
  }

  return (
    <div className="xert-page">
      {loading && <div className="xert-loading">Loading XERT data...</div>}
      {error && <div className={`xert-error ${styles.errorSpaced}`}>{error}</div>}

      {sig && (
        <>
          {/* Status bar */}
          <div className="xert-status-row">
            <div className="xert-freshness-badge" data-status={info?.status?.toLowerCase()}>
              {info?.status ?? "—"}
            </div>
            {info?.weight ? (
              <span className="xert-meta">{info.weight.toFixed(1)} kg</span>
            ) : null}
            {sig.ftp ? (
              <span className="xert-meta">W/kg: {(sig.ftp / (info?.weight || 70)).toFixed(2)}</span>
            ) : null}
          </div>

          {/* Workout of the Day */}
          {info?.wotd && (
            <div className={`xert-wotd-card ${styles.wotdCardSpaced}`}>
              <div className="xert-wotd-label">Workout of the Day</div>
              <div className="xert-wotd-name">{info.wotd.name}</div>
              <div className="xert-wotd-meta">
                {intervals && intervals.length > 0 && (
                  <span>{formatSec(intervals.reduce((s, iv) => s + iv.duration + iv.restDuration, 0))}</span>
                )}
                {info.wotd.difficulty > 0 && <span>Difficulty: {info.wotd.difficulty.toFixed(1)}</span>}
                {info.wotd.type && info.wotd.type !== "None" && <span>{info.wotd.type}</span>}
              </div>
              {info.wotd.description && (
                <div className="xert-wotd-desc">{info.wotd.description}</div>
              )}
              {intervals && intervals.length > 0 && (
                <div className="xert-intervals">
                  <div className="xert-intervals-title">Intervals</div>
                  <div className="xert-intervals-visual">
                    {intervals.map((iv, i) => {
                      const maxPower = Math.max(...intervals.map(v => v.power));
                      const height = maxPower > 0 ? (iv.power / maxPower) * 100 : 50;
                      const totalSec = iv.duration + iv.restDuration;
                      return (
                        <div key={i} className="xert-iv-group" title={`${iv.name}\n${Math.round(iv.power)}W × ${formatSec(iv.duration)}${iv.restDuration ? ` + ${formatSec(iv.restDuration)} rest` : ""}`}>
                          <div className="xert-iv-work" style={{ height: `${height}%` }} />
                          {iv.restDuration > 0 && (
                            <div className="xert-iv-rest" style={{ height: `${(iv.restDuration / totalSec) * height}%` }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fitness Signature */}
          <div className="xert-card-row">
            <div className="stat-card">
              <div className="label">Threshold Power</div>
              <div className="value">{Math.round(sig.ftp ?? 0)}<span className="unit">W</span></div>
            </div>
            <div className="stat-card">
              <div className="label">Lower TP</div>
              <div className="value">{Math.round(sig.ltp ?? 0)}<span className="unit">W</span></div>
            </div>
            <div className="stat-card">
              <div className="label">High Intensity Energy</div>
              <div className="value">{(sig.hie ?? 0).toFixed(1)}<span className="unit">kJ</span></div>
            </div>
            <div className="stat-card">
              <div className="label">Peak Power</div>
              <div className="value">{Math.round(sig.pp ?? 0)}<span className="unit">W</span></div>
            </div>
          </div>

          {/* Training Load */}
          {tl && (
            <div className="chart-section">
              <h3>Training Load</h3>
              <div className="xert-card-row">
                <div className="stat-card">
                  <div className="label">Low</div>
                  <div className="value">{Math.round(tl.low ?? 0)}<span className="unit">XSS</span></div>
                </div>
                <div className="stat-card">
                  <div className="label">High</div>
                  <div className="value">{Math.round(tl.high ?? 0)}<span className="unit">XSS</span></div>
                </div>
                <div className="stat-card">
                  <div className="label">Peak</div>
                  <div className="value">{Math.round(tl.peak ?? 0)}<span className="unit">XSS</span></div>
                </div>
                <div className="stat-card">
                  <div className="label">Total</div>
                  <div className="value">{Math.round(tl.total ?? 0)}<span className="unit">XSS</span></div>
                </div>
              </div>
              {tlParts && tl.total > 0 && (
                <div className="xert-tl-bar">
                  {tlParts.map((p) => (
                    <div
                      key={p.label}
                      className="xert-tl-segment"
                      style={{ width: `${(p.value / tl.total) * 100}%`, background: p.color }}
                      title={`${p.label}: ${Math.round(p.value)} XSS`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Target XSS */}
          {target && target.total > 0 && (
            <div className="chart-section">
              <h3>Daily Target</h3>
              <div className="xert-card-row">
                <div className="stat-card">
                  <div className="label">Low</div>
                  <div className="value">{Math.round(target.low ?? 0)}<span className="unit">XSS</span></div>
                </div>
                <div className="stat-card">
                  <div className="label">High</div>
                  <div className="value">{Math.round(target.high ?? 0)}<span className="unit">XSS</span></div>
                </div>
                <div className="stat-card">
                  <div className="label">Peak</div>
                  <div className="value">{Math.round(target.peak ?? 0)}<span className="unit">XSS</span></div>
                </div>
                <div className="stat-card">
                  <div className="label">Total</div>
                  <div className="value">{Math.round(target.total ?? 0)}<span className="unit">XSS</span></div>
                </div>
              </div>
            </div>
          )}


        </>
      )}

      <div className="xert-actions">
        <button className="btn-compute" onClick={handleRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
        <button className="btn-service btn-service-danger" onClick={handleDisconnect}>
          Disconnect
        </button>
      </div>
    </div>
  );
}
