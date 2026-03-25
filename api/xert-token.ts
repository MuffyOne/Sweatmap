import type { VercelRequest, VercelResponse } from "@vercel/node";

// Proxies XERT OAuth login (password grant) and token refresh.
// The public client credentials are not secret, but XERT doesn't
// set CORS headers so we must proxy from the server.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { grant_type, username, password, refresh_token } = req.body as {
    grant_type?: string;
    username?: string;
    password?: string;
    refresh_token?: string;
  };

  if (!grant_type) {
    return res.status(400).json({ error: "Missing grant_type" });
  }

  const params = new URLSearchParams({ grant_type });

  if (grant_type === "password") {
    if (!username || !password) {
      return res.status(400).json({ error: "Missing username or password" });
    }
    params.set("username", username);
    params.set("password", password);
  } else if (grant_type === "refresh_token") {
    if (!refresh_token) {
      return res.status(400).json({ error: "Missing refresh_token" });
    }
    params.set("refresh_token", refresh_token);
  } else {
    return res.status(400).json({ error: "Invalid grant_type" });
  }

  const upstream = await fetch("https://www.xertonline.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from("xert_public:xert_public").toString("base64"),
    },
    body: params.toString(),
  });

  const data = await upstream.json();
  return res.status(upstream.status).json(data);
}
