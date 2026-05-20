import React, { useEffect, useState } from "react";
import {
  getAuthUrl,
  getStoredTokens,
  exchangeCode,
  loadCache,
  isCacheFresh,
  fetchAndCache,
  syncAndCache,
  processPendingWebhookEvents,
  updateCachedActivities,
  logout,
  type Activity,
  type SegmentEffort,
} from "./api/strava";
import { Dashboard, type Page } from "./Dashboard";
import { WHATS_NEW_VERSION } from "./pages/WhatsNewPage";
import {
  HomeIcon, ZapIcon, ListIcon, LogOutIcon,
  FitnessIcon, TrophyIcon, SettingsIcon, ServicesIcon, XertIcon, ChevronLeftIcon, ChevronRightIcon,
  SunIcon, MoonIcon, SparkleIcon, MapIcon,
} from "./lib/icons";
import "./App.css";


const NAV_ITEMS: { id: Page; label: string; Icon: () => React.ReactElement; condition?: () => boolean }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "fitness", label: "Fitness", Icon: FitnessIcon },
  { id: "performance", label: "Performance", Icon: ZapIcon },
  { id: "activities", label: "Activities", Icon: ListIcon },
  { id: "records", label: "Records", Icon: TrophyIcon },
  { id: "xert", label: "XERT", Icon: XertIcon, condition: () => !!localStorage.getItem("xert_tokens") },
  { id: "services", label: "Services", Icon: ServicesIcon },
  { id: "map", label: "Heatmap", Icon: MapIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

const PAGE_TITLES: Record<Page, string> = {
  home: "Overview",
  fitness: "Fitness",
  records: "Records",
  performance: "Performance",
  activities: "Activities",
  xert: "XERT",
  services: "Services",
  map: "Heatmap",
  settings: "Settings",
  whatsNew: "What's New",
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
  const [, setTick] = useState(0);
  const refreshNav = () => setTick((t) => t + 1);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.body.classList.toggle("light", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("theme")) return; // only follow system if no explicit override
      setTheme(e.matches ? "light" : "dark");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [page]);
  const [forceSyncing, setForceSyncing] = useState(false);
  const [whatsNewSeen, setWhatsNewSeen] = useState(
    () => localStorage.getItem("whats_new_seen") === WHATS_NEW_VERSION
  );

  async function handleForceSync() {
    if (refreshing || forceSyncing) return;
    // Clear computed performance caches so they recompute with fresh stream data
    ["30d", "90d"].forEach((r) => localStorage.removeItem(`power_curve_${r}`));
    localStorage.removeItem("power_curve_alltime");
    ["30d", "90d"].forEach((r) => {
      localStorage.removeItem(`power_zones_${r}`);
      localStorage.removeItem(`hr_zones_v2_${r}`);
    });
    setForceSyncing(true);
    setFetchedCount(0);
    try {
      const { athlete, activities: data, koms: komData } = await syncAndCache(setFetchedCount);
      setAthleteName(`${athlete.firstname} ${athlete.lastname}`);
      setAthleteAvatar(athlete.profile_medium ?? "");
      setActivities(data);
      setKoms(komData);
    } catch {
      // silently ignore — existing data stays intact
    } finally {
      setForceSyncing(false);
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

      const cache = await loadCache();
      if (cache) {
        setAthleteName(`${cache.athlete.firstname} ${cache.athlete.lastname}`);
        setAthleteAvatar(cache.athlete.profile_medium ?? "");
        setActivities(cache.activities);
        setKoms(cache.koms ?? []);
        setLoading(false);
        if (isCacheFresh(cache)) {
          // Apply any webhook events that arrived while the app was closed.
          const updated = await processPendingWebhookEvents(cache.activities);
          if (updated) {
            setActivities(updated);
            await updateCachedActivities(updated);
          }
          return;
        }
        setRefreshing(true);
      }

      try {
        const { athlete, activities: data, koms: komData } = await fetchAndCache(setFetchedCount);
        setAthleteName(`${athlete.firstname} ${athlete.lastname}`);
        setAthleteAvatar(athlete.profile_medium ?? "");
        setActivities(data);
        setKoms(komData);
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
        {import.meta.env.VITE_MOCK_DATA === "true" && (
          <div className="mock-badge">MOCK DATA</div>
        )}

        <div className="sidebar-nav">
          {NAV_ITEMS.filter((item) => !item.condition || item.condition()).map(({ id, label, Icon }) => (
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
          onClick={() => setTheme((t) => t === "dark" ? "light" : "dark")}
          title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>

        <button
          className={`sidebar-item${page === "whatsNew" ? " active" : ""}`}
          onClick={() => {
            setPage("whatsNew");
            if (!whatsNewSeen) {
              localStorage.setItem("whats_new_seen", WHATS_NEW_VERSION);
              setWhatsNewSeen(true);
            }
          }}
          title={collapsed ? "What's New" : undefined}
        >
          <SparkleIcon />
          <span>What's New</span>
          {!whatsNewSeen && <span className="sidebar-new-badge" aria-label="New updates" />}
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
        <Dashboard activities={activities} koms={koms} page={page} onNavigate={setPage} onForceSync={handleForceSync} forceSyncing={forceSyncing} fetchedCount={fetchedCount} onXertChange={refreshNav} />
      </main>
    </div>
  );
}

export default App;
