import { useEffect, useState } from "react";
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
import { Dashboard } from "./Dashboard";
import "./App.css";

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [athleteName, setAthleteName] = useState<string>("");
  const [athleteAvatar, setAthleteAvatar] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [fetchedCount, setFetchedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        try {
          await exchangeCode(code);
          window.history.replaceState({}, "", "/");
        } catch {
          setError("Failed to authenticate with Strava");
          setLoading(false);
          return;
        }
      }

      const tokens = getStoredTokens();
      if (!tokens) {
        setLoading(false);
        return;
      }

      setAuthenticated(true);

      // Load from cache immediately if available
      const cache = getCache();
      if (cache) {
        setAthleteName(`${cache.athlete.firstname} ${cache.athlete.lastname}`);
        setAthleteAvatar(cache.athlete.profile_medium ?? "");
        setActivities(cache.activities);
        setLoading(false);
        if (isCacheFresh(cache)) return; // Cache is fresh, skip refetch
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
              style={{ width: fetchedCount > 0 ? `${Math.min((fetchedCount / 400) * 100, 90)}%` : undefined }}
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
    <div className="app">
      <header className="header">
        <h1>
          {athleteAvatar && (
            <img src={athleteAvatar} alt="" className="athlete-avatar" />
          )}
          {athleteName ? `${athleteName}'s Dashboard` : "Strava Dashboard"}
          {refreshing && <span className="refreshing-badge">Updating…</span>}
        </h1>
        <button onClick={logout} className="btn-logout">
          Logout
        </button>
      </header>
      <Dashboard activities={activities} />
    </div>
  );
}

export default App;
