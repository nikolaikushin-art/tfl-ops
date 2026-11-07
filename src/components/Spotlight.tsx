/**
 * Spotlight — the ⌘K surface.
 *
 * This replaces the previous search overlay, which had three problems worth
 * naming because they shaped the rewrite:
 *
 * 1. **It rebuilt the whole cross-module index on every keystroke** — inside
 *    `onKeyDown`, so every arrow press walked every customer, supplier,
 *    product, order, invoice, document and KYC record — and then the renderer
 *    built it a second time. On a seeded demo that is invisible; on a client's
 *    real book it is a stutter on every key. The index is now memoised
 *    against the store and built once.
 *
 * 2. **It could only find things, never do them.** Spotlight on a Mac opens
 *    documents *and* runs actions; a palette that only navigates to a list is
 *    half a palette. Every section is now reachable by name, and the live
 *    signal queue is searchable from the same box — so ⌘K is the one thing to
 *    learn in the morning.
 *
 * 3. **Ranking was source order.** See `lib/spotlight.ts` for the replacement.
 *
 * The ranking engine is deliberately kept in `lib/spotlight.ts` so it can be
 * unit-tested without rendering anything. This file is presentation and
 * keyboard handling only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Clock,
  Command as CommandIcon,
  Users,
  Truck,
  Globe2,
  Contact,
  Package,
  Award,
  Brain,
  TrendingUp,
  ClipboardList,
  ShoppingCart,
  Receipt,
  Warehouse as WarehouseIcon,
  Route as RouteIcon,
  FolderOpen,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useLiveSignals } from "@/lib/useSignals";
import {
  flattenGroups,
  groupResults,
  highlightSegments,
  pushRecent,
  rankItems,
  resolveRecents,
  type SpotlightItem,
  type SpotlightResult,
} from "@/lib/spotlight";
import {
  NAV_GROUPS,
  sectionLabel,
  type AppSection,
} from "@/components/Shell";
import { usePrefersReducedMotion } from "@/components/apple";

/** What an item does when chosen. Kept out of `lib/spotlight.ts` so the
 *  ranking engine stays free of app navigation concerns. */
type SpotlightAction =
  | { type: "open"; section: AppSection; id?: string }
  | { type: "navigate"; section: AppSection };

const SEVERITY_TONE: Record<string, string> = {
  critical: "text-[rgb(var(--accent))]",
  high: "text-[rgb(var(--warning))]",
  medium: "text-ink-secondary",
  low: "text-ink-tertiary",
};

/** Icon per record category, so a result list reads at a glance. */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  Customers: Users,
  Suppliers: Truck,
  Markets: Globe2,
  Contacts: Contact,
  Products: Package,
  Brands: Award,
  "Pricing & offers": Brain,
  Opportunities: TrendingUp,
  Quotations: ClipboardList,
  Orders: ShoppingCart,
  Invoices: Receipt,
  Warehouses: WarehouseIcon,
  Shipments: RouteIcon,
  Documents: FolderOpen,
  KYC: ShieldCheck,
};

export function Spotlight({
  open,
  onClose,
  onOpenRecord,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onOpenRecord: (section: AppSection, id?: string) => void;
  onNavigate: (section: AppSection) => void;
}) {
  const store = useStore();
  const signals = useLiveSignals();
  const reducedMotion = usePrefersReducedMotion();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ---------------------------------------------------------------- *
   * Index — built once per store change, not once per keystroke.
   * ---------------------------------------------------------------- */

  const actionItems = useMemo<SpotlightItem[]>(() => {
    const items: SpotlightItem[] = [];
    for (const group of NAV_GROUPS) {
      for (const nav of group.items) {
        if (nav.id === "residency" && store.user?.role !== "administrator") continue;
        items.push({
          id: `go:${nav.id}`,
          label: nav.label,
          detail: `Go to ${group.label}`,
          category: "Go to",
          kind: "command",
          // Group name and a couple of natural synonyms, so "money" finds
          // Accounting without those words being on screen.
          keywords: [group.label, nav.id, "open", "go", "jump"],
          payload: { type: "navigate", section: nav.id } satisfies SpotlightAction,
        });
      }
    }
    return items;
  }, []);

  const signalItems = useMemo<SpotlightItem[]>(
    () =>
      signals.slice(0, 40).map((s) => ({
        id: `signal:${s.id}`,
        label: s.title,
        detail: s.detail,
        category: "Needs attention",
        kind: "signal" as const,
        keywords: [s.kind, s.severity, "signal", "attention", "todo"],
        // Enough to lift a critical item over a dormant record of equal text
        // quality, not enough to beat a better textual match. The unit tests
        // in lib/spotlight.test.ts pin that boundary.
        weight: s.severity === "critical" ? 60 : s.severity === "high" ? 35 : 10,
        payload: {
          type: "open",
          section: s.target as AppSection,
          id: s.recordId,
        } satisfies SpotlightAction,
      })),
    [signals],
  );

  const recordItems = useMemo<SpotlightItem[]>(() => {
    const rec = (
      id: string,
      label: string,
      detail: string,
      category: string,
      section: AppSection,
      keywords?: string[],
    ): SpotlightItem => ({
      id,
      label,
      detail,
      category,
      kind: "record",
      keywords,
      payload: { type: "open", section, id } satisfies SpotlightAction,
    });

    return [
      ...store.customers.map((x) =>
        rec(x.id, x.name, `${x.country} · Customer`, "Customers", "customers", [x.country, x.segment]),
      ),
      ...store.suppliers.map((x) =>
        rec(x.id, x.name, `${x.country} · Supplier`, "Suppliers", "suppliers", [x.country]),
      ),
      ...store.markets.map((x) =>
        rec(x.id, x.country, `${x.region} · ${x.currency}`, "Markets", "markets", [x.region, x.currency]),
      ),
      ...store.contacts.map((x) =>
        rec(x.id, `${x.firstName} ${x.lastName}`, x.email || "No email", "Contacts", "contacts", [x.email || ""]),
      ),
      ...store.products.map((x) => rec(x.id, x.name, x.sku, "Products", "products", [x.sku])),
      ...store.brands.map((x) =>
        rec(x.id, x.name, `${x.country}${x.category ? " · " + x.category : ""}`, "Brands", "brands"),
      ),
      ...store.pricingRecords.map((x) =>
        rec(x.id, x.productName, `Offer from ${x.supplierName}`, "Pricing & offers", "pricing", [x.supplierName]),
      ),
      ...store.opportunities.map((x) =>
        rec(x.id, x.title, `${x.stage} · ${x.currency} ${x.value ?? 0}`, "Opportunities", "opportunities", [x.stage]),
      ),
      ...store.quotations.map((x) =>
        rec(x.id, x.number, x.notes || x.status, "Quotations", "quotations", [x.status]),
      ),
      ...store.orders.map((x) => rec(x.id, x.number, x.status, "Orders", "orders", [x.status])),
      ...store.invoices.map((x) => rec(x.id, x.number, x.status, "Invoices", "invoices", [x.status])),
      ...store.warehouses.map((x) =>
        rec(x.id, x.name, `${x.code} · ${x.city ? x.city + ", " : ""}${x.country}`, "Warehouses", "warehouses", [x.code]),
      ),
      ...store.shipments.map((x) =>
        rec(x.id, x.reference, `${x.carrier} · ${x.destinationCountry}`, "Shipments", "shipments", [x.carrier]),
      ),
      ...store.documents.map((x) => rec(x.id, x.name, `${x.type} document`, "Documents", "documents")),
      ...store.kycRecords.map((x) =>
        rec(
          x.id,
          store.customers.find((c) => c.id === x.customerId)?.name || "KYC record",
          `KYC · ${x.status.replace("_", " ")}`,
          "KYC",
          "kyc",
        ),
      ),
    ];
  }, [store]);

  const allItems = useMemo(
    () => [...actionItems, ...signalItems, ...recordItems],
    [actionItems, signalItems, recordItems],
  );

  /* ---------------------------------------------------------------- *
   * Results
   * ---------------------------------------------------------------- */

  const groups = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed) return groupResults(rankItems(allItems, trimmed, 40));

    // Resting state. Recents first because the thing you were just looking at
    // is overwhelmingly the thing you want again, then the live queue, then a
    // short list of destinations — rather than a blank panel and a sentence
    // of instructions, which is what the old overlay showed.
    const out: { category: string; results: { item: SpotlightItem; score: number; labelRanges: never[] }[] }[] = [];
    const recentItems = resolveRecents(allItems, recents);
    if (recentItems.length) {
      out.push({
        category: "Recent",
        results: recentItems.map((item) => ({ item, score: 0, labelRanges: [] })),
      });
    }
    if (signalItems.length) {
      out.push({
        category: "Needs attention",
        results: signalItems.slice(0, 4).map((item) => ({ item, score: 0, labelRanges: [] })),
      });
    }
    out.push({
      category: "Go to",
      results: actionItems.slice(0, 6).map((item) => ({ item, score: 0, labelRanges: [] })),
    });
    return out;
  }, [query, allItems, recents, signalItems, actionItems]);

  const flat = useMemo(() => flattenGroups(groups), [groups]);

  // Keep the cursor inside the list whenever the result set changes, rather
  // than letting it point past the end and make Enter do nothing.
  useEffect(() => {
    setCursor((c) => (c >= flat.length ? 0 : c));
  }, [flat.length]);

  const choose = useCallback(
    (result: SpotlightResult | undefined) => {
      if (!result) return;
      const action = result.item.payload as SpotlightAction | undefined;
      if (!action) return;
      if (result.item.kind === "record") {
        setRecents((r) => pushRecent(r, result.item.id));
      }
      if (action.type === "navigate") onNavigate(action.section);
      else onOpenRecord(action.section, action.id);
      onClose();
      setQuery("");
      setCursor(0);
    },
    [onNavigate, onOpenRecord, onClose],
  );

  // Reset on close so reopening never shows a stale query against a list that
  // has moved on underneath it.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  // Scroll the selection into view. `block: "nearest"` keeps the list still
  // when the cursor is already visible — `center` would make every keypress
  // jump the panel.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    node?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [cursor, open, reducedMotion]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (flat.length ? (c + 1) % flat.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (flat.length ? (c - 1 + flat.length) % flat.length : 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        setCursor(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setCursor(Math.max(0, flat.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(flat[cursor]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [flat, cursor, choose, onClose],
  );

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[10vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        className={cn(
          "w-full max-w-[560px] overflow-hidden rounded-[20px] border border-divider tfl-glass shadow-overlay",
          !reducedMotion && "animate-rise",
        )}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Search row */}
        <div className="flex items-center gap-2.5 border-b border-divider px-4 py-3.5">
          <Search className="h-[18px] w-[18px] shrink-0 text-ink-tertiary" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search records, jump to a module, or work the queue…"
            aria-label="Search records and commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="spotlight-list"
            aria-activedescendant={flat[cursor] ? `spotlight-opt-${cursor}` : undefined}
            className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-tertiary"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] text-ink-tertiary transition-colors hover:bg-elevated hover:text-ink"
            >
              clear
            </button>
          ) : (
            <kbd className="shrink-0 rounded border border-divider px-1.5 py-0.5 text-[10px] text-ink-tertiary">
              esc
            </kbd>
          )}
        </div>

        {/* Results */}
        <div
          id="spotlight-list"
          ref={listRef}
          role="listbox"
          aria-label="Results"
          className="thin-scroll max-h-[52vh] overflow-y-auto overscroll-contain py-1.5"
        >
          {flat.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-ink-secondary">
                Nothing matches “{query.trim()}”.
              </p>
              <p className="mt-1 text-[12px] text-ink-tertiary">
                Spotlight searches names, references, statuses and countries across every module.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.category} className="mb-0.5">
                <div className="flex items-center gap-1.5 px-4 pb-1 pt-2">
                  {group.category === "Needs attention" ? (
                    <Sparkles className="h-3 w-3 text-ink-tertiary" />
                  ) : group.category === "Recent" ? (
                    <Clock className="h-3 w-3 text-ink-tertiary" />
                  ) : group.category === "Go to" ? (
                    <CommandIcon className="h-3 w-3 text-ink-tertiary" />
                  ) : null}
                  <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
                    {group.category}
                  </span>
                </div>
                {group.results.map((result) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  const active = index === cursor;
                  const Icon =
                    result.item.kind === "command"
                      ? CommandIcon
                      : result.item.kind === "signal"
                        ? Sparkles
                        : CATEGORY_ICON[result.item.category] || FolderOpen;
                  const segments = highlightSegments(result.item.label, result.labelRanges);
                  return (
                    <button
                      key={result.item.id}
                      id={`spotlight-opt-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={active}
                      onMouseMove={() => setCursor(index)}
                      onClick={() => choose(result)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                        active ? "bg-[rgb(var(--accent)/0.14)]" : "hover:bg-elevated/60",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-divider",
                          active ? "bg-[rgb(var(--accent)/0.18)]" : "bg-elevated",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-3.5 w-3.5",
                            result.item.kind === "signal"
                              ? SEVERITY_TONE[
                                  String((result.item.keywords || [])[1] ?? "medium")
                                ] || "text-ink-secondary"
                              : active
                                ? "text-[rgb(var(--accent))]"
                                : "text-ink-secondary",
                          )}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink">
                          {segments.map((seg, i) =>
                            seg.hit ? (
                              <mark
                                key={i}
                                className="bg-transparent font-semibold text-[rgb(var(--accent))]"
                              >
                                {seg.text}
                              </mark>
                            ) : (
                              <span key={i}>{seg.text}</span>
                            ),
                          )}
                        </span>
                        {result.item.detail ? (
                          <span className="mt-0.5 block truncate text-[11.5px] text-ink-tertiary">
                            {result.item.detail}
                          </span>
                        ) : null}
                      </span>
                      {active ? (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-divider bg-canvas/40 px-4 py-2 text-[11px] text-ink-tertiary">
          <span className="flex items-center gap-1">
            <kbd className="flex items-center rounded border border-divider px-1 py-0.5">
              <ArrowUp className="h-2.5 w-2.5" />
            </kbd>
            <kbd className="flex items-center rounded border border-divider px-1 py-0.5">
              <ArrowDown className="h-2.5 w-2.5" />
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-divider px-1 py-0.5">↵</kbd> open
          </span>
          <span className="ml-auto tabular-nums">
            {flat.length} {flat.length === 1 ? "result" : "results"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default Spotlight;
