import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

// GET  — returns all queued Strava webhook events (called by the client on load)
// DELETE — clears the queue after the client has processed them

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const raw = await kv.lrange("webhook_events", 0, -1);
      const events = raw.map((e) => (typeof e === "string" ? JSON.parse(e) : e));
      return res.status(200).json(events);
    } catch {
      // KV not configured — return empty list so the client continues normally.
      return res.status(200).json([]);
    }
  }

  if (req.method === "DELETE") {
    try {
      await kv.del("webhook_events");
    } catch {
      // KV not configured — silently ignore.
    }
    return res.status(204).end();
  }

  return res.status(405).json({ error: "Method not allowed" });
}
