/** /api/state — GET latest snapshot (or ?backups / ?backup=YYYY-MM-DD), PUT {baseVersion,data}. */
import { stateRoute } from "./_lib/routes";
import { kvFromEnv } from "./_lib/kv";

export default async function handler(req: any, res: any) {
  try {
    const out = await stateRoute(
      { method: req.method, headers: req.headers ?? {}, body: req.body, query: req.query },
      { env: process.env, kv: kvFromEnv(process.env), now: new Date() },
    );
    for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
    res.setHeader("cache-control", "no-store");
    return res.status(out.status).json(out.body);
  } catch {
    return res.status(502).json({ error: "Database unreachable." });
  }
}
