/**
 * The Film Location CRM — Notification Centre.
 *
 * The bell used to do one of two things, depending on which build you were
 * on: nothing at all, or a hard navigation away to the full Signals page.
 * Neither is what "notification centre" means anywhere else — the point of
 * a bell is to show you what's waiting *without* leaving the page you're on,
 * then let you act on one item or jump to the full list if you want it.
 *
 * This reuses the same live signal feed the Signals page and the top-bar
 * capsule already read from (`useLiveSignals`), so the count on the bell,
 * the rows in this panel, and the Signals page itself cannot disagree — a
 * dismissal here is the same `store.dismissSignal` call the full page uses,
 * session-only, not a second notion of "read".
 *
 * On top of that, this panel keeps one thing of its own: which signals this
 * browser has already seen, in `localStorage` (the same namespaced helper
 * the rest of the app uses for local persistence — see `lib/storage.ts`).
 * That's what makes the bell's badge a real unread *count* rather than a
 * static dot — it survives a refresh, and it clears the moment you open the
 * panel, the way every notification bell people already use behaves.
 *
 * "Seen" is keyed on `id + severity`, not just `id`. Signals are derived
 * live, not stored, so the same underlying issue (say, an overdue invoice)
 * keeps the same id for as long as it's true — deliberately, so dismissing
 * it only suppresses it for the session (see SignalsPage's own notes on
 * this). But if that invoice goes from 30 days late to 60 and crosses into
 * "critical", that is new information worth re-surfacing, so a severity
 * change un-reads it even though the id didn't change.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Percent,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { briefText, KIND_LABELS, type Severity, type Signal, type SignalKind, type SignalTarget } from "@/lib/signals";
import { loadValue, saveValue } from "@/lib/storage";
import { cn } from "@/lib/utils";

const SEVERITY_TOKEN: Record<Severity, string> = {
  critical: "--danger",
  high: "--accent",
  medium: "--caution",
  low: "--text-tertiary",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const KIND_ICON: Record<SignalKind, LucideIcon> = {
  margin: Percent,
  price: TrendingUp,
  compliance: ShieldCheck,
  fulfilment: Boxes,
  pipeline: Clock,
  relationship: Users,
  data: BadgeCheck,
};

const SEEN_KEY = "notifications.seen";
const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

/** id + severity, so an escalation (high → critical) reads as new again even
 * though the underlying signal id — tied to the record, not the message —
 * hasn't changed. */
const seenKeyFor = (s: Signal): string => `${s.id}::${s.severity}`;

export function NotificationCenter({
  signals,
  critical,
  dismissedCount,
  onOpenRecord,
  onDismiss,
  onRestore,
  onViewAll,
  variant = "desktop",
}: {
  signals: Signal[];
  critical: number;
  dismissedCount: number;
  onOpenRecord: (target: SignalTarget, id?: string) => void;
  onDismiss: (id: string) => void;
  onRestore: () => void;
  onViewAll: () => void;
  variant?: "desktop" | "mobile" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<"all" | Severity>("all");
  const [seen, setSeen] = useState<Set<string>>(
    () => new Set(loadValue<string[]>(SEEN_KEY) ?? []),
  );
  // What was unread *at the moment this viewing session opened* — used only
  // to draw the "New" tag while the panel is open. Cleared on close so a
  // second open of an unchanged list doesn't relabel everything.
  const [sessionNew, setSessionNew] = useState<Set<string>>(new Set());

  const unseen = useMemo(
    () => signals.filter((s) => !seen.has(seenKeyFor(s))),
    [signals, seen],
  );
  const unseenCritical = unseen.filter((s) => s.severity === "critical").length;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSessionNew(new Set());
      return;
    }
    if (unseen.length === 0) return;
    setSessionNew(new Set(unseen.map(seenKeyFor)));
    setSeen((prev) => {
      const merged = new Set(prev);
      signals.forEach((s) => merged.add(seenKeyFor(s)));
      saveValue(SEEN_KEY, Array.from(merged));
      return merged;
    });
  };

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(briefText(signals));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard unavailable — the button simply does nothing, same
         fallback the full Signals page uses. */
    }
  };

  const shown = filter === "all" ? signals : signals.filter((s) => s.severity === filter);
  const severityCounts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  signals.forEach((s) => severityCounts[s.severity]++);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unseen.length
              ? `${unseen.length} new notification${unseen.length === 1 ? "" : "s"}`
              : signals.length
                ? `${signals.length} open notification${signals.length === 1 ? "" : "s"}, none new`
                : "Notifications"
          }
          title={
            signals.length
              ? `${signals.length} open notification${signals.length === 1 ? "" : "s"}${unseen.length ? `, ${unseen.length} new` : ""}`
              : "No notifications — all clear"
          }
          className={cn(
            variant === "desktop" ? "tbar-ico relative" : variant === "bottom" ? "mbn-item" : "relative rounded-lg p-2 text-ink-secondary hover:bg-elevated",
          )}
        >
          <span className={cn("relative inline-flex", variant === "bottom" && "mbn-ico")}>
            {variant === "bottom" ? (
              <Bell size={22} strokeWidth={1.75} />
            ) : (
              <Bell className={variant === "desktop" ? "" : "h-4 w-4 text-ink-secondary"} size={variant === "desktop" ? 19 : undefined} strokeWidth={variant === "desktop" ? 1.75 : undefined} />
            )}
            {unseen.length ? (
              <span
                className={cn(
                  "absolute flex h-[18px] min-w-[18px]",
                  variant === "bottom" ? "right-[4px] top-[4px]" : "-right-1.5 -top-1.5",
                )}
              >
                {unseenCritical > 0 ? (
                  <span
                    className="absolute inset-0 rounded-full tfl-pulse"
                    style={{ backgroundColor: "rgb(var(--danger) / 0.5)" }}
                  />
                ) : null}
                <span
                  className="tnum relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[3px] text-[9.5px] font-bold text-white ring-2 ring-canvas"
                  style={{ backgroundColor: `rgb(var(${unseenCritical > 0 ? "--danger" : "--accent-fill"}))` }}
                >
                  {unseen.length > 9 ? "9+" : unseen.length}
                </span>
              </span>
            ) : signals.length ? (
              <span
                className={cn(
                  "absolute h-2 w-2 rounded-full ring-2 ring-canvas",
                  variant === "bottom" ? "right-[9px] top-[9px]" : "-right-0.5 -top-0.5",
                )}
                style={{ backgroundColor: `rgb(var(${critical > 0 ? "--danger" : "--accent"}))` }}
              />
            ) : null}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side={variant === "bottom" ? "top" : "bottom"}
        sideOffset={variant === "bottom" ? 14 : 8}
        className="w-[min(25rem,92vw)] rounded-2xl border-divider bg-elevated p-0 shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-divider px-4 py-3">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-ink">Notifications</div>
            <div className="truncate text-[11.5px] text-ink-tertiary">
              {signals.length === 0
                ? "Nothing needs attention"
                : unseen.length
                  ? `${unseen.length} new · ${signals.length} open, ranked by consequence`
                  : `${signals.length} open, ranked by consequence`}
            </div>
          </div>
          {dismissedCount > 0 ? (
            <button
              type="button"
              onClick={onRestore}
              className="brand-focus flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-ink-secondary hover:bg-canvas"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore {dismissedCount}
            </button>
          ) : null}
        </div>

        {signals.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-divider px-4 py-2">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              {`All ${signals.length}`}
            </FilterChip>
            {SEVERITY_ORDER.filter((sev) => severityCounts[sev] > 0).map((sev) => (
              <FilterChip
                key={sev}
                active={filter === sev}
                tone={SEVERITY_TOKEN[sev]}
                onClick={() => setFilter(filter === sev ? "all" : sev)}
              >
                {`${SEVERITY_LABEL[sev]} ${severityCounts[sev]}`}
              </FilterChip>
            ))}
          </div>
        ) : null}

        {signals.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-9 text-center">
            <span className="ios-fill flex h-11 w-11 items-center justify-center rounded-2xl">
              <Sparkles className="h-5 w-5 text-ink-tertiary" strokeWidth={1.5} />
            </span>
            <p className="text-[12.5px] leading-relaxed text-ink-secondary">
              No overdue invoices, no expiring paperwork, no quotations past
              their follow-up date.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-6 py-9 text-center">
            <p className="text-[12.5px] text-ink-secondary">Nothing at that severity.</p>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="brand-focus text-[12px] font-medium text-accent"
            >
              Back to all
            </button>
          </div>
        ) : (
          <div className="thin-scroll max-h-[360px] overflow-y-auto py-1">
            {shown.map((signal) => {
              const token = SEVERITY_TOKEN[signal.severity];
              const Icon = KIND_ICON[signal.kind];
              const isNew = sessionNew.has(seenKeyFor(signal));
              return (
                <div
                  key={signal.id}
                  className="group flex items-start gap-2.5 px-4 py-2.5 hover:bg-canvas"
                  style={isNew ? { backgroundColor: "rgb(var(--accent) / 0.05)" } : undefined}
                >
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `rgb(var(${token}) / 0.16)` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: `rgb(var(${token}))` }} strokeWidth={2.2} />
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenRecord(signal.target, signal.recordId);
                    }}
                    className="brand-focus min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-[12.5px] font-semibold leading-snug text-ink">
                        {signal.title}
                      </div>
                      {isNew ? (
                        <span className="shrink-0 rounded-full bg-accent-fill px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-white">
                          New
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-secondary">
                      {signal.detail}
                    </div>
                    {signal.action ? (
                      <div
                        className="mt-1 flex items-center gap-1 text-[11px] font-medium"
                        style={{ color: `rgb(var(${token}))` }}
                      >
                        <AlertTriangle className="h-3 w-3" strokeWidth={2.3} />
                        <span className="truncate">{signal.action}</span>
                      </div>
                    ) : null}
                    <div className="mt-1 text-[10.5px] uppercase tracking-[0.06em] text-ink-tertiary">
                      {KIND_LABELS[signal.kind]}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismiss(signal.id)}
                    aria-label="Dismiss for this session"
                    title="Dismiss for this session"
                    className="brand-focus mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-tertiary opacity-0 hover:bg-elevated group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-divider px-3 py-2.5">
          <button
            type="button"
            onClick={copyBrief}
            disabled={signals.length === 0}
            className="brand-focus flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary hover:bg-canvas disabled:opacity-40"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy brief"}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onViewAll();
            }}
            className="brand-focus rounded-lg bg-accent-fill px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
          >
            View all in Signals
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterChip({
  children,
  active,
  tone,
  onClick,
}: {
  children: string;
  active: boolean;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "tnum shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        active ? "text-white" : "bg-canvas text-ink-secondary hover:bg-canvas/70",
      )}
      style={active ? { backgroundColor: `rgb(var(${tone ?? "--accent"}))` } : undefined}
    >
      {children}
    </button>
  );
}
