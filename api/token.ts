import type { VercelRequest, VercelResponse } from "@vercel/node";

// Proxies the Strava authorization_code exchange so STRAVA_CLIENT_SECRET
// never reaches the browser. VITE_STRAVA_CLIENT_ID is reused (not sensitive).
// Set STRAVA_CLIENT_SECRET as a server-only env var in the Vercel dashboard.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code } = req.body as { code?: string };
  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  const upstream = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.VITE_STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  const data = await upstream.json();
  return res.status(upstream.status).json(data);
}
