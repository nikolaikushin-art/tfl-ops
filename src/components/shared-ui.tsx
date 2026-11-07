import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { StatusPill as IOSStatusPill } from "@/components/ios";

/** Consistent iOS-style back navigation link, used at the top of every detail/form screen. */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="brand-focus -ml-1.5 inline-flex items-center gap-0.5 rounded-lg py-1 pl-1.5 pr-2.5 text-[15px] font-medium text-accent transition-transform active:scale-[0.97]"
    >
      <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={2.5} />
      {label}
    </button>
  );
}

/**
 * Shared wrapper for every settings sub-panel: back link, title, the panel's
 * own content, and a floating toast banner if one is active. Previously each
 * settings panel received this as a `PanelShell` prop — a component defined
 * as a closure inside `SettingsPage` so it could reach `setPanel`/`toast`
 * directly. That closure made every panel it fed impossible to code-split,
 * since a lazy-loaded panel can't receive a component instance defined in
 * the parent that hasn't loaded yet. Standalone, it takes `onBack` and
 * `toast` as plain props instead of closing over them.
 */
export function PanelShell({
  title,
  children,
  onBack,
  toast,
}: {
  title: string;
  children: ReactNode;
  onBack: () => void;
  toast?: string | null;
}) {
  return (
    <div className="settings-panel-full w-full space-y-5 pb-10">
      <BackLink label="Settings" onClick={onBack} />
      <h1 className="ios-large-title text-ink">{title}</h1>
      {children}
      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[rgb(var(--text-primary))] px-4 py-2 text-[13px] font-medium text-white shadow-lg lg:bottom-8">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/** Whole-unit currency formatting for summary figures (dashboards, list rows,
 *  totals) where cents would just be visual noise. */
export function formatMoney(n: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Two-decimal variant for line-level and document-level arithmetic, where
 *  rounding to whole units would make the totals look wrong. */
export function formatMoneyExact(n: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Every status chip in the app resolves through one shared vocabulary
 * (`ios.tsx`), so "paid" is the same green on the invoice list, the order row
 * and the payment queue.
 */
export function StatusBadge({ status }: { status: string }) {
  return <IOSStatusPill status={status} />;
}

export const CURRENCY_OPTIONS = [
  { value: "GBP", label: "GBP — Pound sterling" },
  { value: "USD", label: "USD — US dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "AED", label: "AED — UAE dirham" },
  { value: "CNY", label: "CNY — Chinese yuan" },
];
