import { Mail, Menu, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { QuickAction } from "@/components/TopBar";

/**
 * Phone bottom bar — same five buttons as unique-ops' MobileBottomNav:
 * [menu] [quick action] [mail] [bell] [profile]. The drawer opens above it.
 */
export function MobileBottomNav({
  menuOpen,
  onToggleMenu,
  quickActions,
  onOpenMail,
  mailActive,
  bell,
  userName,
  profileOpen,
  onProfile,
}: {
  menuOpen: boolean;
  onToggleMenu: () => void;
  quickActions: QuickAction[];
  onOpenMail: () => void;
  mailActive?: boolean;
  bell: ReactNode;
  userName?: string;
  profileOpen: boolean;
  onProfile: () => void;
}) {
  const [qaOpen, setQaOpen] = useState(false);

  useEffect(() => {
    if (!qaOpen) return;
    const close = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".mbn-qa-menu") && !t.closest(".mbn-item--qa")) setQaOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [qaOpen]);

  const initials =
    (userName || "R")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "R";

  return (
    <nav className="mbn lg:hidden" aria-label="Mobile navigation">
      <div className="mbn-inner">
        <button
          type="button"
          className={cn("mbn-item", menuOpen && "active")}
          onClick={() => {
            setQaOpen(false);
            onToggleMenu();
          }}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <span className="mbn-ico"><Menu size={22} strokeWidth={1.75} /></span>
        </button>

        <div className="mbn-cell">
          <button
            type="button"
            className={cn("mbn-item mbn-item--qa", qaOpen && "active")}
            onClick={() => setQaOpen((v) => !v)}
            aria-label="Quick action"
            aria-expanded={qaOpen}
          >
            <span className="mbn-ico"><Plus size={22} strokeWidth={1.75} /></span>
          </button>
          {qaOpen ? (
            <div className="mbn-qa-menu">
              {quickActions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    a.onClick();
                    setQaOpen(false);
                  }}
                >
                  + {a.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={cn("mbn-item", mailActive && "active")}
          onClick={() => {
            setQaOpen(false);
            onOpenMail();
          }}
          aria-label="Email"
        >
          <span className="mbn-ico"><Mail size={22} strokeWidth={1.75} /></span>
        </button>

        <div className="mbn-cell">{bell}</div>

        <button
          type="button"
          className={cn("mbn-item", profileOpen && "active")}
          onClick={onProfile}
          aria-label="Profile"
          aria-expanded={profileOpen}
        >
          <span className="mbn-ico"><span className="mbn-avatar">{initials}</span></span>
        </button>
      </div>
    </nav>
  );
}
