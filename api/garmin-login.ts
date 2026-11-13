import type { VercelRequest, VercelResponse } from "@vercel/node";
import { garminLogin, describeGarminError } from "./_garmin";

// Garmin Connect has no public OAuth API — this logs into the same internal
// SSO flow the Garmin Connect app/website uses, via an unofficial library.
// Runs only server-side: the password never reaches the browser bundle.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ error: "Missing username or password" });
  }

  try {
    const tokens = await garminLogin(username, password);
    return res.status(200).json(tokens);
  } catch (e: unknown) {
    return res.status(401).json({ error: `Garmin login failed: ${describeGarminError(e)}` });
  }
}
