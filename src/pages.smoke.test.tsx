import { describe, it, expect, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { StoreProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mem = new Map<string, string>();
beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
  g.sessionStorage = g.localStorage;
  g.window = g.window ?? globalThis;
  g.matchMedia = g.matchMedia ?? (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});

const pages: [string, string, string, Record<string, unknown>][] = [
  ["MailModule", "@/components/MailModule", "MailModule", { channel: "email" }],
  ["WhatsAppModule", "@/components/WhatsAppModule", "WhatsAppModule", {}],
  ["DocumentsPage", "@/components/DocumentsPage", "DocumentsPage", {}],
  ["SettingsPage", "@/components/SettingsPage", "SettingsPage", {}],
  ["TflCalendar", "@/tfl/TflCalendar", "TflCalendar", {}],
  ["TflDashboard", "@/tfl/TflPages", "TflDashboard", {}],
  ["TflSettingsPanel", "@/tfl/TflSettingsPanel", "TflSettingsPanel", {}],
  ["RoleMatrix", "@/tfl/TflSettingsPanel", "RoleMatrix", {}],
  ["TflModulePage tasks", "@/tfl/TflPages", "TflModulePage", { k: "tasks" }],
  ["TflModulePage incidents", "@/tfl/TflPages", "TflModulePage", { k: "incidents" }],
  ["TflModulePage registrations", "@/tfl/TflPages", "TflModulePage", { k: "registrations" }],
  ["TflModulePage neighbours", "@/tfl/TflPages", "TflModulePage", { k: "neighbours" }],
];

describe("every page renders without throwing (signed-in demo data)", () => {
  for (const [name, path, exp, props] of pages) {
    it(name, async () => {
      const mod = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
      const C = (mod[exp] ?? mod[name] ?? mod.default) as React.ComponentType<Record<string, unknown>> | undefined;
      if (!C) throw new Error("no component exported for " + name);
      const html = renderToString(
        <QueryClientProvider client={new QueryClient()}><ThemeProvider><StoreProvider><TooltipProvider><MemoryRouter>
          <C onOpenRecord={() => undefined} {...props} />
        </MemoryRouter></TooltipProvider></StoreProvider></ThemeProvider></QueryClientProvider>,
      );
      expect(html.length).toBeGreaterThan(50);
    });
  }
});
