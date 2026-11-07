import { describe, it, expect, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { StoreProvider, useStore } from "@/lib/store";

// Minimal in-memory localStorage so the real store can run outside a browser.
function installStorage() {
  const m = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
  return m;
}

let captured: ReturnType<typeof useStore> | null = null;
function Probe() {
  const s = useStore();
  captured = s;
  return <span>{s.isAuthenticated ? `in:${s.user?.email}` : "out"}</span>;
}
const page = () => renderToString(<StoreProvider><Probe /></StoreProvider>);

describe("sign-in session survives refresh", () => {
  let store: Map<string, string>;
  beforeEach(() => { store = installStorage(); captured = null; });

  it("starts signed out on a fresh browser", () => {
    expect(page()).toContain("out");
  });

  it("a wrong password does not create a session", () => {
    page();
    expect(captured!.signIn("admin@thefilmlocation.com", "nope")).toBe(false);
    expect(store.has("tfl.session.v1")).toBe(false);
  });

  it("signing in saves the session, and a refresh (new mount) is still signed in", () => {
    page();
    expect(captured!.signIn("admin@thefilmlocation.com", "TFL888+++")).toBe(true);
    expect(store.has("tfl.session.v1")).toBe(true);
    expect(page()).toContain("in:admin@thefilmlocation.com");
    expect(page()).toContain("in:admin@thefilmlocation.com"); // and again
  });

  it("signing out clears the session so a refresh shows sign-in", () => {
    page();
    captured!.signIn("admin@thefilmlocation.com", "TFL888+++");
    page();
    captured!.signOut();
    expect(store.has("tfl.session.v1")).toBe(false);
    expect(page()).toContain("out");
  });

  it("a corrupt saved session is ignored, not a crash", () => {
    store.set("tfl.session.v1", "{not json");
    expect(page()).toContain("out");
    store.set("tfl.session.v1", JSON.stringify({ user: { nope: 1 } }));
    expect(page()).toContain("out");
  });

  it("reset/clear demo data keeps you signed in", () => {
    page();
    captured!.signIn("admin@thefilmlocation.com", "TFL888+++");
    page();
    captured!.resetDemoData();
    captured!.clearDemoData();
    expect(page()).toContain("in:admin@thefilmlocation.com");
  });
});
