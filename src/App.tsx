import React, { useEffect, useState } from "react";
import {
  getAuthUrl,
  getStoredTokens,
  exchangeCode,
  getCache,
  isCacheFresh,
  fetchAndCache,
  logout,
  type Activity,
} from "./strava";
import { Dashboard, type Page } from "./Dashboard";
import "./App.css";

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15,18 9,12 15,6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9,18 15,12 9,6" />
    </svg>
  );
}

const NAV_ITEMS: { id: Page; label: string; Icon: () => React.ReactElement }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "performance", label: "Performance", Icon: ZapIcon },
  { id: "activities", label: "Activities", Icon: ListIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

const PAGE_TITLES: Record<Page, string> = {
  home: "Overview",
  performance: "Performance",
  activities: "Activities",
  settings: "Settings",
};

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [athleteName, setAthleteName] = useState<string>("");
  const [athleteAvatar, setAthleteAvatar] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [fetchedCount, setFetchedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    async function init() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        try {
          await exchangeCode(code);
        } catch {
          // If tokens are already stored (e.g. auth code was already exchanged),
          // continue normally instead of showing an error.
          if (!getStoredTokens()) {
            setError("Failed to authenticate with Strava. Please try connecting again.");
            setLoading(false);
            return;
          }
        }
        window.history.replaceState({}, "", "/");
      }

      const tokens = getStoredTokens();
      if (!tokens) {
        setLoading(false);
        return;
      }

      setAuthenticated(true);

      const cache = getCache();
      if (cache) {
        setAthleteName(`${cache.athlete.firstname} ${cache.athlete.lastname}`);
        setAthleteAvatar(cache.athlete.profile_medium ?? "");
        setActivities(cache.activities);
        setLoading(false);
        if (isCacheFresh(cache)) return;
        setRefreshing(true);
      }

      try {
        const { athlete, activities: data } = await fetchAndCache(setFetchedCount);
        setAthleteName(`${athlete.firstname} ${athlete.lastname}`);
        setAthleteAvatar(athlete.profile_medium ?? "");
        setActivities(data);
      } catch (e) {
        if (!cache) setError(`Failed to fetch activities: ${e}`);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }
    init();
  }, []);

  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="loading-title">Loading your Strava data…</div>
          {fetchedCount > 0 && (
            <div className="loading-count">Fetched {fetchedCount} activities</div>
          )}
          <div className="loading-bar-track">
            <div
              className="loading-bar-fill"
              style={{
                width: fetchedCount > 0 ? `${Math.min((fetchedCount / 400) * 100, 90)}%` : undefined,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="app">
        <div className="login">
          <h1>Strava Dashboard</h1>
          <p>Connect your Strava account to see your stats.</p>
          <a href={getAuthUrl()} className="btn-strava">
            Connect with Strava
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      <nav className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="sidebar-profile">
          {athleteAvatar && <img src={athleteAvatar} alt="" className="athlete-avatar" />}
          <div className="sidebar-profile-info">
            <span className="sidebar-profile-name">{athleteName}</span>
            {refreshing && <span className="refreshing-badge">Updating…</span>}
          </div>
        </div>

        <div className="sidebar-nav">
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`sidebar-item${page === id ? " active" : ""}`}
              onClick={() => setPage(id)}
              title={collapsed ? label : undefined}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-spacer" />

        <button
          className="sidebar-item sidebar-logout"
          onClick={logout}
          title={collapsed ? "Logout" : undefined}
        >
          <LogOutIcon />
          <span>Logout</span>
        </button>

        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <h2 className="page-title">{PAGE_TITLES[page]}</h2>
        </div>
        <Dashboard activities={activities} page={page} />
      </main>
    </div>
  );
}

export default App;
