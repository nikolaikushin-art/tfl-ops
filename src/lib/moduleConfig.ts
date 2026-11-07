import { useSyncExternalStore } from "react";

/**
 * Per-module settings — port of unique-ops v132 `lib/moduleConfig.ts`.
 *
 * One schema drives the settings screen, the defaults and the sanitising. Values are stored per
 * browser (localStorage); unknown / missing keys fall back to the defaults. The module id is the
 * main-navigation id ("email", "dealdesk", …). Every field listed here is read by the app —
 * nothing in this file is decorative.
 *
 *   generic sections  (every module)  View · Side panel · Work · Notifications · Export CSV · Keyboard
 *   module sections   (per module)    MODULE_RULES  — start views, defaults, confirmations
 *   elements          (per module)    MODULE_ELEMENTS — what the module shows (data-el hooks / useElementOn)
 */
export type FieldKind = "toggle" | "select" | "number" | "text";
export interface ConfigOption { value: string; label: string }
export interface ConfigField {
  key: string;
  label: string;
  hint?: string;
  kind: FieldKind;
  def: boolean | string | number;
  options?: ConfigOption[];
  min?: number; max?: number; step?: number; unit?: string;
  /** Stored and sanitised like any field, but drawn by custom UI. */
  hidden?: boolean;
}
export interface ConfigSection {
  id: string; title: string; sub: string; keywords?: string; fields: ConfigField[];
  /** Hub tabs (Orders, Invoices…) keep their values under their own id; the hub's settings screen lists them. */
  owner?: string;
}

const opt = (...pairs: [string, string][]): ConfigOption[] => pairs.map(([value, label]) => ({ value, label }));
const HOURS = opt(...Array.from({ length: 24 }, (_, h) => { const t = `${String(h).padStart(2, "0")}:00`; return [t, t] as [string, string]; }));

/* ───────────── generic sections (same keys in every module) ───────────── */

export const VIEW_SECTION: ConfigSection = {
  id: "view", title: "View & layout", sub: "Density, text size, width, numbers, motion",
  keywords: "density compact large small text animation motion theme preview zebra striped width numbers",
  fields: [
    { key: "density", label: "Density", hint: "Compact shows more rows on screen", kind: "select", def: "comfortable", options: opt(["comfortable", "Comfortable"], ["compact", "Compact"]) },
    { key: "textSize", label: "Text size", kind: "select", def: "md", options: opt(["sm", "Small"], ["md", "Normal"], ["lg", "Large"]) },
    { key: "pageWidth", label: "Content width", hint: "A narrower column is easier to read on big monitors", kind: "select", def: "full", options: opt(["narrow", "Narrow"], ["wide", "Wide"], ["full", "Full width"]) },
    { key: "zebra", label: "Striped rows", hint: "Alternate the background of rows in tables and lists", kind: "toggle", def: false },
    { key: "tabularNums", label: "Aligned numbers", hint: "Digits of equal width — amounts and dates line up in a column", kind: "toggle", def: false },
    { key: "reduceMotion", label: "Reduce motion", hint: "Turns off transitions and animations in this module", kind: "toggle", def: false },
  ],
};
export const SIDEBAR_SECTION: ConfigSection = {
  id: "sidebar", title: "Side panel & start", sub: "Sections, counters, how the module opens",
  keywords: "sidebar panel counters sections hide show remember collapse expand start open first tab title",
  fields: [
    { key: "sidebarStart", label: "Panel on open", hint: "“Remember” keeps it the way you left it", kind: "select", def: "remember", options: opt(["remember", "Remember"], ["open", "Expanded"], ["rail", "Collapsed"]) },
    { key: "startItem", label: "Section to open first", kind: "text", def: "", hidden: true },
    { key: "showCounts", label: "Counters in the panel", hint: "Numbers next to sections", kind: "toggle", def: true },
    { key: "groupLabels", label: "Group headings", hint: "Captions above groups of sections", kind: "toggle", def: true },
    { key: "rememberSection", label: "Remember last section", hint: "Next time the module opens in the same panel section (overrides “Section to open first”)", kind: "toggle", def: false },
    { key: "hiddenItems", label: "Hidden sections", kind: "text", def: "", hidden: true },
  ],
};
export const NOTIFY_SECTION: ConfigSection = {
  id: "notify", title: "Notifications", sub: "Reminder on open, tab number, browser alerts, quiet hours",
  keywords: "notification remind reminder toast attention tab title badge sound quiet hours do not disturb browser permission alert",
  fields: [
    { key: "attentionToast", label: "Reminder when the module opens", hint: "A short notice if panel sections need attention (overdue, unread, pending…)", kind: "toggle", def: false },
    { key: "tabBadge", label: "Number in the browser tab", hint: "How many sections need attention — “(3) Email” in the tab title", kind: "toggle", def: false },
    { key: "notify", label: "Browser notifications", hint: "Tell me when something in this module's panel starts needing attention (overdue, unread, pending…)", kind: "toggle", def: false },
    { key: "notifyDetails", label: "Show details", hint: "Off — only “Needs attention”, no section names or numbers", kind: "toggle", def: true },
    { key: "notifySound", label: "Sound", kind: "toggle", def: false },
    { key: "quietOn", label: "Do not disturb", hint: "No notifications during these hours", kind: "toggle", def: false },
    { key: "quietFrom", label: "Quiet hours — from", kind: "select", def: "22:00", options: HOURS },
    { key: "quietTo", label: "Quiet hours — to", hint: "Can cross midnight: 22:00 to 08:00", kind: "select", def: "08:00", options: HOURS },
  ],
};
export const EXPORT_SECTION: ConfigSection = {
  id: "export", title: "CSV export", sub: "Delimiter, encoding, file name",
  keywords: "csv excel delimiter comma semicolon encoding bom file download export",
  fields: [
    { key: "csvDelimiter", label: "Delimiter", hint: "Semicolon opens correctly in many European Excel installs", kind: "select", def: ",", options: opt([",", "Comma ,"], [";", "Semicolon ;"], ["\t", "Tab"]) },
    { key: "csvBom", label: "Excel encoding (BOM)", hint: "Keeps accents and symbols intact when Excel opens the file", kind: "toggle", def: true },
    { key: "csvDateInName", label: "Date in file name", hint: "contacts-2026-10-06.csv instead of contacts.csv", kind: "toggle", def: false },
  ],
};
export const KEYS_SECTION: ConfigSection = {
  id: "keys", title: "Keyboard", sub: "Hotkeys of the module",
  keywords: "keyboard hotkeys shortcuts keys",
  fields: [{ key: "hotkeys", label: "Hotkeys", hint: "“/” search, “n” new, “[” collapse panel, 1–9 panel sections, “?” help", kind: "toggle", def: true }],
};

export const HOTKEYS: [string, string][] = [
  ["/", "Focus search"],
  ["n", "Create a new record"],
  ["[", "Collapse / expand the module panel"],
  ["1–9", "Panel section by number"],
  ["Ctrl/⌘ K", "Global search"],
  ["Ctrl/⌘ J", "AI assistant"],
  ["?", "This list of keys"],
  ["Esc", "Close dialog / clear search"],
];

/* ───────────── module-specific rules (each field is read by that module) ───────────── */

const PERIOD_OPTS = opt(["30", "30 days"], ["90", "90 days"], ["fy", "Financial year"], ["all", "All time"]);
const CONFIRM_DELETE: ConfigField = { key: "confirmDelete", label: "Confirm before deleting", hint: "Ask “Are you sure?” first", kind: "toggle", def: true };

export const MODULE_RULES: Record<string, ConfigSection[]> = {
  dashboard: [{
    id: "summary", title: "Dashboard summary", sub: "What the home screen emphasises", keywords: "period margin notifications alerts urgent limit kpi",
    fields: [
      { key: "period", label: "Net margin period", hint: "Window for the Net margin tile", kind: "select", def: "90", options: PERIOD_OPTS },
      { key: "notifLimit", label: "Notifications shown", hint: "Rest sit behind “See all”", kind: "select", def: "6", options: opt(["3", "3"], ["6", "6"], ["10", "10"], ["0", "All"]) },
      { key: "alertsLevel", label: "Which alerts to list", hint: "Urgent only hides medium and low", kind: "select", def: "all", options: opt(["all", "All"], ["urgent", "Urgent only"]) },
      { key: "kpiFocus", label: "Lead KPI", hint: "Which number sits first in the strip", kind: "select", def: "deals", options: opt(["deals", "Live deals"], ["funds", "Funds in escrow"], ["requests", "Open requests"], ["margin", "Net margin"]) },
      { key: "showWeekendAlerts", label: "Surface weekend alerts", hint: "Include items that became urgent over the weekend", kind: "toggle", def: true },
    ],
  }],
  reports: [{
    id: "reports", title: "Reports defaults", sub: "Period and how margin is sliced", keywords: "period lens brand buy sell customer supplier",
    fields: [
      { key: "period", label: "Default period", kind: "select", def: "90", options: PERIOD_OPTS },
      { key: "lens", label: "Default lens", hint: "How revenue and margin are grouped", kind: "select", def: "brand", options: opt(["brand", "Brand"], ["sell", "Sell market"], ["buy", "Buy market"], ["customer", "Customer"], ["supplier", "Supplier"]) },
      { key: "comparePrior", label: "Compare to prior period", hint: "Show a second column for the previous window", kind: "toggle", def: false },
      { key: "minMargin", label: "Hide lines under margin", hint: "0 = show everything", kind: "number", def: 0, min: 0, max: 100000, unit: "£" },
    ],
  }],
  contacts: [{
    id: "directory", title: "Directory", sub: "How companies and people open", keywords: "companies people level start tab buyers suppliers traders",
    fields: [
      { key: "startLevel", label: "Show", hint: "Companies, or the people who work there", kind: "select", def: "companies", options: opt(["companies", "Companies"], ["people", "People"]) },
      { key: "startTab", label: "Directory tab on open", kind: "select", def: "all", options: opt(["all", "All"], ["buyer", "Buyers"], ["supplier", "Suppliers"], ["trader", "Traders"], ["other", "Other"]) },
      { key: "sortBy", label: "Order by", kind: "select", def: "name", options: opt(["name", "Name"], ["country", "Country, then name"], ["recent", "Recently active"]) },
      { key: "showInactiveParties", label: "Show inactive companies", kind: "toggle", def: false },
      { key: "requireEmailOnPerson", label: "People must have an email", hint: "Blocks saving a person without an email address", kind: "toggle", def: false },
    ],
  }],
  markets: [{
    id: "countries", title: "Markets & countries", sub: "Order and filters on the map list", keywords: "sort order countries deals contacts empty",
    fields: [
      { key: "sortBy", label: "Order countries by", kind: "select", def: "name", options: opt(["name", "Name"], ["contacts", "Most contacts"], ["buying", "Most bought"], ["selling", "Most sold"]) },
      { key: "onlyWithDeals", label: "Only countries with deals", kind: "toggle", def: false },
      { key: "showEmptyMarkets", label: "Show markets with no contacts", kind: "toggle", def: true },
      { key: "defaultRegion", label: "Region filter on open", kind: "select", def: "all", options: opt(["all", "All regions"], ["eu", "Europe"], ["uk", "UK & Ireland"], ["asia", "Asia"], ["americas", "Americas"]) },
    ],
  }],
  products: [{
    id: "catalogue", title: "Product catalogue", sub: "Order, inactive rows, delete safety", keywords: "delete confirm remove product sort order inactive",
    fields: [
      { key: "sortBy", label: "Order products by", kind: "select", def: "name", options: opt(["name", "Name"], ["category", "Category"], ["sku", "SKU"], ["margin", "Best margin"]) },
      { key: "showInactive", label: "Show inactive products", kind: "toggle", def: true },
      { key: "defaultUnit", label: "Default unit on new products", kind: "select", def: "case", options: opt(["case", "Case"], ["bottle", "Bottle"], ["pallet", "Pallet"], ["unit", "Unit"]) },
      CONFIRM_DELETE,
    ],
  }],
  brands: [{
    id: "brands", title: "Brands", sub: "Which brands surface first", keywords: "brand sort pin favourite",
    fields: [
      { key: "sortBy", label: "Order brands by", kind: "select", def: "name", options: opt(["name", "Name"], ["products", "Most products"], ["deals", "Most deals"]) },
      { key: "hideEmpty", label: "Hide brands with no products", kind: "toggle", def: false },
    ],
  }],
  priceintel: [{
    id: "pricewindow", title: "Price intelligence", sub: "How far history looks back", keywords: "window history days offers",
    fields: [
      { key: "windowDays", label: "Price history window", kind: "select", def: "90", options: opt(["30", "30 days"], ["90", "90 days"], ["180", "180 days"], ["365", "1 year"]) },
      { key: "onlyApproved", label: "Only approved offers in charts", kind: "toggle", def: true },
    ],
  }],
  requirements: [{
    id: "requests", title: "Requests queue", sub: "Which requests show first", keywords: "status open matched quoted sort",
    fields: [
      { key: "startFilter", label: "Filter on open", kind: "select", def: "open", options: opt(["open", "Open"], ["new", "New"], ["matched", "Matched"], ["quoted", "Quoted"], ["all", "All"]) },
      { key: "sortBy", label: "Order requests by", kind: "select", def: "newest", options: opt(["newest", "Newest"], ["oldest", "Oldest"], ["priority", "Priority"], ["customer", "Customer A–Z"]) },
      { key: "autoMatch", label: "Suggest supplier matches on open", kind: "toggle", def: true },
    ],
  }],
  quotations: [{
    id: "quotations", title: "Quotations", sub: "Which quotes surface first", keywords: "quote status validity",
    fields: [
      { key: "startFilter", label: "Filter on open", kind: "select", def: "active", options: opt(["active", "Active"], ["draft", "Drafts"], ["sent", "Sent"], ["all", "All"]) },
      { key: "sortBy", label: "Order by", kind: "select", def: "updated", options: opt(["updated", "Recently updated"], ["expiry", "Expiring soon"], ["value", "Highest value"]) },
      { key: "warnDays", label: "Warn before expiry (days)", kind: "number", def: 3, min: 0, max: 30 },
    ],
  }],
  dealdesk: [{
    id: "deals", title: "Deals", sub: "Pipeline focus and ordering", keywords: "stage live all filter deals escrow",
    fields: [
      { key: "startStage", label: "Deals filter on open", kind: "select", def: "live", options: opt(["live", "Live"], ["escrow", "In escrow"], ["all", "All"]) },
      { key: "sortBy", label: "Order deals by", kind: "select", def: "updated", options: opt(["updated", "Recently updated"], ["newest", "Newest first"], ["oldest", "Oldest first"], ["reference", "Reference"], ["value", "Highest value"]) },
      { key: "highlightEscrow", label: "Highlight funds in escrow", kind: "toggle", def: true },
      { key: "requireWarehouse", label: "Warehouse required before escrow", kind: "toggle", def: true },
    ],
  }],
  orders: [{
    id: "orders", title: "Orders", sub: "Which orders open first", keywords: "order status fulfilment",
    fields: [
      { key: "startFilter", label: "Filter on open", kind: "select", def: "open", options: opt(["open", "Open"], ["confirmed", "Confirmed"], ["shipped", "Shipped"], ["all", "All"]) },
      { key: "sortBy", label: "Order by", kind: "select", def: "newest", options: opt(["newest", "Newest"], ["delivery", "Delivery date"], ["value", "Value"]) },
    ],
  }],
  invoices: [{
    id: "invoices", title: "Invoices", sub: "Collections focus", keywords: "overdue paid draft",
    fields: [
      { key: "startFilter", label: "Filter on open", kind: "select", def: "open", options: opt(["open", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"], ["all", "All"]) },
      { key: "sortBy", label: "Order by", kind: "select", def: "due", options: opt(["due", "Due date"], ["newest", "Newest"], ["amount", "Amount"]) },
      { key: "ageingBuckets", label: "Show ageing buckets", kind: "toggle", def: true },
    ],
  }],
  shipments: [{
    id: "shipments", title: "Shipments & delivery", sub: "In-transit focus", keywords: "shipment delivery exception",
    fields: [
      { key: "startFilter", label: "Filter on open", kind: "select", def: "active", options: opt(["active", "In transit"], ["exceptions", "Exceptions"], ["delivered", "Delivered"], ["all", "All"]) },
      { key: "sortBy", label: "Order by", kind: "select", def: "eta", options: opt(["eta", "ETA"], ["newest", "Newest"], ["origin", "Origin"]) },
    ],
  }],
  payments: [{
    id: "payments", title: "Payments", sub: "Receipts and supplier payouts", keywords: "payment receipt payout",
    fields: [
      { key: "startFilter", label: "Filter on open", kind: "select", def: "recent", options: opt(["recent", "Recent"], ["inbound", "Inbound"], ["outbound", "Outbound"], ["all", "All"]) },
      { key: "sortBy", label: "Order by", kind: "select", def: "newest", options: opt(["newest", "Newest"], ["amount", "Amount"]) },
    ],
  }],
  warehouses: [{
    id: "stock", title: "Bonded stock", sub: "Lot filter and duty view", keywords: "available reserved sold lots status T1 T2",
    fields: [
      { key: "startStatus", label: "Lots shown first", kind: "select", def: "all", options: opt(["all", "All"], ["available", "Available"], ["reserved", "Reserved"], ["sold", "Sold"]) },
      { key: "sortBy", label: "Order lots by", kind: "select", def: "newest", options: opt(["newest", "Newest in"], ["oldest", "Oldest in (FIFO)"], ["quantity", "Largest quantity"], ["product", "Product A–Z"]) },
      { key: "dutyOnly", label: "Duty status", kind: "select", def: "all", options: opt(["all", "T1 and T2"], ["T1", "T1 only"], ["T2", "T2 only"]) },
      { key: "warnLowStock", label: "Warn when available cases <", kind: "number", def: 10, min: 0, max: 1000, unit: "cs" },
    ],
  }],
  email: [{
    id: "mailbox", title: "Mailbox", sub: "Folder and reading behaviour", keywords: "inbox folder unread thread",
    fields: [
      { key: "startFolder", label: "Folder on open", kind: "select", def: "inbox", options: opt(["inbox", "Inbox"], ["starred", "Starred"], ["followup", "Follow up"], ["sent", "Sent"]) },
      { key: "sortBy", label: "Order messages by", kind: "select", def: "newest", options: opt(["newest", "Newest"], ["oldest", "Oldest"], ["sender", "Sender"]) },
      { key: "markReadOnOpen", label: "Mark read when opened", kind: "toggle", def: true },
      { key: "showPreview", label: "Show body preview in list", kind: "toggle", def: true },
      { key: "groupByThread", label: "Group by conversation", kind: "toggle", def: false },
    ],
  }],
  whatsapp: [{
    id: "chats", title: "WhatsApp chats", sub: "Which conversations surface first", keywords: "unread pinned sort chat",
    fields: [
      { key: "startFilter", label: "Chats shown first", kind: "select", def: "all", options: opt(["all", "All"], ["unread", "Unread"], ["pinned", "Pinned"]) },
      { key: "sortBy", label: "Order chats by", kind: "select", def: "recent", options: opt(["recent", "Most recent"], ["unread", "Unread first"], ["name", "Name A–Z"]) },
      { key: "showGroupsNote", label: "Remind that groups stay on the phone", kind: "toggle", def: true },
    ],
  }],
  campaigns: [{
    id: "campaigns", title: "Campaigns", sub: "Editor and list behaviour", keywords: "draft sent editor delete",
    fields: [
      { key: "startFilter", label: "List filter on open", kind: "select", def: "all", options: opt(["all", "All"], ["draft", "Drafts"], ["sent", "Sent"]) },
      { key: "defaultTab", label: "Editor opens on", kind: "select", def: "content", options: opt(["content", "Content"], ["audience", "Audience"], ["schedule", "Schedule"]) },
      CONFIRM_DELETE,
    ],
  }],
  kyc: [{
    id: "kycqueue", title: "KYC queue", sub: "Which records show first", keywords: "review sent approved risk",
    fields: [
      { key: "startFilter", label: "Filter on open", kind: "select", def: "action", options: opt(["action", "Needs action"], ["review", "In review"], ["sent", "Sent"], ["all", "All"]) },
      { key: "sortBy", label: "Order by", kind: "select", def: "oldest", options: opt(["oldest", "Oldest first"], ["newest", "Newest"], ["name", "Company name"]) },
      { key: "requireDocs", label: "Block approval without documents", kind: "toggle", def: true },
    ],
  }],
  documents: [{
    id: "library", title: "Document library", sub: "First folder and delete safety", keywords: "folder library delete",
    fields: [
      { key: "startLibrary", label: "Library on open", kind: "select", def: "deals", options: opt(["deals", "Deals & shipping"], ["kyc", "KYC & company"]) },
      { key: "sortBy", label: "Order files by", kind: "select", def: "newest", options: opt(["newest", "Newest"], ["name", "Name"], ["type", "Type"]) },
      CONFIRM_DELETE,
    ],
  }],
  residency: [{
    id: "tracker", title: "Residency tracker", sub: "Tab and thresholds", keywords: "days tax year threshold",
    fields: [
      { key: "startTab", label: "Tab on open", kind: "select", def: "people", options: opt(["people", "People"], ["calendar", "Calendar"], ["rules", "Rules"]) },
      { key: "warnDays", label: "Warn when days exceed", kind: "number", def: 90, min: 1, max: 183, unit: "days" },
      { key: "taxYearStart", label: "Tax year starts", kind: "select", def: "apr6", options: opt(["apr6", "6 April (UK)"], ["jan1", "1 January"]) },
    ],
  }],
  accounting: [{
    id: "books", title: "Books", sub: "Start view for accounting", keywords: "pnl ledger expenses xero",
    fields: [
      { key: "startView", label: "Start view", kind: "select", def: "pnl", options: opt(["pnl", "Profit & loss"], ["ledger", "Ledger"], ["expenses", "Expenses"]) },
      { key: "period", label: "Default period", kind: "select", def: "30", options: PERIOD_OPTS },
      { key: "showUnposted", label: "Highlight items not yet in Xero", kind: "toggle", def: true },
    ],
  }],
  cashflow: [{
    id: "forecast", title: "Cash forecast", sub: "Horizon and what is included", keywords: "weeks horizon escrow expenses",
    fields: [
      { key: "weeks", label: "Forecast horizon", kind: "select", def: "8", options: opt(["4", "4 weeks"], ["8", "8 weeks"], ["12", "12 weeks"], ["26", "26 weeks"]) },
      { key: "includeEscrow", label: "Include funds awaiting release", kind: "toggle", def: true },
      { key: "includeRecurring", label: "Include recurring expenses", kind: "toggle", def: true },
      { key: "warnBelow", label: "Warn when projected cash under", kind: "number", def: 0, min: 0, max: 1000000, unit: "£" },
    ],
  }],
};


/** Hub modules list their child tabs in the same settings screen. */
export const HUB_MEMBERS: Record<string, string[]> = {
  dealdesk: ["orders", "invoices", "shipments", "payments"],
  products: ["brands", "priceintel"],
  requirements: ["quotations"],
};

export function rulesFor(id: string): ConfigSection[] {
  const own = (MODULE_RULES[id] ?? []).map((r) => ({ ...r, owner: id }));
  const tabs = (HUB_MEMBERS[id] ?? []).flatMap((m) => (MODULE_RULES[m] ?? []).map((r) => ({ ...r, owner: m })));
  return [...own, ...tabs];
}
/** Config ids whose values belong to this screen. */
export const ownersOf = (id: string): string[] => [id, ...(HUB_MEMBERS[id] ?? [])];

/** Modules that can export to CSV. */
export const EXPORT_MODULES = ["contacts", "reports", "accounting", "residency"];

/* ───────────── «Columns & elements»: what each module shows ─────────────
   Everything here is `data-el="<key>"` in the markup (hidden with CSS while the module is open)
   or read in code with useElementOn(). */
export interface ElementDef { key: string; label: string }
export const MODULE_ELEMENTS: Record<string, ElementDef[]> = {
  dashboard: [
    { key: "heroSub", label: "Greeting line under the title" },
    { key: "kpis", label: "KPI strip" },
    { key: "tileDeals", label: "Tile: Live deals by stage" },
    { key: "tileFunds", label: "Tile: Funds awaiting release" },
    { key: "tileOffers", label: "Tile: Supplier offers to review" },
    { key: "tileRequests", label: "Tile: Customer requests and matches" },
    { key: "tileKyc", label: "Tile: KYC pending" },
    { key: "tileMargin", label: "Tile: Net margin" },
    { key: "notifications", label: "Notifications list" },
  ],
  reports: [
    { key: "tiles", label: "Summary tiles" },
    { key: "trend", label: "Net margin trend chart" },
    { key: "lens", label: "Revenue and margin by lens" },
    { key: "requests", label: "Requests block" },
  ],
  cashflow: [
    { key: "tiles", label: "Summary tiles" },
    { key: "warnings", label: "Warnings" },
    { key: "incoming", label: "Money coming in" },
    { key: "outgoing", label: "Money going out" },
    { key: "forecast", label: "Forecast" },
    { key: "exposure", label: "Currency exposure" },
  ],
};

export interface ConfigModule { id: string; rules: ConfigSection[]; elements: ConfigSection | null }
const ELEMENTS_META: Record<string, { title: string; sub: string }> = {
  dashboard: { title: "Dashboard tiles", sub: "Which home tiles are visible" },
  reports: { title: "Report blocks", sub: "Charts and summary blocks on Reports" },
  cashflow: { title: "Cash flow panels", sub: "Forecast, exposure and money panels" },
};
export function elementsSectionFor(id: string): ConfigSection | null {
  const els = MODULE_ELEMENTS[id];
  if (!els?.length) return null;
  const meta = ELEMENTS_META[id] ?? { title: "On-screen blocks", sub: "What this module shows" };
  return {
    id: "elements", title: meta.title, sub: meta.sub,
    keywords: "columns fields hide show blocks tiles widgets cards",
    fields: els.map((e) => ({ key: `el_${e.key}`, label: e.label, kind: "toggle" as FieldKind, def: true })),
  };
}

/** Sections shown on a module's settings screen — unique to that module only.
 *  No shared View / Side panel / Notifications / Keyboard blocks (those were repetitive).
 *  Density & related keys still apply via defaultsFor() so the shell keeps working. */
export function allSectionsFor(id: string): ConfigSection[] {
  const out: ConfigSection[] = [...(MODULE_RULES[id] ?? [])];
  const els = elementsSectionFor(id);
  if (els) out.push(els);
  if (EXPORT_MODULES.includes(id)) out.push({
    ...EXPORT_SECTION,
    title: id === "contacts" ? "Export directory" : id === "reports" ? "Export report data" : id === "accounting" ? "Export books" : id === "residency" ? "Export residency data" : EXPORT_SECTION.title,
    sub: "CSV download for this module",
  });
  return out;
}

export type ModuleValues = Record<string, boolean | string | number>;

export function defaultsFor(id: string): ModuleValues {
  const out: ModuleValues = {};
  // Silent interface defaults (not shown as generic sections — avoids repetition)
  VIEW_SECTION.fields.forEach((f) => { out[f.key] = f.def; });
  SIDEBAR_SECTION.fields.forEach((f) => { out[f.key] = f.def; });
  NOTIFY_SECTION.fields.forEach((f) => { out[f.key] = f.def; });
  allSectionsFor(id).forEach((s) => s.fields.forEach((f) => { out[f.key] = f.def; }));
  return out;
}

const KEY = "tfl.module-config.v2";
const LEGACY_KEY = "tfl.module-config.v1";
let cache: Record<string, ModuleValues> | null = null;
const listeners = new Set<() => void>();
const snapshots = new Map<string, ModuleValues>();

function readAll(): Record<string, ModuleValues> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY); // v1 values carry over: same keys
    cache = JSON.parse(raw || "{}") || {};
  } catch { cache = {}; }
  return cache!;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(readAll())); } catch { /* private mode / full */ }
}
function sanitize(id: string, raw: Record<string, unknown> | undefined): ModuleValues {
  const out = defaultsFor(id);
  if (!raw) return out;
  allSectionsFor(id).forEach((s) => s.fields.forEach((f) => {
    const v = raw[f.key];
    if (v === undefined) return;
    if (f.kind === "toggle" && typeof v === "boolean") out[f.key] = v;
    else if (f.kind === "select" && typeof v === "string" && f.options?.some((o) => o.value === v)) out[f.key] = v;
    else if (f.kind === "text" && typeof v === "string" && v.length < 2000) out[f.key] = v;
    else if (f.kind === "number" && typeof v === "number" && isFinite(v)) out[f.key] = Math.min(f.max ?? 1e9, Math.max(f.min ?? -1e9, v));
  }));
  return out;
}
function emit() { snapshots.clear(); listeners.forEach((l) => l()); }

export function getModuleConfig(id: string): ModuleValues {
  let s = snapshots.get(id);
  if (!s) { s = sanitize(id, readAll()[id]); snapshots.set(id, s); }
  return s;
}
export function setModuleConfig(id: string, patch: ModuleValues) {
  const all = readAll();
  all[id] = { ...(all[id] || {}), ...patch };
  persist(); emit();
}
export function resetModuleConfig(id: string) {
  delete readAll()[id]; persist(); emit();
}
export function resetModuleConfigKeys(id: string, keys: string[]) {
  const all = readAll();
  if (all[id]) { keys.forEach((k) => delete all[id][k]); if (!Object.keys(all[id]).length) delete all[id]; }
  persist(); emit();
}
export function replaceModuleConfig(id: string, values: Record<string, unknown>) {
  const all = readAll();
  const clean = sanitize(id, values);
  const def = defaultsFor(id);
  const diff: ModuleValues = {};
  Object.keys(clean).forEach((k) => { if (clean[k] !== def[k]) diff[k] = clean[k]; });
  if (Object.keys(diff).length) all[id] = diff; else delete all[id];
  persist(); emit();
}
export function isModuleCustomised(id: string): boolean {
  const v = readAll()[id];
  return !!v && Object.keys(v).length > 0;
}
/** How many values differ from the defaults. */
export function changedCount(id: string): number {
  const v = getModuleConfig(id), d = defaultsFor(id);
  return Object.keys(d).filter((k) => v[k] !== d[k]).length;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; emit(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}
export function useModuleConfigValues(id: string): ModuleValues {
  return useSyncExternalStore(subscribe, () => getModuleConfig(id), () => getModuleConfig(id));
}
/** Convenience for pages: `const cfg = useModuleCfg("cashflow"); cfg.weeks as string`. */
export const useModuleCfg = useModuleConfigValues;
/** Non-hook read, e.g. inside event handlers. */
export const readModuleCfg = getModuleConfig;

export const parseHidden = (s: unknown): string[] => (typeof s === "string" && s ? s.split("|").filter(Boolean) : []);
export const joinHidden = (a: string[]) => a.join("|");
