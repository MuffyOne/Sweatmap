import { useState, useEffect } from "react";
import {
  isXertConnected,
  loginXert,
  disconnectXert,
  fetchTrainingInfo,
} from "../api/xert";
import {
  isGarminConnected,
  loginGarmin,
  disconnectGarmin,
  fetchGarminHealth,
  GarminSessionExpiredError,
} from "../api/garmin";
import styles from "./ServicesPage.module.css";

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

  const [garminConnected, setGarminConnected] = useState(isGarminConnected);
  const [garminUsername, setGarminUsername] = useState("");
  const [garminPassword, setGarminPassword] = useState("");
  const [garminLogging, setGarminLogging] = useState(false);
  const [garminError, setGarminError] = useState("");
  const [garminLoading, setGarminLoading] = useState(false);

  useEffect(() => {
    if (garminConnected) {
      setGarminLoading(true);
      fetchGarminHealth()
        .catch((e) => {
          if (e instanceof GarminSessionExpiredError) setGarminConnected(false);
          setGarminError(e instanceof Error ? e.message : "Failed to load");
        })
        .finally(() => setGarminLoading(false));
    }
  }, [garminConnected]);

  async function handleGarminLogin() {
    setGarminError("");
    setGarminLogging(true);
    try {
      await loginGarmin(garminUsername, garminPassword);
      setGarminConnected(true);
      setGarminUsername("");
      setGarminPassword("");
    } catch (e) {
      setGarminError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setGarminLogging(false);
    }
  }

  function handleGarminDisconnect() {
    disconnectGarmin();
    setGarminConnected(false);
  }

  async function handleGarminRefresh() {
    setGarminLoading(true);
    try {
      await fetchGarminHealth();
    } catch (e) {
      if (e instanceof GarminSessionExpiredError) setGarminConnected(false);
      setGarminError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setGarminLoading(false);
    }
  }

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
            Import weight and sleep data from Garmin Connect. This uses an unofficial
            login (Garmin has no public API), so it may occasionally break or be rejected by Garmin.
          </div>

          {!garminConnected ? (
            <div className="xert-login">
              <div className="settings-input-row">
                <input
                  type="text"
                  className="settings-input"
                  placeholder="Username"
                  value={garminUsername}
                  onChange={(e) => setGarminUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGarminLogin()}
                />
              </div>
              <div className={`settings-input-row ${styles.mt8}`}>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Password"
                  value={garminPassword}
                  onChange={(e) => setGarminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGarminLogin()}
                />
              </div>
              {garminError && <div className="xert-error">{garminError}</div>}
              <button
                className={`btn-service btn-service-active ${styles.mt12}`}
                disabled={garminLogging || !garminUsername || !garminPassword}
                onClick={handleGarminLogin}
              >
                {garminLogging ? "Connecting..." : "Connect to Garmin"}
              </button>
            </div>
          ) : (
            <div className="xert-connected">
              <div className="xert-status-badge">Connected</div>

              {garminLoading && <div className={`settings-field-hint ${styles.mt8}`}>Loading health data...</div>}
              {garminError && <div className={`xert-error ${styles.mt8}`}>{garminError}</div>}

              <div className={`settings-field-hint ${styles.mt8}`}>
                Health data is displayed on the Health page.
              </div>

              <div className={styles.actionsRow}>
                <button className="btn-service btn-service-active" onClick={handleGarminRefresh} disabled={garminLoading}>
                  {garminLoading ? "Refreshing..." : "Refresh Data"}
                </button>
                <button className="btn-service btn-service-danger" onClick={handleGarminDisconnect}>
                  Disconnect
                </button>
              </div>
            </div>
          )}
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
              <div className={`settings-input-row ${styles.mt8}`}>
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
                className={`btn-service btn-service-active ${styles.mt12}`}
                disabled={logging || !username || !password}
                onClick={handleXertLogin}
              >
                {logging ? "Connecting..." : "Connect to XERT"}
              </button>
            </div>
          ) : (
            <div className="xert-connected">
              <div className="xert-status-badge">Connected</div>

              {loading && <div className={`settings-field-hint ${styles.mt8}`}>Loading training data...</div>}
              {error && <div className={`xert-error ${styles.mt8}`}>{error}</div>}

              <div className={`settings-field-hint ${styles.mt8}`}>
                XERT data is displayed on the Home page.
              </div>

              <div className={styles.actionsRow}>
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
