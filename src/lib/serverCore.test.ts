import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken, parseCookies, loadUsers } from "../../api/_lib/auth";
import { memoryKV, upstashKV } from "../../api/_lib/kv";
import { pushSnapshot, readSnapshot, listBackups, readBackup, KEEP_BACKUPS } from "../../api/_lib/sync";
import { authRoute, stateRoute, sessionOf } from "../../api/_lib/routes";

const SECRET = "x".repeat(40);
const T0 = new Date("2026-10-07T10:00:00Z");
const mkEnv = () => ({
  TFL_SESSION_SECRET: SECRET,
  TFL_USERS: JSON.stringify([{ email: "roni@thefilmlocation.com", name: "Roni", role: "administrator", passwordHash: hashPassword("correct horse battery") }]),
});
const H = { "x-tfl": "1" };
const login = (env: any, pw = "correct horse battery", now = T0) =>
  authRoute({ method: "POST", headers: { ...H, "x-forwarded-for": "1.1.1.1" }, body: { email: "roni@thefilmlocation.com", password: pw } }, { env, kv: null, now });
const cookieOf = (o: any) => String(o.headers?.["set-cookie"]).split(";")[0];

describe("passwords and session tokens", () => {
  it("hashes are salted and verify only the right password", () => {
    const a = hashPassword("secret-password-1"), b = hashPassword("secret-password-1");
    expect(a === b).toBe(false);
    expect(verifyPassword("secret-password-1", a)).toBe(true);
    expect(verifyPassword("secret-password-2", a)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
  it("tokens verify, expire and reject tampering or a wrong secret", () => {
    const t = signToken({ email: "a@b.c", name: "A", role: "administrator" }, SECRET, 1000, 60);
    expect(verifyToken(t, SECRET, 1010)?.email).toBe("a@b.c");
    expect(verifyToken(t, SECRET, 1061)).toBeNull();
    expect(verifyToken(t, "y".repeat(40), 1010)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ email: "a@b.c", name: "A", role: "administrator", exp: 9e9 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, SECRET, 1010)).toBeNull();
    expect(verifyToken(undefined, SECRET, 1010)).toBeNull();
    expect(body.length > 0).toBe(true);
  });
  it("reads cookies and bad user lists safely", () => {
    expect(parseCookies("a=1; tfl_session=abc.def")["tfl_session"]).toBe("abc.def");
    expect(loadUsers({ TFL_USERS: "not json" })).toEqual([]);
    expect(loadUsers({})).toEqual([]);
  });
});

describe("/api/auth", () => {
  it("reports not configured without users or a long secret", () => {
    const o = authRoute({ method: "GET", headers: {} }, { env: {}, kv: null, now: T0 });
    expect((o.body as any).configured).toBe(false);
    const short = authRoute({ method: "GET", headers: {} }, { env: { ...mkEnv(), TFL_SESSION_SECRET: "short" }, kv: null, now: T0 });
    expect((short.body as any).configured).toBe(false);
  });
  it("signs in with the right password (email case-insensitive) and sets an httpOnly strict cookie", () => {
    const o = login(mkEnv());
    expect(o.status).toBe(200);
    const c = String(o.headers?.["set-cookie"]);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Strict");
    expect(c).toContain("Secure");
    expect((o.body as any).user.role).toBe("administrator");
    expect(JSON.stringify(o.body).includes("passwordHash")).toBe(false);
  });
  it("rejects a wrong password and an unknown email the same way", () => {
    const env = mkEnv();
    expect(login(env, "wrong").status).toBe(401);
    const unknown = authRoute({ method: "POST", headers: { ...H, "x-forwarded-for": "2.2.2.2" }, body: { email: "no@one.com", password: "x" } }, { env, kv: null, now: T0 });
    expect(unknown.status).toBe(401);
    expect((unknown.body as any).error).toBe("Invalid email or password.");
  });
  it("needs the custom header (cross-site posts are refused)", () => {
    const o = authRoute({ method: "POST", headers: {}, body: { email: "roni@thefilmlocation.com", password: "correct horse battery" } }, { env: mkEnv(), kv: null, now: T0 });
    expect(o.status).toBe(403);
  });
  it("throttles after 8 failures", () => {
    const env = mkEnv();
    const mk = (pw: string) => authRoute({ method: "POST", headers: { ...H, "x-forwarded-for": "9.9.9.9" }, body: { email: "roni@thefilmlocation.com", password: pw } }, { env, kv: null, now: T0 });
    for (let i = 0; i < 8; i++) expect(mk("bad").status).toBe(401);
    expect(mk("correct horse battery").status).toBe(429);
  });
  it("GET returns the signed-in user from the cookie; sign-out clears it", () => {
    const env = mkEnv();
    const cookie = cookieOf(login(env));
    const me = authRoute({ method: "GET", headers: { cookie } }, { env, kv: null, now: T0 });
    expect((me.body as any).user.email).toBe("roni@thefilmlocation.com");
    const later = authRoute({ method: "GET", headers: { cookie } }, { env, kv: null, now: new Date("2026-10-20T00:00:00Z") });
    expect((later.body as any).user).toBeNull();
    const out = authRoute({ method: "DELETE", headers: H }, { env, kv: null, now: T0 });
    expect(String(out.headers?.["set-cookie"])).toContain("Max-Age=0");
  });
});

describe("snapshot storage and backups", () => {
  it("first push creates version 1; a stale base version is a conflict", async () => {
    const kv = memoryKV();
    const a = await pushSnapshot(kv, 0, { deals: [1] }, "r", T0);
    expect(a.ok && a.snapshot.version).toBe(1);
    const stale = await pushSnapshot(kv, 0, { deals: [2] }, "r", T0);
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.code).toBe(409);
    expect((await readSnapshot(kv))?.data).toEqual({ deals: [1] });
    const b = await pushSnapshot(kv, 1, { deals: [1, 2] }, "r", T0);
    expect(b.ok && b.snapshot.version).toBe(2);
  });
  it("rejects bad shapes and oversize data", async () => {
    const kv = memoryKV();
    expect((await pushSnapshot(kv, 0, [], "r", T0)).ok).toBe(false);
    expect((await pushSnapshot(kv, "0", {}, "r", T0)).ok).toBe(false);
    const big = await pushSnapshot(kv, 0, { x: "a".repeat(4_100_000) }, "r", T0);
    expect(!big.ok && big.code).toBe(413);
  });
  it("keeps one backup per day of the state that was replaced, and prunes to 30", async () => {
    const kv = memoryKV();
    let v = 0;
    for (let d = 1; d <= 40; d++) {
      const when = new Date(Date.UTC(2026, 0, d, 9));
      const r = await pushSnapshot(kv, v, { day: d }, "r", when);
      expect(r.ok).toBe(true); v++;
      await pushSnapshot(kv, v, { day: d, again: true }, "r", when); v++; // same day: no extra backup
    }
    const list = await listBackups(kv);
    expect(list).toHaveLength(KEEP_BACKUPS);
    expect(list[list.length - 1]).toBe("2026-02-08");
    expect(list[0]).toBe("2026-01-10");
    expect((await readBackup(kv, "2026-02-08"))?.data).toEqual({ day: 39, again: true });
    expect(await readBackup(kv, "2026-01-01")).toBeNull();
    expect(await readBackup(kv, "../etc")).toBeNull();
  });
});

describe("/api/state", () => {
  const env = mkEnv();
  const setup = () => ({ kv: memoryKV(), cookie: cookieOf(login(env)) });
  it("refuses without a session", async () => {
    const o = await stateRoute({ method: "GET", headers: {} }, { env, kv: memoryKV(), now: T0 });
    expect(o.status).toBe(401);
  });
  it("round-trips data and returns the conflicting copy on a stale write", async () => {
    const { kv, cookie } = setup();
    const ctx = { env, kv, now: T0 };
    expect(((await stateRoute({ method: "GET", headers: { cookie } }, ctx)).body as any).version).toBe(0);
    const put = await stateRoute({ method: "PUT", headers: { cookie, ...H }, body: { baseVersion: 0, data: { deals: ["a"] } } }, ctx);
    expect(put.status).toBe(200);
    const stale = await stateRoute({ method: "PUT", headers: { cookie, ...H }, body: { baseVersion: 0, data: { deals: ["b"] } } }, ctx);
    expect(stale.status).toBe(409);
    expect((stale.body as any).current.data).toEqual({ deals: ["a"] });
    const noHeader = await stateRoute({ method: "PUT", headers: { cookie }, body: { baseVersion: 1, data: {} } }, ctx);
    expect(noHeader.status).toBe(403);
  });
  it("says so plainly when no database is connected", async () => {
    const o = await stateRoute({ method: "GET", headers: { cookie: cookieOf(login(env)) } }, { env, kv: null, now: T0 });
    expect(o.status).toBe(503);
  });
  it("only administrators can read a backup", async () => {
    const env2 = { ...env, TFL_USERS: JSON.stringify([{ email: "va@thefilmlocation.com", name: "VA", role: "assistant", passwordHash: hashPassword("assistant-password") }]) };
    const li = authRoute({ method: "POST", headers: { ...H, "x-forwarded-for": "3.3.3.3" }, body: { email: "va@thefilmlocation.com", password: "assistant-password" } }, { env: env2, kv: null, now: T0 });
    const o = await stateRoute({ method: "GET", headers: { cookie: cookieOf(li) }, query: { backup: "2026-01-01" } }, { env: env2, kv: memoryKV(), now: T0 });
    expect(o.status).toBe(403);
    expect(sessionOf({ method: "GET", headers: { cookie: cookieOf(li) } }, { env: env2, kv: null, now: T0 })?.role).toBe("assistant");
  });
});

describe("Upstash REST adapter", () => {
  it("sends Redis commands with the bearer token and maps results", async () => {
    const calls: any[] = [];
    const f = (async (url: string, init: any) => {
      calls.push({ url, auth: init.headers.authorization, cmd: JSON.parse(init.body) });
      const cmd = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ result: cmd[0] === "GET" ? "stored" : "OK" }) };
    }) as unknown as typeof fetch;
    const kv = upstashKV("https://example.upstash.io/", "tok", f);
    await kv.set("k", "v");
    expect(await kv.get("k")).toBe("stored");
    await kv.del("k");
    expect(calls.map((c) => c.cmd[0])).toEqual(["SET", "GET", "DEL"]);
    expect(calls[0].auth).toBe("Bearer tok");
    expect(calls[0].url).toBe("https://example.upstash.io");
  });
  it("throws on a storage error", async () => {
    const f = (async () => ({ ok: false, status: 500, json: async () => ({ error: "boom" }) })) as unknown as typeof fetch;
    let err = "";
    try { await upstashKV("https://x", "t", f).get("k"); } catch (e: any) { err = e.message; }
    expect(err).toBe("boom");
  });
});

import { combinePayload, decidePull, pickKeys, pullState, pushState, fetchStatus } from "./serverSync";
describe("client sync decisions", () => {
  it("uploads this browser's data to an empty server, otherwise server wins when ahead", () => {
    expect(decidePull({ version: 0, data: null }, 0, true).kind).toBe("upload-local");
    expect(decidePull({ version: 0, data: null }, 0, false).kind).toBe("in-sync");
    expect(decidePull({ version: 5, data: { a: 1 } }, 3, true).kind).toBe("use-server");
    expect(decidePull({ version: 5, data: { a: 1 } }, 5, true).kind).toBe("in-sync");
  });
  it("keeps only known collections from a snapshot", () => {
    expect(pickKeys({ deals: [1], evil: 1 }, ["deals", "orders"])).toEqual({ deals: [1] });
  });
  it("maps server answers: 401, 409 with the current copy, network failure", async () => {
    const mk = (status: number, body: unknown) => (async () => ({ ok: status < 300, status, json: async () => body })) as unknown as typeof fetch;
    expect((await pullState(mk(401, {}))) as any).toEqual({ ok: false, unauthorised: true });
    expect((await pushState(1, {}, mk(409, { current: { version: 2, data: { a: 1 } } }))).kind).toBe("conflict");
    expect((await pushState(1, {}, mk(200, { version: 2 })))).toEqual({ kind: "ok", version: 2 });
    const down = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
    expect((await pushState(1, {}, down)).kind).toBe("error");
    expect((await fetchStatus(down)).configured).toBe(false);
  });
});

describe("TFL data travels in the same snapshot", () => {
  it("combines store and TFL copies, and returns null when there is nothing", () => {
    expect(combinePayload(null, null)).toBeNull();
    expect(JSON.parse(combinePayload('{"deals":[1]}', '{"locations":[{"id":"l1"}]}')!)).toEqual({ deals: [1], tfl: { locations: [{ id: "l1" }] } });
    expect(JSON.parse(combinePayload(null, '{"owners":[]}')!)).toEqual({ tfl: { owners: [] } });
    expect(JSON.parse(combinePayload('{"deals":[]}', null)!)).toEqual({ deals: [] });
  });
  it("pickKeys never lets the tfl key into the store collections", () => {
    expect("tfl" in pickKeys({ tfl: {}, deals: [] }, ["deals"])).toBe(false);
  });
});
