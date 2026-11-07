import { useEffect, useRef, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Pages can hand the module sidebar extra items (Contacts tabs and saved views,
 * Request stages, Email folders, Settings panels, …). The sidebar shows them
 * under the module's own pages, exactly like the Leads and Email sidebars in
 * unique-ops. A page that registers nothing simply gets its module's page list.
 */
export type SideItem = { key: string; label: string; icon?: LucideIcon; count?: number; warn?: boolean };
export type SideSection = { id: string; label?: string; collapsible?: boolean; items: SideItem[] };
export type SideExtra = {
  /** Text for the sidebar when the module has no pages of its own (Settings). */
  title?: string;
  primary?: { label: string; icon?: LucideIcon; onClick: () => void };
  sections: SideSection[];
  /** One key, or several (e.g. a tab and a view mode). */
  active?: string | string[];
  onPick?: (key: string) => void;
};

let current: SideExtra | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function useSideExtraValue(): SideExtra | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

const signature = (e: SideExtra | null) =>
  e
    ? JSON.stringify([
        e.title,
        e.primary?.label,
        JSON.stringify(e.active),
        e.sections.map((s) => [s.id, s.label, s.items.map((i) => [i.key, i.label, i.count, i.warn])]),
      ])
    : "";

/** Register (or clear) this page's sidebar items. Handlers may change every render. */
export function useSideExtra(extra: SideExtra | null) {
  const latest = useRef(extra);
  latest.current = extra;
  const sig = signature(extra);
  useEffect(() => {
    const e = latest.current;
    current = e
      ? {
          ...e,
          primary: e.primary
            ? { ...e.primary, onClick: () => latest.current?.primary?.onClick() }
            : undefined,
          onPick: (k) => latest.current?.onPick?.(k),
        }
      : null;
    emit();
  }, [sig]);
  useEffect(
    () => () => {
      current = null;
      emit();
    },
    [],
  );
}
