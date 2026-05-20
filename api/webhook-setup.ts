import type { VercelRequest, VercelResponse } from "@vercel/node";

// One-time endpoint to register the Strava webhook subscription.
// Call with: POST /api/webhook-setup
//
// Required env vars (set in Vercel dashboard):
//   STRAVA_CLIENT_SECRET
//   STRAVA_WEBHOOK_VERIFY_TOKEN   — any random string you choose
//   VITE_STRAVA_CLIENT_ID
//
// Strava will immediately send a GET to /api/webhook to verify the endpoint,
// so the app must already be deployed before calling this.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return res.status(500).json({ error: "STRAVA_WEBHOOK_VERIFY_TOKEN is not set" });
  }

  // Derive callback URL from the request host (works for both Vercel preview and production).
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const callbackUrl = `${proto}://${host}/api/webhook`;

  const upstream = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.VITE_STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      callback_url: callbackUrl,
      verify_token: verifyToken,
    }),
  });

  const data = await upstream.json();
  return res.status(upstream.status).json({ callbackUrl, ...data });
}
