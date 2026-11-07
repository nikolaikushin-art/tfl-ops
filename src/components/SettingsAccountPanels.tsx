/**
 * Settings panels ported from unique-ops for parity: My account (+ security),
 * System (platform preferences + status), Notifications, Local storage (backup / restore).
 * Each saves to localStorage and has the same defaults / save behaviour as the unique-ops panel.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/domain";
import { useTheme } from "@/lib/theme";
import { credentials } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { Field, TextInput, SelectInput } from "@/components/forms";
import {
  NOTIFICATION_DEFAULTS, PLATFORM_DEFAULTS, useNotificationPrefs, usePlatformPrefs,
  type NotificationPrefs, type PlatformPrefs,
} from "@/lib/platformPrefs";
import { SyncStatusLine } from "@/components/ServerSync";
import {
  backupAgeDays, downloadBackup, lastBackupAt, localUsageKb, readBackupFile, resetLocalData, restoreBackup,
  type BackupPayload, type BackupSummary,
} from "@/lib/backup";

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">{children}</div>
);

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-full bg-elevated p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${value === o.id ? "bg-surface shadow-sm text-ink" : "text-ink-secondary"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ My account ------------------------------ */

export function AccountPanel({ onSignOut }: { onSignOut: () => void }) {
  const store = useStore();
  const { theme, setTheme } = useTheme();
  const user = store.user;
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const [busy, setBusy] = useState(false);
  const isGuest = !user || user.id === "guest";
  const hasPassword = !!user && credentials.has(user.email);

  const changePassword = async () => {
    if (!user) return;
    if (next.length < 8) return toast("New password must be at least 8 characters", { tone: "danger" });
    if (next !== conf) return toast("The new passwords do not match", { tone: "danger" });
    setBusy(true);
    try {
      if (hasPassword && !(await credentials.verify(user.email, cur))) {
        toast("Current password is incorrect", { tone: "danger" });
        return;
      }
      await credentials.set(user.email, next, false);
      setCur(""); setNext(""); setConf("");
      toast("Password changed", { tone: "success" });
    } finally {
      setBusy(false);
    }
  };

  const initials = (user?.name || user?.email || "U").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>Account</Eyebrow>
        <div className="brand-card flex items-center gap-4 p-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-fill text-[18px] font-semibold text-white">{initials}</div>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold">{user?.name || "—"}</div>
            <div className="truncate text-[13px] text-ink-secondary">{user?.email}</div>
            <div className="text-[12px] text-ink-tertiary">{user ? ROLE_LABELS[user.role] : ""}</div>
          </div>
        </div>
        <div className="brand-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-[15px] font-medium">Interface theme</div>
            <div className="text-[13px] text-ink-secondary">Light, Twilight (dark navigation and headers, light pages) or Dark</div>
          </div>
          <Seg value={theme} onChange={setTheme} options={[{ id: "light", label: "Light" }, { id: "split", label: "Twilight" }, { id: "dark", label: "Dark" }]} />
        </div>
        <div className="space-y-1.5">
          <Button className="h-11 w-full rounded-xl" onClick={onSignOut}>Sign out</Button>
          <p className="text-[12px] text-ink-tertiary">Ends the current session on this device.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Eyebrow>Security</Eyebrow>
        {isGuest ? (
          <div className="brand-card p-4 text-[14px] text-ink-secondary">You are using the guest session. Sign in with an account to set a password.</div>
        ) : (
          <div className="brand-card space-y-4 p-4">
            <div>
              <div className="text-[15px] font-medium">Change password</div>
              <div className="text-[13px] text-ink-secondary">{hasPassword ? "Enter your current password, then a new one (min. 8 characters)." : "No password is set for this account yet — choose one."}</div>
            </div>
            {hasPassword ? (
              <Field label="Current password"><TextInput type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
            ) : null}
            <Field label="New password"><TextInput type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
            <Field label="Repeat new password"><TextInput type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} /></Field>
            <Button className="h-11 rounded-xl" disabled={busy || !next || !conf} onClick={changePassword}>{busy ? "Saving…" : "Change password"}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- System --------------------------------- */

const TIMEZONES = [
  ["Europe/London", "London (UTC+0/+1)"], ["Europe/Berlin", "Berlin (UTC+1/+2)"], ["Europe/Moscow", "Moscow (UTC+3)"],
  ["Asia/Dubai", "Dubai (UTC+4)"], ["Asia/Singapore", "Singapore (UTC+8)"], ["America/New_York", "New York (UTC−5/−4)"],
];

export function SystemPanel() {
  const store = useStore();
  const [saved, save] = usePlatformPrefs();
  const [draft, setDraft] = useState<PlatformPrefs>(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof PlatformPrefs>(k: K, v: PlatformPrefs[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const stats: [string, string, string][] = [
    ["Database", "Local", "Data in this browser"],
    ["Sign-in", store.isAuthenticated ? "Active" : "Off", store.user?.id === "guest" ? "Guest session" : "Local account"],
    ["Storage", `${localUsageKb()} KB`, "localStorage"],
    ["Mode", "Offline", "No server needed"],
  ];
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>Platform</Eyebrow>
        <div className="brand-card space-y-4 p-4">
          <Field label="Company name"><TextInput value={draft.companyName} onChange={(e) => set("companyName", e.target.value)} /></Field>
          <Field label="Time zone">
            <SelectInput value={draft.timezone} onChange={(v: string) => set("timezone", v)} options={TIMEZONES.map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="Default currency">
            <SelectInput value={draft.currency} onChange={(v: string) => set("currency", v)} options={["GBP", "EUR", "USD", "AED", "RUB"].map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Date format">
            <SelectInput value={draft.dateFormat} onChange={(v: string) => set("dateFormat", v as PlatformPrefs["dateFormat"])} options={[{ value: "dd/mm/yyyy", label: "31/12/2026" }, { value: "mm/dd/yyyy", label: "12/31/2026" }, { value: "yyyy-mm-dd", label: "2026-12-31" }]} />
          </Field>
          <Field label="Interface language"><SelectInput value={draft.language} onChange={(v: string) => set("language", v)} options={[{ value: "en", label: "English" }]} /></Field>
          <div className="flex gap-2">
            <Button className="h-11 rounded-xl" disabled={!dirty} onClick={() => { save(draft); toast("Settings saved", { tone: "success" }); }}>Save</Button>
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => { setDraft(PLATFORM_DEFAULTS); }}>Restore defaults</Button>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Eyebrow>Platform status</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          {stats.map(([l, v, n]) => (
            <div key={l} className="brand-card p-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">{l}</div>
              <div className="mt-1 text-[20px] font-semibold">{v}</div>
              <div className="text-[12px] text-ink-secondary">{n}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Notifications ------------------------------ */

const NOTIFICATION_ITEMS: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
  { key: "emailInvoices", label: "Email invoices", desc: "Offer to email invoices to customers when issued" },
  { key: "emailQuotations", label: "Email quotations", desc: "Offer to email quotations to customers when sent" },
  { key: "priceExpiry", label: "Price & quote expiry", desc: "Alert before supplier prices and quotations expire" },
  { key: "lowStock", label: "Order fulfilment", desc: "Alert when accepted orders are not being fulfilled" },
  { key: "followUps", label: "Follow-up reminders", desc: "Reminders for customers and contacts with a follow-up due" },
  { key: "newRequests", label: "New requests & matches", desc: "Alert when a request arrives or an offer matches a buyer" },
  { key: "kycAlerts", label: "KYC", desc: "Alert when KYC is submitted or missing on an order" },
  { key: "escrowAlerts", label: "Escrow & deals", desc: "Alert for deposits, funds in escrow and stuck deals" },
];

export function NotificationsPanel() {
  const [saved, save] = useNotificationPrefs();
  const [draft, setDraft] = useState<NotificationPrefs>(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Eyebrow>Communications</Eyebrow>
        <div className="brand-card divide-y divide-divider overflow-hidden">
          {NOTIFICATION_ITEMS.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, [it.key]: !d[it.key] }))}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
              role="switch"
              aria-checked={draft[it.key]}
            >
              <div className="min-w-0">
                <div className="text-[15px] font-medium">{it.label}</div>
                <div className="text-[13px] text-ink-secondary">{it.desc}</div>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${draft[it.key] ? "bg-emerald-500/15 text-emerald-600" : "bg-elevated text-ink-tertiary"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${draft[it.key] ? "bg-emerald-500" : "bg-ink-tertiary"}`} />
                {draft[it.key] ? "On" : "Off"}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="h-11 rounded-xl" disabled={!dirty} onClick={() => { save(draft); toast("Notification settings saved", { tone: "success" }); }}>Save</Button>
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => setDraft(NOTIFICATION_DEFAULTS)}>Restore defaults</Button>
      </div>
    </div>
  );
}

/* ------------------------------ Local storage ------------------------------ */

export function StoragePanel() {
  const store = useStore();
  const [pending, setPending] = useState<{ payload: BackupPayload; summary: BackupSummary } | null>(null);
  const [, bump] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = () => bump((n) => n + 1);
    window.addEventListener("tfl:backup", h);
    return () => window.removeEventListener("tfl:backup", h);
  }, []);
  const last = lastBackupAt();
  const age = backupAgeDays();

  const onPick = async (f?: File) => {
    if (!f) return;
    try { setPending(await readBackupFile(f)); } catch (e) { toast((e as Error).message, { tone: "danger" }); }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <p className="text-[14px] text-ink-secondary">All data is kept only in this browser — on this device, no cloud and no server. Download a backup regularly.</p>
      <div className="grid grid-cols-3 gap-3">
        {[["Data", "localStorage", `${localUsageKb()} KB used`], ["Records", String(store.customers.length + store.suppliers.length + store.products.length + store.orders.length + store.invoices.length), "customers, suppliers, products, orders, invoices"], ["Mode", "Offline", "No server needed"]].map(([l, v, n]) => (
          <div key={l} className="brand-card p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">{l}</div>
            <div className="mt-1 truncate text-[16px] font-semibold">{v}</div>
            <div className="text-[11px] text-ink-secondary">{n}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Eyebrow>Server database</Eyebrow>
        <div className="brand-card p-4"><SyncStatusLine /></div>
        <Eyebrow>Backup</Eyebrow>
        <div className="brand-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-[15px] font-medium">Download a copy of the data</div>
            <div className="text-[13px] text-ink-secondary">
              {last ? `Last copy: ${last.toLocaleString("en-GB")} (${age === 0 ? "today" : `${age} d ago`}).` : "No backup has been made yet."} One file with every customer, quotation, order, invoice and setting.
            </div>
          </div>
          <Button className="h-10 rounded-xl" onClick={() => { const r = downloadBackup(); toast(`Backup saved: ${r.filename} (${Math.round(r.bytes / 1024)} KB)`, { tone: "success" }); }}>Download backup</Button>
        </div>
        <div className="brand-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-[15px] font-medium">Restore from a backup</div>
            <div className="text-[13px] text-ink-secondary">Replaces all current data with the file. Download a copy of the current data first.</div>
          </div>
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => fileRef.current?.click()}>Choose file…</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
        </div>
        {pending ? (
          <div className="brand-card space-y-3 border border-red-500/50 p-4">
            <div>
              <div className="text-[15px] font-medium">Restore the backup from {pending.summary.exportedAt ? new Date(pending.summary.exportedAt).toLocaleString("en-GB") : "this file"}?</div>
              <div className="text-[13px] text-ink-secondary">Customers: {pending.summary.customers} · quotations: {pending.summary.quotations} · orders: {pending.summary.orders} · invoices: {pending.summary.invoices}. Current data will be replaced.</div>
            </div>
            <div className="flex gap-2">
              <Button className="h-10 rounded-xl bg-red-600 text-white hover:bg-red-700" onClick={() => { restoreBackup(pending.payload); toast("Data restored — reloading…", { tone: "success" }); setTimeout(() => window.location.reload(), 600); }}>Replace data</Button>
              <Button variant="outline" className="h-10 rounded-xl" onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Eyebrow>Danger zone</Eyebrow>
        <div className="brand-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-[15px] font-medium">Reset local data</div>
            <div className="text-[13px] text-ink-secondary">Removes every change and returns the demo data. Cannot be undone — download a backup first.</div>
          </div>
          <Button
            variant="outline"
            className="h-10 rounded-xl border-red-500/60 text-red-600"
            onClick={() => {
              if (!window.confirm("Delete ALL local data and return to the demo data? This cannot be undone — download a backup first.")) return;
              resetLocalData();
              toast("Data reset", { tone: "success" });
              setTimeout(() => window.location.reload(), 400);
            }}
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
