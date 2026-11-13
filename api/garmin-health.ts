import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { IOauth1Token, IOauth2Token } from "@gooin/garmin-connect/dist/garmin/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { oauth1, oauth2 } = (req.body ?? {}) as { oauth1?: IOauth1Token; oauth2?: IOauth2Token };
    if (!oauth1 || !oauth2) {
      return res.status(400).json({ error: "Missing Garmin tokens" });
    }

    // Loaded lazily, inside the try, so a load failure comes back as a readable error (see garmin-login.ts).
    const { garminFetchHealth, describeGarminError } = await import("./_garmin.js");
    try {
      const result = await garminFetchHealth(oauth1, oauth2);
      return res.status(200).json(result);
    } catch (e: unknown) {
      return res.status(401).json({ error: `Garmin health fetch failed: ${describeGarminError(e)}` });
    }
  } catch (e: unknown) {
    console.error("garmin-health crashed:", e);
    return res.status(500).json({ error: `Garmin health fetch crashed on the server: ${e instanceof Error ? e.message : String(e)}` });
  }
}
