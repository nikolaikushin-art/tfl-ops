/** Framework-free request handlers so they can be tested without a server. */
import {
  checkLogin, clearCookie, clearFailures, loadUsers, noteFailure, parseCookies, sessionCookie,
  signToken, throttled, verifyToken, COOKIE, type SessionUser,
} from "./auth";
import type { KV } from "./kv";
import { listBackups, pushSnapshot, readBackup, readSnapshot } from "./sync";

export interface Req { method: string; headers: Record<string, string | undefined>; body?: any; query?: Record<string, string | undefined> }
export interface Out { status: number; body: unknown; headers?: Record<string, string> }
export interface Ctx { env: Record<string, string | undefined>; kv: KV | null; now: Date }

const json = (status: number, body: unknown, headers?: Record<string, string>): Out => ({ status, body, headers });
const secureCookies = (env: Ctx["env"]) => env.TFL_INSECURE_COOKIES !== "1";
const nowSec = (c: Ctx) => Math.floor(c.now.getTime() / 1000);

export function sessionOf(req: Req, ctx: Ctx): SessionUser | null {
  const secret = ctx.env.TFL_SESSION_SECRET || "";
  if (secret.length < 32) return null;
  return verifyToken(parseCookies(req.headers.cookie)[COOKIE], secret, nowSec(ctx));
}

/** Mutating calls must carry a custom header: a cross-site form cannot add one. */
const csrfOk = (req: Req) => req.headers["x-tfl"] === "1";

export function authRoute(req: Req, ctx: Ctx): Out {
  const users = loadUsers(ctx.env);
  const secret = ctx.env.TFL_SESSION_SECRET || "";
  const configured = users.length > 0 && secret.length >= 32;
  if (req.method === "GET") return json(200, { configured, storage: !!ctx.kv, user: configured ? sessionOf(req, ctx) : null });
  if (!configured) return json(503, { error: "Server sign-in is not set up. See SERVER-SETUP.md." });
  if (!csrfOk(req)) return json(403, { error: "Missing request header." });
  if (req.method === "DELETE") return json(200, { ok: true }, { "set-cookie": clearCookie(secureCookies(ctx.env)) });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const key = `${req.headers["x-forwarded-for"] ?? "ip"}|${email}`;
  const t = ctx.now.getTime();
  if (throttled(key, t)) return json(429, { error: "Too many attempts. Wait 15 minutes." });
  const user = checkLogin(email, String(req.body?.password ?? ""), users);
  if (!user) { noteFailure(key, t); return json(401, { error: "Invalid email or password." }); }
  clearFailures(key);
  return json(200, { user }, { "set-cookie": sessionCookie(signToken(user, secret, nowSec(ctx)), secureCookies(ctx.env)) });
}

export async function stateRoute(req: Req, ctx: Ctx): Promise<Out> {
  const user = sessionOf(req, ctx);
  if (!user) return json(401, { error: "Sign in required." });
  if (!ctx.kv) return json(503, { error: "No database connected. See SERVER-SETUP.md." });
  if (req.method === "GET") {
    if (req.query?.backups !== undefined) return json(200, { backups: await listBackups(ctx.kv) });
    if (req.query?.backup) {
      if (user.role !== "administrator") return json(403, { error: "Administrators only." });
      const b = await readBackup(ctx.kv, req.query.backup);
      return b ? json(200, b) : json(404, { error: "No backup for that date." });
    }
    const s = await readSnapshot(ctx.kv);
    return json(200, s ?? { version: 0, data: null });
  }
  if (req.method !== "PUT") return json(405, { error: "Method not allowed" });
  if (!csrfOk(req)) return json(403, { error: "Missing request header." });
  if (user.role === "readonly") return json(403, { error: "Your account is read-only." });
  const r = await pushSnapshot(ctx.kv, req.body?.baseVersion, req.body?.data, user.email, ctx.now);
  if (r.ok) return json(200, r.snapshot);
  return json(r.code, { error: r.error, current: r.current });
}
