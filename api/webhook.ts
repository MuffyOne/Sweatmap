import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

// Strava pushes activity events here.
// GET  — subscription verification handshake (one-time, during webhook-setup)
// POST — activity created / updated / deleted

interface StravaEvent {
  aspect_type: "create" | "update" | "delete";
  event_time: number;
  object_id: number;
  object_type: "activity" | "athlete";
  owner_id: number;
  subscription_id: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // Strava sends a GET with hub.challenge to verify the endpoint.
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).json({ "hub.challenge": challenge });
    }
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "POST") {
    // Acknowledge immediately — Strava requires a response within 2 seconds.
    res.status(200).end();

    const event = req.body as StravaEvent;
    if (event.object_type !== "activity") return;

    try {
      const redis = Redis.fromEnv();
      await redis.rpush("webhook_events", JSON.stringify({
        aspect_type: event.aspect_type,
        object_id: event.object_id,
        object_type: event.object_type,
      }));
      // Keep the queue bounded to the last 500 events.
      await redis.ltrim("webhook_events", -500, -1);
    } catch {
      // Redis not configured — silently ignore.
    }
    return;
  }

  return res.status(405).json({ error: "Method not allowed" });
}
