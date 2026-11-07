import { nextThemeLabel, type ThemeName } from "@/lib/theme";
import { ChevronDown, LogOut, Mail, Moon, PanelLeft, RefreshCw, Search, Settings, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { backupAgeDays, hasLocalData } from "@/lib/backup";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Real status instead of a fixed "Local data" label: when the data was last backed up (ported from unique-ops' backup pill). */
function BackupPill({ onOpen }: { onOpen: () => void }) {
  const [, bump] = useState(0);
  useEffect(() => {
    const h = () => bump((n) => n + 1);
    window.addEventListener("tfl:backup", h);
    return () => window.removeEventListener("tfl:backup", h);
  }, []);
  if (!hasLocalData()) return null;
  const age = backupAgeDays();
  const colour = age === null ? "rgb(var(--danger, 200 60 60))" : age >= 7 ? "#d98a1f" : "rgb(var(--success))";
  const label = age === null ? "No backup" : age === 0 ? "Backup: today" : `Backup: ${age} d ago`;
  return (
    <button type="button" className="tbar-status" onClick={onOpen} title="Data is kept in this browser — open backup settings" style={{ cursor: "pointer" }}>
      <i style={{ background: colour }} /> {label}
    </button>
  );
}

export type QuickAction = { id: string; label: string; onClick: () => void };

/**
 * Desktop top bar — same anatomy as unique-ops' `.topbar`:
 * [expand-nav (only while the main sidebar is collapsed)] [wide search pill] ... [refresh] [mail] [bell] [status] [settings] | [Quick action] [user].
 * The second sidebar's toggle does NOT live here — like unique-ops it sits in the module card header.
 * The bell is passed in (the existing NotificationCenter) so counts stay identical.
 */
export function TopBar({
  navRail,
  onToggleNav,
  onOpenSearch,
  onOpenMail,
  onOpenSettings,
  bell,
  quickActions,
  userName,
  userRole,
  theme,
  onToggleTheme,
  onSignOut,
}: {
  navRail: boolean;
  onToggleNav: () => void;
  onOpenSearch: () => void;
  onOpenMail: () => void;
  onOpenSettings: () => void;
  bell: React.ReactNode;
  quickActions: QuickAction[];
  userName?: string;
  userRole?: string;
  theme: ThemeName;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const [qa, setQa] = useState(false);
  const [spin, setSpin] = useState(false);
  const initial = (userName || "R").charAt(0).toUpperCase();
  return (
    <header className="tbar hidden lg:flex">
      {navRail ? (
        <button type="button" className="tbar-nav-toggle" onClick={onToggleNav} aria-label="Expand navigation" title="Expand navigation">
          <PanelLeft size={18} strokeWidth={1.75} />
        </button>
      ) : null}

      <button type="button" className="tbar-search" onClick={onOpenSearch}>
        <Search size={16} strokeWidth={2.2} />
        <span>Search: contact, product, deal…</span>
      </button>

      <div className="tbar-right">
      <button
        type="button"
        className={cn("tbar-ico", spin && "is-spin")}
        title="Refresh"
        aria-label="Refresh"
        onClick={() => {
          setSpin(true);
          window.setTimeout(() => window.location.reload(), 350);
        }}
      >
        <RefreshCw size={19} strokeWidth={1.75} />
      </button>
      <button type="button" className="tbar-ico" title="Email" aria-label="Email" onClick={onOpenMail}>
        <Mail size={19} strokeWidth={1.75} />
      </button>
      {bell}
      <BackupPill onOpen={() => { try { sessionStorage.setItem("tfl.settings.open", "storage"); } catch { /* ignore */ } onOpenSettings?.(); }} />
      <button type="button" className="tbar-ico" title="Settings" aria-label="Settings" onClick={onOpenSettings}>
        <Settings size={19} strokeWidth={1.75} />
      </button>
      <Popover open={qa} onOpenChange={setQa}>
        <div className="tbar-qa-wrap">
        <PopoverTrigger asChild>
          <button type="button" className="tbar-qa">
            <span className="tbar-qa-icon" aria-hidden>+</span>
            <span className="tbar-qa-label">Quick action</span>
          </button>
        </PopoverTrigger>
        </div>
        <PopoverContent align="end" sideOffset={10} className="tbar-menu">
          {quickActions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                a.onClick();
                setQa(false);
              }}
            >
              + {a.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="tbar-user">
            <span className="tbar-avatar">{initial}</span>
            <span className="tbar-uname">{userName || "Account"}</span>
            <ChevronDown size={13} className="tbar-chev" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={10} className="tbar-menu">
          <div className="tbar-menu-id">
            <b>{userName}</b>
            <span>{userRole}</span>
          </div>
          <button type="button" onClick={onToggleTheme}>
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />} {nextThemeLabel(theme)}
          </button>
          <button type="button" onClick={onSignOut}>
            <LogOut size={14} /> Sign out
          </button>
        </PopoverContent>
      </Popover>
      </div>
    </header>
  );
}
