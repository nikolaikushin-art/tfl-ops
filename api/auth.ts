/** /api/auth — GET status, POST sign in, DELETE sign out. Logic lives in _lib/routes.ts */
import { authRoute } from "./_lib/routes";
import { kvFromEnv } from "./_lib/kv";

export default function handler(req: any, res: any) {
  const out = authRoute(
    { method: req.method, headers: req.headers ?? {}, body: req.body, query: req.query },
    { env: process.env, kv: kvFromEnv(process.env), now: new Date() },
  );
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
  res.setHeader("cache-control", "no-store");
  return res.status(out.status).json(out.body);
}
