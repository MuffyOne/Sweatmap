import { useState, useEffect } from "react";
import {
  isXertConnected,
  loginXert,
  disconnectXert,
  fetchTrainingInfo,
} from "../api/xert";

interface Props {
  onXertChange: () => void;
}

export function ServicesPage({ onXertChange }: Props) {
  const [xertConnected, setXertConnected] = useState(isXertConnected);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (xertConnected) {
      setLoading(true);
      fetchTrainingInfo()
        .then(() => {})
        .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
        .finally(() => setLoading(false));
    }
  }, [xertConnected]);

  async function handleXertLogin() {
    setError("");
    setLogging(true);
    try {
      await loginXert(username, password);
      setXertConnected(true);
      setUsername("");
      setPassword("");
      await fetchTrainingInfo();
      onXertChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLogging(false);
    }
  }

  function handleXertDisconnect() {
    disconnectXert();
    setXertConnected(false);
    onXertChange();
  }

  async function handleRefresh() {
    setLoading(true);
    try {
      await fetchTrainingInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-section">
        {/* Garmin */}
        <div className="settings-field">
          <div className="settings-field-label">Garmin Connect</div>
          <div className="settings-field-hint">
            Sync your activities, heart rate, and training data directly from your Garmin device.
          </div>
          <button className="btn-service" disabled>
            Connect to Garmin
          </button>
          <div className="service-coming-soon">Coming soon</div>
        </div>

        {/* XERT */}
        <div className="settings-field">
          <div className="settings-field-label">XERT</div>
          <div className="settings-field-hint">
            Import your fitness signature, training loads, and advanced analytics from XERT.
          </div>

          {!xertConnected ? (
            <div className="xert-login">
              <div className="settings-input-row">
                <input
                  type="text"
                  className="settings-input"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleXertLogin()}
                />
              </div>
              <div className="settings-input-row" style={{ marginTop: 8 }}>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleXertLogin()}
                />
              </div>
              {error && <div className="xert-error">{error}</div>}
              <button
                className="btn-service btn-service-active"
                disabled={logging || !username || !password}
                onClick={handleXertLogin}
                style={{ marginTop: 12 }}
              >
                {logging ? "Connecting..." : "Connect to XERT"}
              </button>
            </div>
          ) : (
            <div className="xert-connected">
              <div className="xert-status-badge">Connected</div>

              {loading && <div className="settings-field-hint" style={{ marginTop: 8 }}>Loading training data...</div>}
              {error && <div className="xert-error" style={{ marginTop: 8 }}>{error}</div>}

              <div className="settings-field-hint" style={{ marginTop: 8 }}>
                XERT data is displayed on the Home page.
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn-service btn-service-active" onClick={handleRefresh} disabled={loading}>
                  {loading ? "Refreshing..." : "Refresh Data"}
                </button>
                <button className="btn-service btn-service-danger" onClick={handleXertDisconnect}>
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
