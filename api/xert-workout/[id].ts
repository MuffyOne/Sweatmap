import type { VercelRequest, VercelResponse } from "@vercel/node";

// Proxies XERT workout detail endpoint because XERT doesn't set CORS headers.
// URL pattern: /api/xert-workout/[id]
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  // Extract workout ID from the URL path
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) {
    return res.status(400).json({ error: "Missing workout id" });
  }

  const upstream = await fetch(`https://www.xertonline.com/oauth/workout/${encodeURIComponent(id)}`, {
    headers: { Authorization: auth },
  });

  const data = await upstream.json();
  return res.status(upstream.status).json(data);
}
