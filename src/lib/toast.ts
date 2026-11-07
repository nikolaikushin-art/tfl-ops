import { useSyncExternalStore } from "react";

/** Tiny toast store (no dependency). `toast("Saved")`, `toast("Deleted", { action: { label: "Undo", onClick } })`. */
export type ToastTone = "neutral" | "success" | "danger";
export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
  /** ms until it closes itself (0 = stays). */
  duration: number;
}

let items: ToastItem[] = [];
let seq = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissToast(id: number) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  items = items.filter((i) => i.id !== id);
  emit();
}

export function toast(
  message: string,
  opts: { tone?: ToastTone; action?: ToastItem["action"]; duration?: number } = {},
): number {
  const id = seq++;
  const duration = opts.duration ?? (opts.action ? 8000 : 3500);
  items = [...items.slice(-3), { id, message, tone: opts.tone ?? "neutral", action: opts.action, duration }];
  emit();
  if (duration > 0) timers.set(id, setTimeout(() => dismissToast(id), duration));
  return id;
}

/** A destructive change that can be taken back: runs `undo` when the person presses Undo. */
export function undoable(message: string, undo: () => void) {
  const id = toast(message, {
    action: {
      label: "Undo",
      onClick: () => {
        undo();
        dismissToast(id);
        toast("Restored", { tone: "success", duration: 2000 });
      },
    },
  });
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => items,
    () => [],
  );
}
