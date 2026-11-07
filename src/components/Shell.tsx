import { canViewSection } from "@/tfl/access";
import {
  LayoutDashboard,
  Users,
  Contact,
  Truck,
  Package,
  FileText,
  FileSpreadsheet,
  ClipboardList,
  ShoppingCart,
  Receipt,
  Mail,
  MessageCircle,
  Megaphone,
  ShieldAlert,
  ShieldCheck,
  FolderOpen,
  Calculator,
  CreditCard,
  Brain,
  Target,
  BarChart3,
  Settings,
  LogOut,
  Search,
  Bell,
  Moon,
  Sun,
  PanelLeft,
  MoreHorizontal,
  ChevronDown,
  TrendingUp,
  Sparkles,
  Gauge,
  Percent,
  Activity,
  Warehouse as WarehouseIcon,
  Route as RouteIcon,
  Stamp,
  ClipboardCheck,
  Award,
  Globe2,
  CalendarClock,
  Tag,
  Menu,
  HelpCircle,
  Command as CommandIcon,
  X,
  type LucideIcon,
  MapPin, Clapperboard, FileSignature, ListChecks, BadgeCheck, CalendarDays, UserPlus, Siren, Megaphone as NoticeIcon, CheckSquare,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ModuleSidebar, type ResolvedItem, type ResolvedSection } from "@/components/ModuleSidebar";
import { MainSidebar, type MainNavGroup } from "@/components/MainSidebar";
import { useSideExtraValue } from "@/lib/sideExtra";
import { BrandGlobe, BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { nextThemeLabel, useTheme } from "@/lib/theme";
import { useLiveSignals } from "@/lib/useSignals";
import { LiveCapsule, SeverityDot } from "@/components/apple";
import { NotificationCenter } from "@/components/NotificationCenter";
import { AiAssistant } from "@/components/AiAssistant";
import { TopBar } from "@/components/TopBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ModuleSettingsView } from "@/components/ModuleSettingsView";
import { HOTKEYS, MODULE_ELEMENTS, parseHidden, useModuleConfigValues } from "@/lib/moduleConfig";
import { notifyModule } from "@/lib/moduleRuntime";
import { enhancePage } from "@/lib/pageEnhance";
import type { SignalTarget } from "@/lib/signals";

export type AppSection =
  | "dashboard"
  | "reports"
  | "signals"
  | "customers"
  | "contacts"
  | "suppliers"
  | "markets"
  | "products"
  | "brands"
  | "requirements"
  | "pricing"
  | "priceintel"
  | "portfolio"
  | "opportunities"
  | "dealdesk"
  | "quotations"
  | "orders"
  | "invoices"
  | "warehouses"
  | "shipments"
  | "compliance"
  | "quality"
  | "email"
  | "whatsapp"
  | "campaigns"
  | "kyc"
  | "documents"
  | "accounting"
  | "payments"
  | "cashflow"
  | "residency"
  | "scoring"
  | "assurance"
  | "executive"
  | "tfl-locations"
  | "tfl-owners"
  | "tfl-productions"
  | "tfl-enquiries"
  | "tfl-scouting"
  | "tfl-bookings"
  | "tfl-quotes"
  | "tfl-invoices"
  | "tfl-contracts"
  | "tfl-permits"
  | "tfl-assessments"
  | "tfl-shortlists"
  | "tfl-insurance"
  | "tfl-payments"
  | "tfl-registrations"
  | "tfl-incidents"
  | "tfl-neighbours"
  | "tfl-tasks"
  | "calendar"
  | "settings";

type NavGroup = {
  label: string;
  items: { id: AppSection; label: string; icon: LucideIcon }[];
};

export const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", items: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "tfl-tasks", label: "Tasks & Follow-ups", icon: CheckSquare },
    { id: "reports", label: "Reports", icon: BarChart3 },
  ] },
  { label: "Locations", items: [
    { id: "tfl-locations", label: "Locations", icon: MapPin },
    { id: "tfl-registrations", label: "Registrations", icon: UserPlus },
    { id: "tfl-assessments", label: "Site Assessments", icon: ClipboardCheck },
    { id: "tfl-shortlists", label: "Shortlists & Packs", icon: ListChecks },
    { id: "tfl-owners", label: "Owners & Suppliers", icon: Contact },
  ] },
  { label: "Production", items: [
    { id: "tfl-productions", label: "Productions", icon: Clapperboard },
    { id: "tfl-enquiries", label: "Enquiries", icon: Target },
    { id: "tfl-scouting", label: "Scouting & Visits", icon: Search },
    { id: "tfl-bookings", label: "Bookings", icon: CalendarClock },
  ] },
  { label: "Commercial", items: [
    { id: "tfl-quotes", label: "Quotations", icon: FileText },
    { id: "tfl-invoices", label: "Invoices", icon: Receipt },
    { id: "tfl-payments", label: "Payments & Deposits", icon: CreditCard },
    { id: "tfl-contracts", label: "Contracts", icon: FileSignature },
  ] },
  { label: "Compliance", items: [
    { id: "tfl-permits", label: "Permits", icon: ShieldCheck },
    { id: "tfl-insurance", label: "Insurance & Certificates", icon: BadgeCheck },
    { id: "tfl-neighbours", label: "Neighbour Notices", icon: NoticeIcon },
    { id: "tfl-incidents", label: "Incidents & Claims", icon: Siren },
  ] },
  { label: "Communications", items: [
    { id: "email", label: "Email", icon: Mail },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { id: "documents", label: "Documents", icon: FolderOpen },
  ] },
  { label: "System", items: [{ id: "settings", label: "Settings", icon: Settings }] },
];

/**
 * Hubs: one nav entry, several tabs. Each tab is still a normal section id, so
 * every existing deep link (`openRecord("orders", id)`) keeps working — the
 * shell just highlights the hub and shows its tab strip.
 */
export type HubTab = { id: AppSection; label: string; short?: string };
export const HUBS: Partial<Record<AppSection, HubTab[]>> = {};

/** Sections that were removed or folded away in v17 and where they now go. */
export const SECTION_REDIRECTS: Record<string, AppSection> = {
  signals: "dashboard", executive: "reports", scoring: "reports",
  customers: "tfl-owners", suppliers: "tfl-owners", contacts: "tfl-owners",
  products: "tfl-locations", brands: "tfl-locations", markets: "tfl-locations",
  requirements: "tfl-enquiries", opportunities: "tfl-enquiries",
  quotations: "tfl-quotes", invoices: "tfl-invoices", orders: "tfl-bookings",
  dealdesk: "tfl-enquiries", pricing: "tfl-locations", priceintel: "reports", portfolio: "reports",
  warehouses: "tfl-locations", shipments: "tfl-bookings", kyc: "tfl-contracts",
  compliance: "tfl-permits", quality: "tfl-permits", assurance: "tfl-permits",
  accounting: "tfl-invoices", payments: "tfl-payments", cashflow: "tfl-invoices",
  residency: "dashboard", campaigns: "email", credit: "tfl-invoices",
};

/** Section → the nav entry that should look "selected" for it. */
export const SECTION_NAV: Partial<Record<AppSection, AppSection>> = (() => {
  const map: Partial<Record<AppSection, AppSection>> = {};
  for (const [navId, tabs] of Object.entries(HUBS)) {
    for (const t of tabs ?? []) map[t.id] = navId as AppSection;
  }
  // Buyer / supplier detail screens are reached from the one Contacts directory.
  map.customers = "contacts";
  map.suppliers = "contacts";
  return map;
})();
export const navIdFor = (section: AppSection): AppSection =>
  SECTION_NAV[section] ?? section;

export const ALL_SECTIONS = NAV_GROUPS.flatMap((g) => g.items);
export const sectionLabel = (id: AppSection) =>
  ALL_SECTIONS.find((i) => i.id === id)?.label ??
  Object.values(HUBS).flat().find((t) => t?.id === id)?.label ??
  id;
export const sectionGroupLabel = (id: AppSection) =>
  NAV_GROUPS.find((g) => g.items.some((i) => i.id === navIdFor(id)))?.label;

/** Overview and Settings are how you get anywhere else or fix a mistake, so
 *  they are never hidden by module settings — everything else is optional. */
export const CORE_MODULES = new Set<AppSection>(["dashboard", "reports", "settings"]);
/** The full set of modules Settings → Modules can offer a switch for. */
export const CONFIGURABLE_SECTIONS = ALL_SECTIONS.filter((i) => !CORE_MODULES.has(i.id));

/** Primary mobile tabs — rest under More. Follows the money: overview,
 *  who it's with, what's open, what's being sold right now. */
export const MOBILE_PRIMARY: AppSection[] = [
  "dashboard",
  "tfl-locations",
  "tfl-enquiries",
  "tfl-bookings",
];

/** Module (second) sidebar: open / icon rail. */
const RAIL_KEY = "tfl.web.rail";
/** Main navigation (first) sidebar: open / icon rail. */
const NAV_RAIL_KEY = "tfl.nav.rail";

/**
 * Re-exported from `lib/theme` so existing imports keep working. The hook used
 * to hold its own state here, which meant the sidebar switch and the Settings
 * switch were two different switches fighting over one DOM attribute.
 */
export { useTheme };

/** Icons for pages that live inside a hub (they were plain tabs before). */
const ITEM_ICON: Partial<Record<AppSection, LucideIcon>> = {
  products: Package,
  brands: Award,
  pricing: Tag,
  priceintel: TrendingUp,
  portfolio: FileSpreadsheet,
  requirements: Target,
  quotations: FileText,
  dealdesk: Percent,
  orders: ShoppingCart,
  invoices: Receipt,
  shipments: RouteIcon,
  payments: CreditCard,
};

export function AppShell({
  section,
  onSelect: onSelectProp,
  onOpenSearch,
  onOpenRecord,
  children,
}: {
  section: AppSection;
  onSelect: (s: AppSection) => void;
  onOpenSearch: () => void;
  /** Lets the notification centre jump straight to the record a signal is
   * about (e.g. an overdue invoice) instead of only landing on the Signals
   * list. Falls back to a plain section navigation when not supplied. */
  onOpenRecord?: (section: AppSection, id?: string) => void;
  children: ReactNode;
}) {
  const store = useStore();
  const { theme, toggle } = useTheme();
  const signals = useLiveSignals();
  const extra = useSideExtraValue();
  const critical = signals.filter((s) => s.severity === "critical").length;
  const openSignalRecord = (target: SignalTarget, id?: string) => {
    if (onOpenRecord) onOpenRecord(target as AppSection, id);
    else onSelect(target as AppSection);
  };
  const [railOpen, setRailOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(RAIL_KEY) !== "collapsed";
  });
  const [navRail, setNavRail] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(NAV_RAIL_KEY) === "collapsed";
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Phone: the module sidebar (sections, stages, folders…) as a slide-in sheet — opened by the top-left hamburger. */
  const [sideOpen, setSideOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const visibleNavGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            (item.id !== "residency" || store.user?.role === "administrator") &&
            canViewSection(store.user?.role, item.id) &&
            (CORE_MODULES.has(item.id) || store.moduleSettings[item.id] !== false),
        ),
      })).filter((group) => group.items.length > 0),
    [store.moduleSettings, store.user?.role],
  );

  const navId = navIdFor(section);
  const cfg = useModuleConfigValues(navId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Every navigation (including pressing the module you are already in) closes the module's settings,
  // so the gear never stays lit over a page you just asked for.
  const onSelect = useCallback((s: AppSection) => { setSettingsOpen(false); onSelectProp(s); }, [onSelectProp]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  const toggleNavRail = useCallback(() => {
    setNavRail((o) => {
      const next = !o;
      try {
        localStorage.setItem(NAV_RAIL_KEY, next ? "collapsed" : "open");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleRail = useCallback(() => {
    setRailOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(RAIL_KEY, next ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Second sidebar = what lives *inside* the current page: the tabs of the
  // hub you are on, then whatever the page registered (folders, stages, panels).
  // Pages themselves are in the main sidebar, exactly like unique-ops.
  const baseSections = useMemo<ResolvedSection[]>(() => {
    const out: ResolvedSection[] = [];
    const tabs = HUBS[navId];
    if (tabs && tabs.length > 1) {
      out.push({
        id: `hub:${navId}`,
        label: sectionLabel(navId),
        items: tabs.map((t) => ({
          key: t.id,
          label: t.label,
          icon: ITEM_ICON[t.id],
          active: section === t.id,
          onClick: () => onSelect(t.id),
        })),
      });
    }
    if (extra) {
      for (const sx of extra.sections) {
        out.push({
          id: `x:${sx.id}`,
          label: sx.label,
          collapsible: sx.collapsible,
          items: sx.items.map((i) => ({
            ...i,
            active: Array.isArray(extra.active) ? extra.active.includes(i.key) : extra.active === i.key,
            onClick: () => extra.onPick?.(i.key),
          })),
        });
      }
    }
    // Every module gets its own second sidebar: when a page registers nothing,
    // show the pages of its group (e.g. Trade Desk → Products, Requests, Deal Desk, Stock).
    if (out.length === 0) {
      const group = NAV_GROUPS.find((g) => g.items.some((i) => i.id === navId));
      const sibs = (group?.items ?? []).filter(
        (i) => (i.id !== "residency" || store.user?.role === "administrator") && (CORE_MODULES.has(i.id) || store.moduleSettings[i.id] !== false),
      );
      if (group && sibs.length > 0) {
        out.push({
          id: `grp:${group.label}`,
          label: group.label,
          items: sibs.map((i) => ({
            key: i.id,
            label: i.label,
            icon: i.icon,
            active: i.id === navId,
            onClick: () => onSelect(i.id),
          })),
        });
      }
    }
    return out;
  }, [extra, section, navId, onSelect, store.moduleSettings, store.user?.role]);

  // Module settings applied to the sidebar: hidden sections, counters, group headings.
  const hiddenKeys = parseHidden(cfg.hiddenItems);
  const sections = useMemo<ResolvedSection[]>(
    () =>
      baseSections.map((sec) => ({
        ...sec,
        label: cfg.groupLabels === false ? undefined : sec.label,
        items: sec.items
          .filter((i) => i.active || !hiddenKeys.includes(i.key))
          .map((i) => (cfg.showCounts === false ? { ...i, count: undefined } : i)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseSections, cfg.groupLabels, cfg.showCounts, cfg.hiddenItems],
  );
  const flatItems = sections.flatMap((x) => x.items);
  const allItems = baseSections.flatMap((x) => x.items).map((i) => ({ key: i.key, label: i.label }));
  const warnItems = flatItems.filter((i) => i.warn && i.count);
  const warnTotal = warnItems.reduce((n, i) => n + (i.count || 0), 0);

  const sidebarTitle = sectionLabel(navId);
  const primary = extra?.primary;
  const activeLabel = sections.flatMap((x) => x.items).find((i) => i.active)?.label ?? "";
  // Settings has its own list pane (like unique-ops), so no second sidebar there.
  const hasModuleSide = navId !== "settings" && (!!primary || sections.some((x) => x.items.length > 0));

  // ---- module settings at runtime (same behaviours as unique-ops Workspace) ----
  const sideRef = useRef({ extra, primary, flatItems, toggleRail, onOpenSearch, cfg });
  sideRef.current = { extra, primary, flatItems, toggleRail, onOpenSearch, cfg };

  // Every page opens from the top. <main> is the scroller, so without this a module keeps the
  // scroll position of the one you came from.
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = 0;
  }, [section, settingsOpen]);

  // Wide tables become stacked cards on phones; a page title that repeats the header is hidden.
  const titleKey = `${sidebarTitle}|${activeLabel}`;
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const titles = titleKey.split("|");
    let raf = 0;
    const run = () => { raf = 0; enhancePage(el, titles); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(run); };
    run();
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [titleKey, section]);

  // Leaving the module closes its settings and the phone sidebar sheet.
  useEffect(() => { setSettingsOpen(false); setSideOpen(false); }, [navId, section]);

  // Phone sidebar sheet: Escape closes it, and it never stays open on a desktop-size screen.
  useEffect(() => {
    if (!sideOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSideOpen(false); };
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => { if (mq.matches) setSideOpen(false); };
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => { window.removeEventListener("keydown", onKey); mq.removeEventListener("change", onMq); };
  }, [sideOpen]);

  // «Panel on open»: expanded / collapsed / remember.
  useEffect(() => {
    if (cfg.sidebarStart === "open") setRailOpen(true);
    else if (cfg.sidebarStart === "rail") setRailOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navId]);

  // «Remember last section»: restore on open, store on change.
  const restored = useRef<string | null>(null);
  const activeKey = Array.isArray(extra?.active) ? extra?.active[0] : extra?.active;
  const rsKey = `tfl.side.last.${navId}`;
  useEffect(() => {
    if (!cfg.rememberSection || !extra || restored.current === navId) return;
    restored.current = navId;
    try {
      const k = localStorage.getItem(rsKey);
      if (k && k !== activeKey && extra.sections.some((x) => x.items.some((i) => i.key === k))) extra.onPick?.(k);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navId, !!extra, cfg.rememberSection]);
  useEffect(() => {
    if (!cfg.rememberSection || !activeKey || restored.current !== navId) return;
    try { localStorage.setItem(rsKey, activeKey); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, cfg.rememberSection]);

  // Choosing a section inside a module (Brand, Buyers, Ledger …) also starts the page at the top.
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = 0;
  }, [activeKey]);

  // «Remind on open»: once per browser session and module.
  const warnSig = warnItems.map((i) => `${i.label} — ${i.count}`).join(", ");
  useEffect(() => {
    if (!cfg.attentionToast || !warnSig) return;
    const k = `tfl.attn.${navId}`;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { /* ignore */ }
    setNote(`${sectionLabel(navId)}: needs attention — ${warnSig}`);
    const t = window.setTimeout(() => setNote(null), 4500);
    return () => window.clearTimeout(t);
     
  }, [navId, cfg.attentionToast, warnSig]);

  // «Section to open first»: only when the module is opened on its own page (not a deep link to one of its tabs)
  // and «Remember last section» is off (that one wins).
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (startedFor.current === navId) return;
    startedFor.current = navId;
    const want = String(cfg.startItem || "");
    if (!want || cfg.rememberSection || section !== navId) return;
    const target = baseSections.flatMap((x) => x.items).find((i) => i.key === want);
    if (target && !target.active) target.onClick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navId]);

  // «Browser notifications»: when the number of sections that need attention goes up.
  const prevWarn = useRef<{ id: string; n: number } | null>(null);
  useEffect(() => {
    const p = prevWarn.current;
    prevWarn.current = { id: navId, n: warnTotal };
    if (!p || p.id !== navId || warnTotal <= p.n) return;
    notifyModule(navId, `${sectionLabel(navId)}: needs attention`, warnSig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navId, warnTotal]);

  // «Columns & elements»: hide what the person switched off (markup carries data-el="<module>:<key>").
  const elementsCss = (MODULE_ELEMENTS[navId] ?? [])
    .filter((e) => cfg[`el_${e.key}`] === false)
    .map((e) => `.ms-scope [data-el="${navId}:${e.key}"] { display: none !important; }`)
    .join("\n");

  // «Number in the tab title».
  useEffect(() => {
    if (!cfg.tabBadge) return;
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = warnTotal ? `(${warnTotal}) ${base}` : base;
    return () => { document.title = base; };
  }, [cfg.tabBadge, warnTotal]);

  // Hotkeys: / search · n new · [ panel · 1–9 section · ? help (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = sideRef.current;
      if (r.cfg.hotkeys === false) return;
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape") { setHelpOpen(false); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"], .modal-overlay')) return;
      if (e.key === "/") {
        e.preventDefault();
        const inp = document.querySelector<HTMLInputElement>('main input[type="search"], main input[placeholder*="earch"]');
        if (inp) inp.focus(); else r.onOpenSearch();
      } else if (e.key === "?") { e.preventDefault(); setHelpOpen(true); }
      else if (e.key === "n" && r.primary) { e.preventDefault(); r.primary.onClick(); }
      else if (e.key === "[") { e.preventDefault(); r.toggleRail(); }
      else if (/^[1-9]$/.test(e.key)) {
        const it = r.flatItems[Number(e.key) - 1];
        if (it) { e.preventDefault(); it.onClick(); setSettingsOpen(false); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mainGroups: MainNavGroup[] = useMemo(
    () =>
      visibleNavGroups.map((g) => ({
        label: g.label,
        items: g.items.map((i) => ({
          id: i.id,
          label: i.label,
          icon: i.icon,
          dot: i.id === "dashboard" && critical > 0,
        })),
      })),
    [visibleNavGroups, critical],
  );

  const sidebar = (rail: boolean, onNavigate?: () => void) => (
    <ModuleSidebar
      title={sidebarTitle}
      primary={primary}
      sections={sections}
      rail={rail}
      onNavigate={onNavigate}
      onPick={() => setSettingsOpen(false)}
      onSettings={navId === "settings" ? undefined : () => setSettingsOpen((v) => !v)}
      settingsActive={settingsOpen}
    />
  );

  const mainNav = (mobile?: boolean, onNavigate?: () => void) => (
    <MainSidebar
      groups={mainGroups}
      activeId={navId}
      onSelect={(id) => onSelect(id as AppSection)}
      rail={navRail}
      onToggleRail={toggleNavRail}
      theme={theme}
      onToggleTheme={toggle}
      userName={store.user?.name}
      userRole={store.user?.role}
      onSignOut={() => store.signOut()}
      mobile={mobile}
      onNavigate={onNavigate}
    />
  );

  const initial = (store.user?.name || "R").charAt(0).toUpperCase();
  const quickActionList = [
    { id: "request", label: "New enquiry", onClick: () => onSelect("tfl-enquiries") },
    { id: "quotation", label: "New quotation", onClick: () => onSelect("tfl-quotes") },
    { id: "contact", label: "New location", onClick: () => onSelect("tfl-locations") },
    { id: "message", label: "New message", onClick: () => onSelect("email") },
  ];

  return (
    <div
      className="flex h-[100dvh] min-h-0 flex-col bg-canvas lg:flex-row"
      data-ms-density={cfg.density as string}
      data-ms-text={cfg.textSize as string}
      data-ms-width={cfg.pageWidth as string}
      data-ms-zebra={cfg.zebra ? "1" : "0"}
      data-ms-nums={cfg.tabularNums ? "1" : "0"}
      data-ms-motion={cfg.reduceMotion ? "0" : "1"}
    >
      {/* 1st sidebar: main navigation (open / icon rail) */}
      <div className="hidden h-full lg:flex">{mainNav()}</div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col min-h-0">
        {/* Desktop top bar (same layout as unique-ops) */}
        <TopBar
          navRail={navRail}
          onToggleNav={toggleNavRail}
          onOpenSearch={onOpenSearch}
          onOpenMail={() => onSelect("email")}
          onOpenSettings={() => onSelect("settings")}
          bell={
            <NotificationCenter
              signals={signals}
              critical={critical}
              dismissedCount={store.dismissedSignals.length}
              onOpenRecord={openSignalRecord}
              onDismiss={store.dismissSignal}
              onRestore={store.restoreSignals}
              onViewAll={() => onSelect("signals")}
              variant="desktop"
            />
          }
          quickActions={quickActionList}
          userName={store.user?.name}
          userRole={store.user?.role}
          theme={theme}
          onToggleTheme={toggle}
          onSignOut={() => store.signOut()}
        />

        {/* Mobile top bar — same as unique-ops: hamburger (top left) opens the module's sidebar,
            then title, search and module settings. Main navigation = bottom menu. */}
        <header className="rs-mhead lg:hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div className="rs-mhead-row">
            <button
              type="button"
              className="rs-icon-btn rs-icon-btn--lg"
              onClick={() => {
                setMoreOpen(false);
                if (hasModuleSide) { setDrawerOpen(false); setSideOpen(true); }
                else setDrawerOpen((v) => !v);
              }}
              aria-label={hasModuleSide ? `${sidebarTitle} sections` : "Menu"}
              aria-expanded={hasModuleSide ? sideOpen : drawerOpen}
            >
              <Menu size={21} strokeWidth={1.9} />
            </button>
            <div className="rs-mhead-title">
              <b>{sidebarTitle}</b>
              {hasModuleSide && activeLabel && activeLabel !== sidebarTitle ? <span>{activeLabel}</span> : null}
            </div>
            <button type="button" className="rs-icon-btn rs-icon-btn--lg" onClick={onOpenSearch} aria-label="Search">
              <Search size={19} strokeWidth={1.9} />
            </button>
            {hasModuleSide && (navId as AppSection) !== "settings" ? (
              <button
                type="button"
                className="rs-icon-btn rs-icon-btn--lg"
                onClick={() => { setSideOpen(false); setSettingsOpen((v) => !v); }}
                aria-label="Module settings"
                aria-pressed={settingsOpen}
              >
                <Settings size={19} strokeWidth={1.9} />
              </button>
            ) : null}
          </div>
        </header>

        {/* Content: pages with their own sidebar live in ONE rounded card (sidebar | header + page), exactly like unique-ops' workspace. */}
        <div className={cn("rs-stage", hasModuleSide && "has-card")}>
          <div className={cn("rs-shell", !hasModuleSide && "rs-noside", hasModuleSide && !railOpen && "is-side-collapsed")}>
            {hasModuleSide ? <aside className="rs-panel rs-panel--side">{sidebar(!railOpen)}</aside> : null}
            <section className="rs-panel rs-panel--main">
              {hasModuleSide ? (
                <header className="rs-head hidden lg:flex">
                  <button
                    type="button"
                    className="rs-icon-btn"
                    onClick={toggleRail}
                    title={railOpen ? "Collapse panel ([)" : "Expand panel ([)"}
                    aria-label={railOpen ? "Collapse panel" : "Expand panel"}
                    aria-pressed={!railOpen}
                  >
                    <PanelLeft size={18} strokeWidth={1.75} />
                  </button>
                  <div className="rs-head-title">
                    <b>{activeLabel || sidebarTitle}</b>
                    {activeLabel && activeLabel !== sidebarTitle ? <span>{sidebarTitle}</span> : null}
                  </div>
                  <div className="rs-head-actions">
                    <button type="button" className="rs-icon-btn" onClick={onOpenSearch} title="Search (Ctrl/⌘ K)" aria-label="Search">
                      <CommandIcon size={17} />
                    </button>
                    {(navId as AppSection) !== "settings" ? (
                      <button
                        type="button"
                        className="rs-icon-btn"
                        onClick={() => setSettingsOpen((v) => !v)}
                        title={`Module settings · ${sidebarTitle}`}
                        aria-label="Module settings"
                        aria-pressed={settingsOpen}
                      >
                        <Settings size={17} />
                      </button>
                    ) : null}
                    <button type="button" className="rs-icon-btn" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
                      <HelpCircle size={17} />
                    </button>
                  </div>
                </header>
              ) : null}
              {settingsOpen && navId !== "settings" ? (
                <div className="ms-host">
                  <ModuleSettingsView
                    id={navId}
                    title={sectionLabel(navId)}
                    items={allItems}
                    hasAttention={warnItems.length > 0}
                    newLabel={primary?.label}
                    onClose={() => setSettingsOpen(false)}
                  />
                </div>
              ) : null}
              {/* Stays mounted while settings are open, so the page keeps its state and its side panel. */}
              <main
                ref={mainRef}
                className={cn("ms-scope rs-scroll thin-scroll min-h-0 flex-1 overflow-y-auto pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0", settingsOpen && navId !== "settings" && "hidden")}
              >
                {elementsCss ? <style>{elementsCss}</style> : null}
                {children}
              </main>
            </section>
          </div>
        </div>
      </div>

      <AiAssistant section={sectionLabel(section)} />
      {note ? <div className="ms-toast" role="status">{note}</div> : null}
      {helpOpen ? (
        <div className="ms-help" role="dialog" aria-label="Keyboard shortcuts" onClick={() => setHelpOpen(false)}>
          <div className="ms-help-box" onClick={(e) => e.stopPropagation()}>
            <h3>Keyboard shortcuts</h3>
            {HOTKEYS.map(([k, d]) => (
              <div className="ms-opt" key={k}>
                <div className="ms-opt-main"><div className="ms-opt-title">{d}</div></div>
                <kbd className="ms-kbd">{k}</kbd>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Phone: the module sidebar as a sheet (opened by the top-left hamburger) */}
      {sideOpen && hasModuleSide ? (
        <div className="lg:hidden">
          <button type="button" aria-label="Close sections" className="msheet-backdrop" onClick={() => setSideOpen(false)} />
          <aside className="msheet" role="dialog" aria-label={`${sidebarTitle} sections`}>
            <div className="msheet-head">
              <b>{sidebarTitle}</b>
              <button type="button" className="rs-icon-btn" onClick={() => setSideOpen(false)} aria-label="Close sections">
                <X size={18} strokeWidth={1.9} />
              </button>
            </div>
            <div className="msheet-body">
              <ModuleSidebar
                title={sidebarTitle}
                primary={primary}
                sections={sections}
                onNavigate={() => setSideOpen(false)}
                onPick={() => setSettingsOpen(false)}
                onSettings={() => setSettingsOpen((v) => !v)}
                settingsActive={settingsOpen}
              />
            </div>
          </aside>
        </div>
      ) : null}

      {/* Mobile: the main navigation as a drawer */}
      {drawerOpen ? (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[65] bg-black/45"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="mdrawer">
            <div className="mdrawer-main">{mainNav(true, () => setDrawerOpen(false))}</div>
          </div>
        </div>
      ) : null}

      {/* Mobile bottom bar — identical to unique-ops: menu · quick action · mail · bell · profile */}
      <MobileBottomNav
        menuOpen={drawerOpen}
        onToggleMenu={() => {
          setMoreOpen(false);
          setSideOpen(false);
          setDrawerOpen((v) => !v);
        }}
        quickActions={quickActionList}
        onOpenMail={() => {
          setSideOpen(false);
          setDrawerOpen(false);
          setMoreOpen(false);
          onSelect("email");
        }}
        mailActive={navId === "email"}
        bell={
          <NotificationCenter
            signals={signals}
            critical={critical}
            dismissedCount={store.dismissedSignals.length}
            onOpenRecord={openSignalRecord}
            onDismiss={store.dismissSignal}
            onRestore={store.restoreSignals}
            onViewAll={() => onSelect("signals")}
            variant="bottom"
          />
        }
        userName={store.user?.name}
        profileOpen={moreOpen}
        onProfile={() => {
          setSideOpen(false);
          setDrawerOpen(false);
          setMoreOpen((v) => !v);
        }}
      />

      {/* Profile sheet above the bottom bar */}
      {moreOpen ? (
        <div className="fixed inset-0 z-[65] lg:hidden">
          <div className="absolute inset-0 bg-black/55" onClick={() => setMoreOpen(false)} />
          <div className="mbn-sheet">
            <div className="mbn-sheet-id">
              <span className="mbn-avatar mbn-avatar--lg">{initial}</span>
              <div>
                <b>{store.user?.name}</b>
                <span>{store.user?.role}</span>
              </div>
            </div>
            <button type="button" onClick={() => { onSelect("settings"); setMoreOpen(false); }}>
              <Settings size={16} /> Settings
            </button>
            <button type="button" onClick={toggle}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} {nextThemeLabel(theme)}
            </button>
            <button type="button" onClick={() => store.signOut()}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Sticky page header used by modules */
export function PageHeader({
  title,
  subtitle,
  toolbar,
}: {
  title: string;
  subtitle?: string;
  toolbar?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-divider tfl-glass">
      <div className="mx-auto flex min-h-[56px] max-w-[1400px] items-center gap-3 px-4 py-3 lg:min-h-[64px] lg:px-8">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold tracking-tight lg:text-[26px]">{title}</h1>
          {subtitle ? (
            <p className="truncate text-[13px] text-ink-secondary">{subtitle}</p>
          ) : null}
        </div>
        {toolbar}
      </div>
    </header>
  );
}
