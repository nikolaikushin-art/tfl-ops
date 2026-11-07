import { canViewSection } from "@/tfl/access";
import { useStore } from "@/lib/store";
import { useState, useEffect, useCallback, lazy, Suspense, startTransition } from "react";
import {
  AppShell,
  type AppSection,
  sectionLabel,
  SECTION_REDIRECTS,
} from "@/components/Shell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TflDashboard, TflModulePage, TflReports } from "@/tfl/TflPages";
import { TflCalendar } from "@/tfl/TflCalendar";
import type { TflKey } from "@/tfl/model";
import { EmptyState, AccentRule } from "@/components/brand";

// Full-page modules are split out so they stay off the first-load bundle.
const Spotlight = lazy(() => import("@/components/Spotlight").then((m) => ({ default: m.Spotlight })));
const MailModule = lazy(() => import("@/components/MailModule").then((m) => ({ default: m.MailModule })));
const WhatsAppModule = lazy(() => import("@/components/WhatsAppModule").then((m) => ({ default: m.WhatsAppModule })));
const DocumentsPage = lazy(() => import("@/components/DocumentsPage").then((m) => ({ default: m.DocumentsPage })));
const SettingsPage = lazy(() => import("@/components/SettingsPage").then((m) => ({ default: m.SettingsPage })));

export function TflApp() {
  const role = useStore().user?.role;
  const [section, setSectionRaw] = useState<AppSection>("dashboard");
  // Old trading section ids forward to the nearest TFL module.
  const setSection = useCallback(
    // startTransition keeps the current screen visible until the next one is ready (no blank flash).
    (next: AppSection) => startTransition(() => setSectionRaw(SECTION_REDIRECTS[next] ?? next)),
    [],
  );
  // Fetch the other pages' code in the background so nothing shows a skeleton the first time.
  useEffect(() => {
    const first = [
      () => import("@/components/SettingsPage"), () => import("@/components/SettingsPanels"),
      () => import("@/components/SettingsAccountPanels"), () => import("@/components/XeroMappingPanel"),
    ];
    const rest = [
      () => import("@/components/MailModule"), () => import("@/components/WhatsAppModule"),
      () => import("@/components/DocumentsPage"), () => import("@/components/Spotlight"),
      () => import("@/components/InvoicePreview"),
    ];
    const run = (list: (() => Promise<unknown>)[]) => list.forEach((f) => { f().catch(() => undefined); });
    const t1 = window.setTimeout(() => run(first), 50);
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const t2 = idle ? idle(() => run(rest)) : window.setTimeout(() => run(rest), 800);
    return () => { window.clearTimeout(t1); if (!idle) window.clearTimeout(t2); };
  }, []);
  const [searchOpen, setSearchOpen] = useState(false);
  /**
   * Cross-module drill-down target: `openRecord(section, id)` opens a record in
   * another module. The id is consumed by the next page and cleared on the way out.
   */
  const [focus, setFocus] = useState<{ section: AppSection; id?: string } | null>(null);

  const openRecord = useCallback((next: AppSection, id?: string) => {
    setFocus(id ? { section: next, id } : null);
    setSection(next);
  }, [setSection]);

  useEffect(() => {
    setFocus((f) => (f && f.section !== section ? null : f));
  }, [section]);

  const focusId = focus?.section === section ? focus.id : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A link inside a TFL record can point at a record in another module; switch to it.
  useEffect(() => {
    const go = (e: Event) => setSection((e as CustomEvent<string>).detail as AppSection);
    window.addEventListener("tfl:navigate", go);
    return () => window.removeEventListener("tfl:navigate", go);
  }, [setSection]);

  const renderPage = () => {
    switch (section) {
      case "dashboard":
        return <TflDashboard onNavigate={(s) => setSection(s as AppSection)} />;
      case "reports":
        return <TflReports />;
      case "calendar":
        return <TflCalendar />;
      case "documents":
        return <DocumentsPage initialDocId={focusId} />;
      case "email":
        return <MailModule channel="email" onOpenRecord={openRecord} />;
      case "whatsapp":
        return <WhatsAppModule onOpenRecord={openRecord} />;
      case "settings":
        if (!canViewSection(role, "settings")) return <div className="p-8 text-sm text-muted-foreground">Settings are for administrators and management. Ask an administrator if you need a change.</div>;
        return <SettingsPage />;
      default:
        if (String(section).startsWith("tfl-") && !canViewSection(role, String(section))) return <div className="p-8 text-sm text-muted-foreground">Your role does not have access to this module. Ask an administrator if you need it.</div>;
        if (String(section).startsWith("tfl-")) return <TflModulePage k={String(section).slice(4) as TflKey} />;
        return (
          <EmptyModule
            title={sectionLabel(section)}
            message="This module is ready for data. Connect integrations or import records to populate it."
          />
        );
    }
  };

  return (
    <AppShell
      section={section}
      onSelect={setSection}
      onOpenRecord={openRecord}
      onOpenSearch={() => {
        // Spotlight owns its own query and cursor state (see Spotlight.tsx).
        // This handler used to reset them through setters that were removed
        // when that state moved, leaving two calls to undefined identifiers —
        // which threw a ReferenceError the moment the search button was
        // clicked. Opening the palette is all this needs to do.
        setSearchOpen(true);
      }}
    >
      <div
        className={
          section === "email" || section === "whatsapp"
            ? "h-full p-3 lg:p-4"
            : "mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8"
        }
      >
        <ErrorBoundary key={section} label={sectionLabel(section)}>
        <Suspense
          fallback={
            <div className="space-y-3">
              <div className="skeleton h-9 w-56" />
              <div className="skeleton h-[120px] w-full" />
              <div className="skeleton h-[220px] w-full" />
            </div>
          }
        >
          {renderPage()}
        </Suspense>
        </ErrorBoundary>
      </div>
      <Suspense fallback={null}>
        <Spotlight
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onOpenRecord={openRecord}
          onNavigate={(next) => setSection(next)}
        />
      </Suspense>
    </AppShell>
  );
}

function EmptyModule({ title, message }: { title: string; message: string }) {
  return (
    <div className="space-y-5 max-w-xl animate-rise">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">{title}</h1>
        <AccentRule className="mt-2" />
      </div>
      <EmptyState title={title} description={message} />
    </div>
  );
}
