import { ChevronRight, Plus, Settings, type LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

export type ResolvedItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
  warn?: boolean;
  active?: boolean;
  onClick: () => void;
};
export type ResolvedSection = {
  id: string;
  label?: string;
  collapsible?: boolean;
  items: ResolvedItem[];
};

const OPEN_KEY = "tfl.side.open";
const readOpen = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) || "{}");
  } catch {
    return {};
  }
};

/**
 * The second sidebar — one per module. Same anatomy as the Leads and Email
 * sidebars in unique-ops: primary button, items, collapsible groups, a rule,
 * and Settings pinned to the bottom. Collapses to an icon rail.
 */
export function ModuleSidebar({
  title,
  primary,
  sections,
  rail,
  settingsActive,
  onSettings,
  onNavigate,
  onPick,
}: {
  title?: string;
  primary?: { label: string; icon?: LucideIcon; onClick: () => void };
  sections: ResolvedSection[];
  rail?: boolean;
  settingsActive?: boolean;
  onSettings?: () => void;
  /** Called after any choice (closes the mobile drawer). */
  onNavigate?: () => void;
  /** Called when a section or the primary button is chosen (closes the module's settings). */
  onPick?: () => void;
}) {
  const [stored, setStored] = useState<Record<string, boolean>>(readOpen);
  const toggle = useCallback((id: string, now: boolean) => {
    setStored((prev) => {
      const next = { ...prev, [id]: !now };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const visible = sections.filter((s) => s.items.length > 0);
  const PrimaryIcon = primary?.icon ?? Plus;

  const renderItem = (i: ResolvedItem) => {
    const Icon = i.icon;
    return (
      <button
        key={i.key}
        type="button"
        title={i.label}
        aria-current={i.active ? "page" : undefined}
        className={cn("mside-nav", i.active && "is-active")}
        onClick={() => {
          i.onClick();
          onPick?.();
          onNavigate?.();
        }}
      >
        <span className="mside-ico">
          {Icon ? <Icon size={17} strokeWidth={1.8} /> : <i className="mside-dot" />}
          {rail && !!i.count && i.warn ? <i className="mside-rail-dot" aria-hidden /> : null}
        </span>
        <span className="mside-text">{i.label}</span>
        {i.count ? (
          <span className={cn("mside-count", i.warn && "is-warn")}>{i.count > 999 ? "999+" : i.count}</span>
        ) : null}
      </button>
    );
  };

  return (
    <nav className={cn("mside", rail && "is-rail")} aria-label={title ?? "Module"}>
      <div className="mside-scroll thin-scroll">
        {primary ? (
          <div className="mside-top">
            <button
              type="button"
              className="mside-new"
              title={primary.label}
              onClick={() => {
                primary.onClick();
                onPick?.();
                onNavigate?.();
              }}
            >
              <PrimaryIcon size={16} strokeWidth={2.2} />
              <span>{primary.label}</span>
            </button>
          </div>
        ) : title && !rail ? (
          <div className="mside-title">{title}</div>
        ) : null}

        {visible.map((s, idx) => {
          const hasActive = s.items.some((i) => i.active);
          const open = rail || !s.collapsible || (stored[s.id] ?? hasActive);
          return (
            <div className="mside-sec" key={s.id}>
              {idx > 0 && (!s.label || rail) ? <hr className="mside-rule" /> : null}
              {s.label && !rail ? (
                s.collapsible ? (
                  <button
                    type="button"
                    className={cn("mside-label", open && "is-open")}
                    onClick={() => toggle(s.id, open)}
                    aria-expanded={open}
                  >
                    <span>{s.label}</span>
                    <ChevronRight size={14} strokeWidth={2} />
                  </button>
                ) : (
                  <div className="mside-label is-static">
                    <span>{s.label}</span>
                  </div>
                )
              ) : null}
              {open ? <div className="mside-group">{s.items.map(renderItem)}</div> : null}
            </div>
          );
        })}
      </div>

      {onSettings ? (
      <div className="mside-foot">
        <button
          type="button"
          className={cn("mside-settings", settingsActive && "is-active")}
          onClick={() => {
            onSettings?.();
            onNavigate?.();
          }}
          title="Settings"
          aria-label="Settings"
          aria-pressed={!!settingsActive}
        >
          <span className="tile">
            <Settings size={17} strokeWidth={1.8} />
          </span>
          <span className="t">Settings</span>
        </button>
      </div>
      ) : null}
    </nav>
  );
}
