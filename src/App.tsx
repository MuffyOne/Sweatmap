import { useEffect, useState } from "react";
import {
  getAuthUrl,
  getStoredTokens,
  exchangeCode,
  fetchAthlete,
  fetchAllActivities,
  logout,
  type Activity,
} from "./strava";
import { Dashboard } from "./Dashboard";
import "./App.css";

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [athleteName, setAthleteName] = useState<string>("");
  const [loading, setLoading] = useState(true);
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
      try {
        const [athlete, data] = await Promise.all([fetchAthlete(), fetchAllActivities()]);
        setAthleteName(`${athlete.firstname} ${athlete.lastname}`);
        setActivities(data);
      } catch (e) {
        setError(`Failed to fetch activities: ${e}`);
      }
      setLoading(false);
    }
    init();
  }, []);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading your Strava data...</div>
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
        <h1>{athleteName ? `${athleteName}'s Dashboard` : "Strava Dashboard"}</h1>
        <button onClick={logout} className="btn-logout">
          Logout
        </button>
      </header>
      <Dashboard activities={activities} />
    </div>
  );
}

export default App;
