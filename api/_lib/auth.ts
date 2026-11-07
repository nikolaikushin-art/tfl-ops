/**
 * Server-side sign-in core (v111). Pure Node: no packages.
 * Passwords are never stored: TFL_USERS holds scrypt hashes made with
 * `node tools/hash-password.mjs`. Sessions are HMAC-signed, httpOnly cookies.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const COOKIE = "tfl_session";
export const SESSION_SECONDS = 7 * 24 * 3600;

export interface ServerUser { email: string; name: string; role: string; passwordHash: string }
export interface SessionUser { email: string; name: string; role: string }
interface Payload extends SessionUser { exp: number }

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, n, saltHex, hashHex] = String(stored).split("$");
  if (alg !== "scrypt" || !n || !saltHex || !hashHex) return false;
  try {
    const want = Buffer.from(hashHex, "hex");
    const got = scryptSync(password, Buffer.from(saltHex, "hex"), want.length, { N: Number(n), r: 8, p: 1 });
    return want.length === got.length && timingSafeEqual(want, got);
  } catch { return false; }
}

const DUMMY = hashPassword("tfl-dummy-not-a-password");

export function loadUsers(env: Record<string, string | undefined>): ServerUser[] {
  try {
    const list = JSON.parse(env.TFL_USERS || "[]");
    if (!Array.isArray(list)) return [];
    return list
      .filter((u) => u && typeof u.email === "string" && typeof u.passwordHash === "string")
      .map((u) => ({ email: u.email.trim().toLowerCase(), name: String(u.name || u.email), role: String(u.role || "administrator"), passwordHash: u.passwordHash }));
  } catch { return []; }
}

export function signToken(user: SessionUser, secret: string, nowSec: number, ttl = SESSION_SECONDS): string {
  const body = b64(JSON.stringify({ ...user, exp: nowSec + ttl } satisfies Payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string | undefined, secret: string, nowSec: number): SessionUser | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret).update(body).digest();
  let got: Buffer;
  try { got = Buffer.from(sig, "base64url"); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (typeof p.exp !== "number" || p.exp <= nowSec) return null;
    return { email: p.email, name: p.name, role: p.role };
  } catch { return null; }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const sessionCookie = (token: string, secure = true) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
export const clearCookie = (secure = true) =>
  `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;

/** Best-effort throttle (per server instance): 8 failures / 15 min per key. */
const fails = new Map<string, number[]>();
export function throttled(key: string, nowMs: number): boolean {
  const recent = (fails.get(key) ?? []).filter((t) => nowMs - t < 15 * 60_000);
  fails.set(key, recent);
  return recent.length >= 8;
}
export function noteFailure(key: string, nowMs: number) { fails.set(key, [...(fails.get(key) ?? []), nowMs]); }
export function clearFailures(key: string) { fails.delete(key); }

export function checkLogin(email: string, password: string, users: ServerUser[]): SessionUser | null {
  const u = users.find((x) => x.email === String(email).trim().toLowerCase());
  const ok = verifyPassword(String(password), u ? u.passwordHash : DUMMY);
  return u && ok ? { email: u.email, name: u.name, role: u.role } : null;
}
