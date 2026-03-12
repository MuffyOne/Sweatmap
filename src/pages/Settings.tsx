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
      <div className="settings-bmac">
        <a
          href="https://buymeacoffee.com/muffyzzg"
          target="_blank"
          rel="noopener noreferrer"
          className="bmac-link"
        >
          <svg className="bmac-icon" viewBox="0 0 884 1279" xmlns="http://www.w3.org/2000/svg">
            <path d="M791.109 297.518L790.231 297.002L788.201 296.383C789.018 297.072 790.04 297.472 791.109 297.518Z"/>
            <path d="M803.896 388.891L802.916 389.166L803.896 388.891Z"/>
            <path d="M791.484 297.377C791.359 297.361 791.232 297.353 791.109 297.518C791.232 297.353 791.359 297.361 791.484 297.377Z"/>
            <path d="M788.201 296.383C787.855 296.285 787.517 296.174 787.205 296.021C787.517 296.174 787.855 296.285 788.201 296.383Z"/>
            <path d="M803.111 388.726C803.338 388.659 803.564 388.592 803.896 388.891C803.564 388.592 803.338 388.659 803.111 388.726Z"/>
            <path d="M207.395 1197.5C207.395 1222.45 225.385 1243 247.19 1243H636.81C658.615 1243 676.605 1222.45 676.605 1197.5V1155H207.395V1197.5Z"/>
            <path d="M198 456H686L668.01 1125H216.01L198 456Z"/>
            <path d="M491.494 55.5H492.506C507.31 55.5 519.5 43.3 519.5 28.5C519.5 13.7 507.31 1.5 492.506 1.5H491.494C476.69 1.5 464.5 13.7 464.5 28.5C464.5 43.3 476.69 55.5 491.494 55.5Z"/>
            <path d="M652.238 55.5H653.25C668.054 55.5 680.244 43.3 680.244 28.5C680.244 13.7 668.054 1.5 653.25 1.5H652.238C637.434 1.5 625.244 13.7 625.244 28.5C625.244 43.3 637.434 55.5 652.238 55.5Z"/>
            <path d="M330.762 55.5H331.774C346.578 55.5 358.768 43.3 358.768 28.5C358.768 13.7 346.578 1.5 331.774 1.5H330.762C315.958 1.5 303.768 13.7 303.768 28.5C303.768 43.3 315.958 55.5 330.762 55.5Z"/>
            <path d="M441 411H443C456.807 411 468 399.807 468 386V175C468 161.193 456.807 150 443 150H441C427.193 150 416 161.193 416 175V386C416 399.807 427.193 411 441 411Z"/>
            <path d="M601 411H603C616.807 411 628 399.807 628 386V175C628 161.193 616.807 150 603 150H601C587.193 150 576 161.193 576 175V386C576 399.807 587.193 411 601 411Z"/>
            <path d="M281 411H283C296.807 411 308 399.807 308 386V175C308 161.193 296.807 150 283 150H281C267.193 150 256 161.193 256 175V386C256 399.807 267.193 411 281 411Z"/>
          </svg>
          <span>Buy me a coffee</span>
        </a>
      </div>
    </div>
  );
}
