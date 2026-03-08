import type { VercelRequest, VercelResponse } from "@vercel/node";

// Proxies the Strava token refresh so STRAVA_CLIENT_SECRET never reaches
// the browser. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET as server-only
// environment variables in the Vercel dashboard (no VITE_ prefix).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { refresh_token } = req.body as { refresh_token?: string };
  if (!refresh_token) {
    return res.status(400).json({ error: "Missing refresh_token" });
  }

  const upstream = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await upstream.json();
  return res.status(upstream.status).json(data);
}
