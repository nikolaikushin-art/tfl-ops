import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { PERSIST_KEYS, PERSIST_NAME } from "@/lib/persistKeys";
import { loadValue, saveValue } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { tflSync } from "@/tfl/useTfl";
import { combinePayload, decidePull, fetchStatus, pickKeys, pullState, pushState, type SyncState } from "@/lib/serverSync";

const VERSION_NAME = "server.version";
const PUSH_DELAY = 1500;
const RETRY_DELAY = 30000;

/** Last known sync state, readable by the Settings panel. */
let current: SyncState = "off";
const subs = new Set<(s: SyncState) => void>();
const setCurrent = (s: SyncState) => { current = s; subs.forEach((f) => f(s)); };
export function useSyncState(): SyncState {
  const [s, setS] = useState<SyncState>(current);
  useEffect(() => { subs.add(setS); setS(current); return () => { subs.delete(setS); }; }, []);
  return s;
}

/** Everything this browser holds: the store's collections plus the TFL modules. */
const rawLocal = () => {
  let store: string | null = null;
  try { store = localStorage.getItem("tfl." + PERSIST_NAME); } catch { /* ignore */ }
  return combinePayload(store, tflSync.raw());
};

/**
 * Renders nothing. When the server database is set up, it loads the latest copy after
 * sign-in and pushes every saved change. When it is not, it does nothing at all.
 */
export function ServerSync() {
  const { isAuthenticated, signOut, hydrateFromServer } = useStore();
  const version = useRef<number>(loadValue<number>(VERSION_NAME) ?? 0);
  const lastRaw = useRef<string | null>(null);
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushing = useRef(false);
  const warnedOffline = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) { active.current = false; setCurrent("off"); return; }
    let dead = false;

    const stashLocal = () => { const raw = rawLocal(); if (raw) { try { localStorage.setItem("tfl.conflict.last", raw); } catch { /* full */ } } };
    const adopt = (v: number, data: Record<string, unknown>) => {
      stashLocal();
      version.current = v; saveValue(VERSION_NAME, v);
      hydrateFromServer(pickKeys(data, PERSIST_KEYS));
      tflSync.replace(data.tfl);
    };

    function schedule() { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(push, PUSH_DELAY); }

    async function push() {
      if (!active.current || pushing.current) return;
      const raw = rawLocal();
      if (!raw || raw === lastRaw.current) { setCurrent("synced"); return; }
      pushing.current = true; setCurrent("saving");
      const res = await pushState(version.current, JSON.parse(raw));
      pushing.current = false;
      if (res.kind === "conflict" && !res.current?.data) {
        // The server said "changed elsewhere" without sending the copy: fetch it.
        const again = await pullState();
        if (again.ok && again.snapshot.data) res.current = again.snapshot;
      }
      if (res.kind === "ok") { version.current = res.version; saveValue(VERSION_NAME, res.version); lastRaw.current = raw; warnedOffline.current = false; setCurrent("synced");
        // A change saved while this upload was running was skipped by the guard above: send it now.
        if (active.current && rawLocal() !== lastRaw.current) schedule();
      }
      else if (res.kind === "conflict" && res.current?.data) {
        setCurrent("conflict");
        adopt(res.current.version, res.current.data);
        toast("Changed on another device. Loaded the latest copy; your unsynced copy is kept in this browser.", { tone: "danger", duration: 8000 });
        setCurrent("synced");
      } else if (res.kind === "unauthorised") { toast("Your session ended. Please sign in again.", { tone: "danger" }); signOut(); }
      else {
        setCurrent("offline");
        if (!warnedOffline.current) { warnedOffline.current = true; toast("Could not reach the server. Changes stay in this browser and will upload when it is back.", { tone: "danger", duration: 6000 }); }
        // Try again on its own; the "online" event alone is not reliable on phones.
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(push, RETRY_DELAY);
      }
    }

    (async () => {
      setCurrent("checking");
      const status = await fetchStatus();
      if (dead) return;
      if (!status.configured || !status.storage) { setCurrent("off"); return; }
      if (!status.user) { toast("Please sign in again.", { tone: "danger" }); signOut(); return; }
      const pulled = await pullState();
      if (dead) return;
      if (!pulled.ok) { if (pulled.unauthorised) signOut(); else setCurrent("offline"); return; }
      const decision = decidePull(pulled.snapshot, version.current, !!rawLocal());
      active.current = true;
      if (decision.kind === "use-server" && pulled.snapshot.data) {
        adopt(pulled.snapshot.version, pulled.snapshot.data);
        // An older snapshot has no TFL data yet: keep this browser's and upload it.
        const hasTfl = !!pulled.snapshot.data.tfl;
        lastRaw.current = hasTfl ? rawLocal() : null;
        setCurrent("synced");
        if (!hasTfl) schedule();
      } else if (decision.kind === "upload-local") {
        version.current = 0; await push();
      } else { lastRaw.current = rawLocal(); setCurrent("synced"); }
    })();

    window.addEventListener("tfl:saved", schedule);
    const online = () => { warnedOffline.current = false; schedule(); };
    window.addEventListener("online", online);
    return () => { dead = true; active.current = false; if (timer.current) clearTimeout(timer.current); window.removeEventListener("tfl:saved", schedule); window.removeEventListener("online", online); };
  }, [isAuthenticated, signOut, hydrateFromServer]);

  return null;
}

export function SyncStatusLine() {
  const s = useSyncState();
  const text: Record<SyncState, string> = {
    off: "Server database: not connected. Data is kept in this browser only.",
    checking: "Server database: connecting…",
    synced: "Server database: connected and up to date. Daily backups are kept for 30 days.",
    saving: "Server database: saving…",
    offline: "Server database: not reachable. Changes are kept here and upload when it is back.",
    conflict: "Server database: resolving a change made on another device…",
  };
  return <div className="text-[13px] text-ink-secondary">{text[s]}</div>;
}
