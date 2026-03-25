import type { VercelRequest, VercelResponse } from "@vercel/node";

// Proxies XERT training_info endpoint because XERT doesn't set CORS headers.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const upstream = await fetch("https://www.xertonline.com/oauth/training_info", {
    headers: { Authorization: auth },
  });

  const data = await upstream.json();
  return res.status(upstream.status).json(data);
}
