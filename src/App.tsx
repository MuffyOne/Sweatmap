import React, { useEffect, useState } from "react";
import {
  getAuthUrl,
  getStoredTokens,
  exchangeCode,
  getCache,
  isCacheFresh,
  fetchAndCache,
  fetchNewActivities,
  syncAndCache,
  logout,
  type Activity,
  type SegmentEffort,
} from "./api/strava";
import { Dashboard, type Page } from "./Dashboard";
import {
  HomeIcon, ZapIcon, ListIcon, LogOutIcon, SyncIcon,
  FitnessIcon, TrophyIcon, SettingsIcon, ChevronLeftIcon, ChevronRightIcon,
} from "./lib/icons";
import "./App.css";

function formatTimeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const NAV_ITEMS: { id: Page; label: string; Icon: () => React.ReactElement }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "fitness", label: "Fitness", Icon: FitnessIcon },
  { id: "performance", label: "Performance", Icon: ZapIcon },
  { id: "activities", label: "Activities", Icon: ListIcon },
  { id: "records", label: "Records", Icon: TrophyIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

const PAGE_TITLES: Record<Page, string> = {
  home: "Overview",
  fitness: "Fitness",
  records: "Records",
  performance: "Performance",
  activities: "Activities",
  settings: "Settings",
};

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [koms, setKoms] = useState<SegmentEffort[]>([]);
  const [athleteName, setAthleteName] = useState<string>("");
  const [athleteAvatar, setAthleteAvatar] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [fetchedCount, setFetchedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [page]);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(() => getCache()?.cachedAt ?? null);

  const [forceSyncing, setForceSyncing] = useState(false);

  async function handleForceSync() {
    if (syncing || refreshing || forceSyncing) return;
    setForceSyncing(true);
    setFetchedCount(0);
    try {
      const { athlete, activities: data, koms: komData } = await syncAndCache(setFetchedCount);
      setAthleteName(`${athlete.firstname} ${athlete.lastname}`);
      setAthleteAvatar(athlete.profile_medium ?? "");
      setActivities(data);
      setKoms(komData);
      setLastSynced(Date.now());
    } catch {
      // silently ignore — existing data stays intact
    } finally {
      setForceSyncing(false);
    }
  }

  async function handleSync() {
    if (syncing || refreshing) return;
    setSyncing(true);
    setFetchedCount(0);
    try {
      if (activities.length === 0) {
        const { athlete, activities: data, koms: komData } = await fetchAndCache(setFetchedCount);
        setAthleteName(`${athlete.firstname} ${athlete.lastname}`);
        setAthleteAvatar(athlete.profile_medium ?? "");
        setActivities(data);
        setKoms(komData);
      } else {
        const merged = await fetchNewActivities(activities, setFetchedCount);
        setActivities(merged);
      }
      setLastSynced(Date.now());
    } catch {
      // silently ignore — existing data stays intact
    } finally {
      setSyncing(false);
    }
  }

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
        setKoms(cache.koms ?? []);
        setLoading(false);
        if (isCacheFresh(cache)) return;
        setRefreshing(true);
      }

      try {
        const { athlete, activities: data, koms: komData } = await fetchAndCache(setFetchedCount);
        setAthleteName(`${athlete.firstname} ${athlete.lastname}`);
        setAthleteAvatar(athlete.profile_medium ?? "");
        setActivities(data);
        setKoms(komData);
        setLastSynced(Date.now());
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
          <p className="login-privacy">
            This app reads your Strava activities to display personal stats.
            Your data is stored only in your browser's local storage and is never sent to any server.
            Disconnecting (logout) permanently deletes all stored data from your browser.
          </p>
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
          className="sidebar-item"
          onClick={handleSync}
          disabled={syncing || refreshing}
          title={lastSynced ? `Sync new activities · Last synced ${formatTimeAgo(lastSynced)}` : "Sync new activities only"}
        >
          <SyncIcon />
          <span>{syncing ? "Syncing…" : "Sync"}</span>
        </button>

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
        <Dashboard activities={activities} koms={koms} page={page} onNavigate={setPage} onForceSync={handleForceSync} forceSyncing={forceSyncing} fetchedCount={fetchedCount} />
      </main>
    </div>
  );
}

export default App;
