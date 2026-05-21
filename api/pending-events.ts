import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

// GET  — returns all queued Strava webhook events (called by the client on load)
// DELETE — clears the queue after the client has processed them

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const redis = Redis.fromEnv();
      const raw = await redis.lrange("webhook_events", 0, -1);
      const events = raw.map((e) => (typeof e === "string" ? JSON.parse(e) : e));
      return res.status(200).json(events);
    } catch {
      // Redis not configured — return empty list so the client continues normally.
      return res.status(200).json([]);
    }
  }

  if (req.method === "DELETE") {
    try {
      const redis = Redis.fromEnv();
      await redis.del("webhook_events");
    } catch {
      // Redis not configured — silently ignore.
    }
    return res.status(204).end();
  }

  return res.status(405).json({ error: "Method not allowed" });
}
