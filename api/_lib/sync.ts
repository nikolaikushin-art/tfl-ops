/** Versioned snapshot storage with daily backups. Single-writer app: read-check-write. */
import type { KV } from "./kv";

export const STATE_KEY = "tfl:state";
export const BACKUP_INDEX = "tfl:backups";
export const MAX_BYTES = 4_000_000;
export const KEEP_BACKUPS = 30;

export interface Snapshot { version: number; updatedAt: string; updatedBy: string; data: Record<string, unknown> }
export type PushResult =
  | { ok: true; snapshot: Omit<Snapshot, "data"> }
  | { ok: false; code: 409 | 413 | 400; error: string; current?: Snapshot };

export async function readSnapshot(kv: KV): Promise<Snapshot | null> {
  const raw = await kv.get(STATE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as Snapshot; } catch { return null; }
}

const day = (iso: string) => iso.slice(0, 10);

export async function pushSnapshot(
  kv: KV, baseVersion: unknown, data: unknown, by: string, now: Date,
): Promise<PushResult> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, code: 400, error: "Data must be an object." };
  if (typeof baseVersion !== "number" || !Number.isInteger(baseVersion) || baseVersion < 0) return { ok: false, code: 400, error: "baseVersion must be a whole number." };
  const body = JSON.stringify(data);
  if (body.length > MAX_BYTES) return { ok: false, code: 413, error: "Data is too large to sync." };

  const current = await readSnapshot(kv);
  const currentVersion = current?.version ?? 0;
  if (baseVersion !== currentVersion) return { ok: false, code: 409, error: "Changed elsewhere since you last loaded.", current: current ?? undefined };

  const iso = now.toISOString();
  // Daily backup of the previous state, taken before the first overwrite of each day.
  if (current && day(current.updatedAt) !== day(iso)) {
    const bkey = `tfl:backup:${day(current.updatedAt)}`;
    if (!(await kv.get(bkey))) {
      await kv.set(bkey, JSON.stringify(current));
      const idx: string[] = JSON.parse((await kv.get(BACKUP_INDEX)) || "[]");
      const next = [...idx.filter((d) => d !== day(current.updatedAt)), day(current.updatedAt)].sort();
      while (next.length > KEEP_BACKUPS) { const old = next.shift()!; await kv.del(`tfl:backup:${old}`); }
      await kv.set(BACKUP_INDEX, JSON.stringify(next));
    }
  }
  const snapshot: Snapshot = { version: currentVersion + 1, updatedAt: iso, updatedBy: by, data: data as Record<string, unknown> };
  await kv.set(STATE_KEY, JSON.stringify(snapshot));
  return { ok: true, snapshot: { version: snapshot.version, updatedAt: iso, updatedBy: by } };
}

export async function listBackups(kv: KV): Promise<string[]> {
  try { return JSON.parse((await kv.get(BACKUP_INDEX)) || "[]"); } catch { return []; }
}
export async function readBackup(kv: KV, date: string): Promise<Snapshot | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const raw = await kv.get(`tfl:backup:${date}`);
  return raw ? (JSON.parse(raw) as Snapshot) : null;
}
