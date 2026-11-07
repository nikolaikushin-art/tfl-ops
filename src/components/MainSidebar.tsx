import { nextThemeLabel, type ThemeName } from "@/lib/theme";
import { ChevronDown, LogOut, Moon, PanelLeft, Sun, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BrandGlobe, BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

export type MainNavItem = { id: string; label: string; icon: LucideIcon; dot?: boolean };
export type MainNavGroup = { label: string; items: MainNavItem[] };

const GROUPS_KEY = "tfl.nav.groups";

/**
 * The main navigation sidebar. Same anatomy as the `.sidebar` in unique-ops'
 * Layout: logo + collapse button, accordion groups (one open at a time, the
 * active page's group is always open), and a footer with theme / user / sign out.
 * Collapses to an icon-only rail instead of disappearing.
 */
export function MainSidebar({
  groups,
  activeId,
  onSelect,
  rail,
  onToggleRail,
  theme,
  onToggleTheme,
  userName,
  userRole,
  onSignOut,
  mobile,
  onNavigate,
}: {
  groups: MainNavGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  rail: boolean;
  onToggleRail: () => void;
  theme: ThemeName;
  onToggleTheme: () => void;
  userName?: string;
  userRole?: string;
  onSignOut: () => void;
  /** Drawer on phones: always full width with labels, no collapse button. */
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const showLabels = mobile || !rail;
  const activeGroup = groups.find((g) => g.items.some((i) => i.id === activeId))?.label;

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(GROUPS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return activeGroup ? { [activeGroup]: true } : {};
  });

  // Accordion: opening a group closes the others.
  const toggleGroup = useCallback((label: string) => {
    setOpen((prev) => {
      const next = prev[label] ? {} : { [label]: true };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Never hide the page you are on.
  useEffect(() => {
    if (!activeGroup) return;
    setOpen((prev) => (prev[activeGroup] ? prev : { [activeGroup]: true }));
  }, [activeGroup]);

  const initial = (userName || "R").charAt(0).toUpperCase();
  const go = (id: string) => {
    onSelect(id);
    onNavigate?.();
  };

  return (
    <aside className={cn("mnav", !showLabels && "mnav--rail")}>
      <div className="mnav-scroll thin-scroll">
        <div className="mnav-head">
          <button
            type="button"
            className="mnav-brand"
            onClick={() => go("dashboard")}
            title="The Film Location"
            aria-label="The Film Location — home"
          >
            {showLabels ? (
              <BrandMark size="lg" />
            ) : (
              <span className="mnav-mark">
                <BrandGlobe />
              </span>
            )}
          </button>
          {!mobile ? (
            <button
              type="button"
              className="mnav-collapse"
              onClick={onToggleRail}
              title={rail ? "Expand navigation" : "Collapse navigation"}
              aria-label={rail ? "Expand navigation" : "Collapse navigation"}
              aria-pressed={rail}
            >
              <PanelLeft size={16} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>

        <nav aria-label="Main navigation" className="mnav-groups">
          {groups.map((g) => {
            const isOpen = open[g.label] === true;
            return (
              <div className="mnav-group" key={g.label}>
                {showLabels ? (
                  <button
                    type="button"
                    className="mnav-label"
                    onClick={() => toggleGroup(g.label)}
                    aria-expanded={isOpen}
                  >
                    <span>{g.label}</span>
                    <ChevronDown size={13} strokeWidth={2} className={cn("mnav-chev", !isOpen && "is-collapsed")} />
                  </button>
                ) : null}
                <div className={cn("mnav-items", (isOpen || !showLabels) && "is-open")}>
                  <div className="mnav-items-inner">
                    {g.items.map((item) => {
                      const Icon = item.icon;
                      const active = activeId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={cn("mnav-item", active && "active")}
                          aria-current={active ? "page" : undefined}
                          title={!showLabels ? item.label : undefined}
                          onClick={() => go(item.id)}
                        >
                          <span className="mnav-ico">
                            <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
                            {item.dot ? <i className="mnav-dot" aria-hidden /> : null}
                          </span>
                          {showLabels ? <span className="mnav-text">{item.label}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="mnav-foot">
        <button
          type="button"
          className="mnav-theme"
          onClick={onToggleTheme}
          title={nextThemeLabel(theme)}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          {showLabels ? <span>{nextThemeLabel(theme)}</span> : null}
        </button>
        <div className="mnav-user">
          <span className="mnav-avatar">{initial}</span>
          {showLabels ? (
            <>
              <div className="mnav-id">
                <div className="mnav-name">{userName}</div>
                <div className="mnav-role">{userRole}</div>
              </div>
              <button type="button" className="mnav-logout" onClick={onSignOut} title="Sign out" aria-label="Sign out">
                <LogOut size={15} />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
