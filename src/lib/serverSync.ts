/**
 * Client side of the server database (v111). Pure decisions + thin fetch calls.
 * With no server configured the app keeps working from this browser exactly as before.
 */
export interface ServerUser { email: string; name: string; role: string }
export interface ServerStatus { configured: boolean; storage: boolean; user: ServerUser | null }
export interface RemoteSnapshot { version: number; data: Record<string, unknown> | null; updatedAt?: string; updatedBy?: string }
export type SyncState = "off" | "checking" | "synced" | "saving" | "offline" | "conflict";

export type PullDecision =
  | { kind: "use-server" }
  | { kind: "upload-local" }
  | { kind: "in-sync" };

/** Server wins when it is ahead of what this browser last saw; an empty server is seeded from this browser. */
export function decidePull(remote: RemoteSnapshot, knownVersion: number, hasLocalData: boolean): PullDecision {
  if (remote.version === 0 || !remote.data) return hasLocalData ? { kind: "upload-local" } : { kind: "in-sync" };
  if (remote.version > knownVersion) return { kind: "use-server" };
  return { kind: "in-sync" };
}

/** Keep only the collections the store persists, so a bad snapshot cannot inject other keys. */
export function pickKeys(data: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in data) out[k] = data[k];
  return out;
}

/**
 * The one snapshot sent to the server: the store's collections plus the TFL modules under "tfl".
 * Returns null when neither exists in this browser yet (nothing to upload).
 */
export function combinePayload(storeRaw: string | null, tflRaw: string | null): string | null {
  if (!storeRaw && !tflRaw) return null;
  try {
    const base = storeRaw ? JSON.parse(storeRaw) : {};
    if (tflRaw) base.tfl = JSON.parse(tflRaw);
    return JSON.stringify(base);
  } catch {
    return storeRaw;
  }
}

const HEAD = { "content-type": "application/json", "x-tfl": "1" };
type F = typeof fetch;

export async function fetchStatus(f: F = fetch): Promise<ServerStatus> {
  try {
    const r = await f("/api/auth", { credentials: "same-origin" });
    if (!r.ok) return { configured: false, storage: false, user: null };
    const j = await r.json();
    return { configured: !!j.configured, storage: !!j.storage, user: j.user ?? null };
  } catch {
    return { configured: false, storage: false, user: null };
  }
}

export async function serverLogin(email: string, password: string, f: F = fetch): Promise<{ user?: ServerUser; error?: string }> {
  try {
    const r = await f("/api/auth", { method: "POST", headers: HEAD, credentials: "same-origin", body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { user: j.user } : { error: j.error || "Sign-in failed." };
  } catch {
    return { error: "Could not reach the server." };
  }
}

export async function serverLogout(f: F = fetch): Promise<void> {
  try { await f("/api/auth", { method: "DELETE", headers: HEAD, credentials: "same-origin" }); } catch { /* offline: cookie expires on its own */ }
}

export type PullResult = { ok: true; snapshot: RemoteSnapshot } | { ok: false; unauthorised: boolean };
export async function pullState(f: F = fetch): Promise<PullResult> {
  try {
    const r = await f("/api/state", { credentials: "same-origin" });
    if (r.status === 401) return { ok: false, unauthorised: true };
    if (!r.ok) return { ok: false, unauthorised: false };
    return { ok: true, snapshot: (await r.json()) as RemoteSnapshot };
  } catch {
    return { ok: false, unauthorised: false };
  }
}

export type PushResult =
  | { kind: "ok"; version: number }
  | { kind: "conflict"; current?: RemoteSnapshot }
  | { kind: "unauthorised" }
  | { kind: "error" };
export async function pushState(baseVersion: number, data: unknown, f: F = fetch): Promise<PushResult> {
  try {
    const r = await f("/api/state", { method: "PUT", headers: HEAD, credentials: "same-origin", body: JSON.stringify({ baseVersion, data }) });
    if (r.status === 401) return { kind: "unauthorised" };
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) return { kind: "conflict", current: j.current };
    return r.ok ? { kind: "ok", version: j.version } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
