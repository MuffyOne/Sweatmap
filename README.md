# Strava Dashboard

A personal analytics dashboard for your Strava activities. All data is fetched directly from the Strava API and stored entirely in your browser's local storage — nothing is sent to any server beyond Strava itself.

## Features

### Home
Period-based summary (this week / month / year, last 7 / 30 days) with activity count, distance, time, elevation, heart rate, power, and configurable distance goals. Includes a comparison delta against the previous period, a sport breakdown chart, and a 12-month calendar heatmap.

### Fitness
CTL/ATL fitness tracking chart with form zones (peak form, neutral, fresh, fatigued). Data source indicator for Strava vs XERT when both are connected.

### Performance
- **Power Curve** — mean-maximal power across configurable durations (1 s to 6 h), adapting automatically to the duration of your longest activity. An all-time best overlay (dashed) sits alongside the selected-period curve so you can compare your current form to your historical peak.
- **Power Zone Distribution** — time in each of Coggan's 7 power zones for the last 30 or 90 days, with a training distribution breakdown (Polarized / Pyramidal / Threshold / Sweet Spot match).
- **HR Zone Distribution** — time in 5 heart-rate zones (estimated from age).
- **Temperature vs Performance** — scatter plot of average temperature vs speed or power across all activities.

### Activities
Filterable, sortable activity list with inline detail view (lap splits, elevation, cadence, power streams).

### Records
All-time PR count, current and longest PR streak, PRs by sport, top activities by PR count, and KOM/QOM segment list.

### Services / XERT
Connect your XERT account to pull in your fitness signature (FTP, LTP, HIE, Peak Power), training load breakdown, and Workout of the Day with an interval visualiser.

### Settings
Set FTP and age (used for power and HR zone calculations), configure weekly and yearly distance goals, and force-sync all activities from the past year.

---

## Tech Stack

| Layer | Library |
|---|---|
| UI | React 19 |
| Language | TypeScript |
| Build | Vite 7 |
| Charts | Recharts 3 |
| Date utilities | date-fns 4 |
| CSS | CSS Modules + clsx |

---

## Local Development

### 1. Create a Strava API application

Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app. Set the **Authorization Callback Domain** to `localhost`.

Note your **Client ID** and **Client Secret**.

### 2. Configure environment variables

Copy `.env.example` (or create `.env.local`) in the project root:

```
VITE_STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret   # server-only, never in VITE_ prefix
```

### 3. Install and run

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Mock data mode

To develop without a Strava account, run with the mock flag:

```bash
VITE_MOCK_DATA=true npm run dev
```

This swaps the real Strava API module for a deterministic fake that generates a year of realistic activities (rides and runs) using a seeded PRNG. You are logged in automatically — no OAuth required.

---

## Deployment

### Vercel (recommended)

The `api/` directory contains Vercel serverless functions that proxy the Strava OAuth token exchange, keeping `STRAVA_CLIENT_SECRET` off the client.

1. Push the repo to GitHub and import it into Vercel.
2. Set the following environment variables in the Vercel dashboard:
   - `VITE_STRAVA_CLIENT_ID` — your Strava app's client ID
   - `STRAVA_CLIENT_SECRET` — your Strava app's client secret *(server-only)*
3. Set the **Authorization Callback Domain** in your Strava app to your Vercel deployment URL.

### Self-hosted (PHP)

A PHP backend alternative is available for shared hosting environments. Copy `strava_config.example.php` to `strava_config.php` one level above your web root (so it is never publicly accessible) and fill in your credentials. The PHP proxy endpoints mirror the Vercel API routes.

---

## Privacy

- All activity data is stored in `localStorage` in your browser only.
- The OAuth client secret never reaches the browser — it lives exclusively in the server-side proxy (Vercel or PHP).
- Logging out clears all stored tokens and cached data from your browser.
- No analytics, no tracking, no external services beyond Strava and (optionally) XERT.
