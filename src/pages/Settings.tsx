import { useState } from "react";

export const FTP_KEY = "power_zones_ftp";
export const AGE_KEY = "settings_age";

interface Props {
  onForceSync: () => Promise<void>;
  forceSyncing: boolean;
  fetchedCount: number;
}

export function Settings({ onForceSync, forceSyncing, fetchedCount }: Props) {
  const [ftp, setFtp] = useState(() => localStorage.getItem(FTP_KEY) ?? "");
  const [age, setAge] = useState(() => localStorage.getItem(AGE_KEY) ?? "");

  function handleFtp(val: string) {
    setFtp(val);
    localStorage.setItem(FTP_KEY, val);
    localStorage.removeItem("power_zones_30d");
    localStorage.removeItem("power_zones_90d");
  }

  function handleAge(val: string) {
    setAge(val);
    localStorage.setItem(AGE_KEY, val);
    localStorage.removeItem("hr_zones_v2_30d");
    localStorage.removeItem("hr_zones_v2_90d");
  }

  const ftpVal = parseInt(ftp, 10);
  const ageVal = parseInt(age, 10);
  const ftpValid = !isNaN(ftpVal) && ftpVal > 0;
  const ageValid = !isNaN(ageVal) && ageVal > 0 && ageVal < 120;
  const maxHR = ageValid ? 220 - ageVal : null;

  return (
    <div className="settings-page">
      <div className="settings-section">
        <div className="settings-field">
          <div className="settings-field-label">FTP — Functional Threshold Power</div>
          <div className="settings-field-hint">
            Your one-hour maximal power output. Used to calculate power zones on the Performance page.
          </div>
          <div className="settings-input-row">
            <input
              type="number"
              className="settings-input"
              value={ftp}
              min={1}
              placeholder="e.g. 250"
              onChange={(e) => handleFtp(e.target.value)}
            />
            <span className="settings-unit">W</span>
          </div>
          {ftpValid && (
            <div className="settings-computed">Z4 Threshold starts at {Math.round(ftpVal * 0.9)}–{Math.round(ftpVal * 1.05)} W</div>
          )}
        </div>

        <div className="settings-field">
          <div className="settings-field-label">Age</div>
          <div className="settings-field-hint">
            Used to estimate your max heart rate (220 − age) and compute HR zones on the Performance page.
          </div>
          <div className="settings-input-row">
            <input
              type="number"
              className="settings-input"
              value={age}
              min={1}
              max={120}
              placeholder="e.g. 32"
              onChange={(e) => handleAge(e.target.value)}
            />
            <span className="settings-unit">years</span>
          </div>
          {ageValid && maxHR && (
            <div className="settings-computed">
              Estimated max HR: {maxHR} bpm &nbsp;·&nbsp;
              Z2 Aerobic: {Math.round(maxHR * 0.6)}–{Math.round(maxHR * 0.7)} bpm &nbsp;·&nbsp;
              Z4 Threshold: {Math.round(maxHR * 0.8)}–{Math.round(maxHR * 0.9)} bpm
            </div>
          )}
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-field">
          <div className="settings-field-label">Force Sync</div>
          <div className="settings-field-hint">
            Re-fetches all activities from the last year from Strava. Use this to pick up renamed or deleted activities. Regular sync only fetches new ones.
          </div>
          <div className="settings-input-row">
            <button
              className="btn-compute"
              onClick={onForceSync}
              disabled={forceSyncing}
              title="Re-fetches the last year of activities from Strava, picking up any renames or deletions"
            >
              {forceSyncing ? `Fetching… ${fetchedCount > 0 ? `(${fetchedCount})` : ""}` : "Force Sync"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
