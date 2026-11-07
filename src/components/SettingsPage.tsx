import { formatByCurrency, sumByCurrency } from "@/lib/partyFigures";
import { MailboxSettings } from "@/components/MailboxSettings";
import { CampaignSendingSettings } from "@/components/CampaignSendingSettings";
import { WhatsAppSettings } from "@/components/WhatsAppSettings";
import { HistoricalImport } from "@/components/HistoricalImport";
import { useState, useEffect, lazy, Suspense } from "react";
import {
  Building2,
  UserRound,
  KeyRound,
  LayoutGrid,
  Users,
  TrendingUp,
  Package,
  Mail,
  MessageCircle,
  Send,
  Wallet,
  FileText,
  Coins,
  ScrollText,
  Palette,
  Database,
  Scale,
  Lock,
  Search,
  ChevronRight,
  SlidersHorizontal,
  ChevronLeft,
  Bell,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSideExtra } from "@/lib/sideExtra";
import type { LucideIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLE_LABELS, type Role } from "@/lib/domain";
import { useTheme, NAV_GROUPS, CONFIGURABLE_SECTIONS } from "@/components/Shell";
import { Field, TextInput, SelectInput } from "@/components/forms";
import { PanelShell, formatMoney } from "@/components/shared-ui";
import { ModuleSettingsView } from "@/components/ModuleSettingsView";
import { isModuleCustomised } from "@/lib/moduleConfig";

// Each configuration panel below is its own lazy chunk (see SettingsPanels.tsx);
// none of them are paid for until the person actually opens Settings.
const TflSettingsPanel = lazy(() => import("@/tfl/TflSettingsPanel").then((m) => ({ default: m.TflSettingsPanel })));
const RoleMatrix = lazy(() => import("@/tfl/TflSettingsPanel").then((m) => ({ default: m.RoleMatrix })));
const XeroMappingPanel = lazy(() => import("@/components/XeroMappingPanel").then((m) => ({ default: m.XeroMappingPanel })));
const OrganisationPanel = lazy(() => import("@/components/SettingsPanels").then((m) => ({ default: m.OrganisationPanel })));
const CrmSettingsPanel = lazy(() => import("@/components/SettingsPanels").then((m) => ({ default: m.CrmSettingsPanel })));
const SalesSettingsPanel = lazy(() => import("@/components/SettingsPanels").then((m) => ({ default: m.SalesSettingsPanel })));
const ProductSettingsPanel = lazy(() => import("@/components/SettingsPanels").then((m) => ({ default: m.ProductSettingsPanel })));
const CurrencySettingsPanel = lazy(() => import("@/components/SettingsPanels").then((m) => ({ default: m.CurrencySettingsPanel })));
const AccountPanel = lazy(() => import("@/components/SettingsAccountPanels").then((m) => ({ default: m.AccountPanel })));
const SystemPanel = lazy(() => import("@/components/SettingsAccountPanels").then((m) => ({ default: m.SystemPanel })));
const NotificationsPanel = lazy(() => import("@/components/SettingsAccountPanels").then((m) => ({ default: m.NotificationsPanel })));
const StoragePanel = lazy(() => import("@/components/SettingsAccountPanels").then((m) => ({ default: m.StoragePanel })));
const TermsPanel = lazy(() => import("@/components/SettingsPanels").then((m) => ({ default: m.TermsPanel })));
const PrivacyPanel = lazy(() => import("@/components/SettingsPanels").then((m) => ({ default: m.PrivacyPanel })));

const ALL_SECTIONS_FOR_SETTINGS = NAV_GROUPS.flatMap((g) => g.items);

function downloadText(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Settings — a search-filterable directory over the app's configuration
 * surface, most of which is reference-only in this demo (no server-side
 * permission enforcement to back live edits yet). Each panel is its own
 * lazy chunk so opening Settings doesn't pull in the eleven panels nobody
 * clicked into.
 */

function InvoicingSettingsPanel({
  onBack,
  showToast,
  toast,
}: {
  onBack: () => void;
  showToast: (msg: string) => void;
  toast: string | null;
}) {
  const store = useStore();
  const s = store.salesSettings;
  const org = store.organisation;
  const [invoicePrefix, setInvoicePrefix] = useState(s.invoicePrefix || "INV-2026-");
  const [paymentTerms, setPaymentTerms] = useState(s.defaultPaymentTerms || "30 days");
  const [taxNote, setTaxNote] = useState("Bonded trade — no VAT on standard lines");
  const save = () => {
    store.updateSalesSettings({
      invoicePrefix: invoicePrefix.trim() || s.invoicePrefix || "INV-2026-",
      defaultPaymentTerms: paymentTerms.trim() || s.defaultPaymentTerms,
    });
    showToast("Invoicing settings saved");
  };
  return (
    <PanelShell title="Invoicing" onBack={onBack} toast={toast}>
      <div className="brand-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Invoice number prefix">
          <TextInput value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} placeholder="INV-2026-" />
        </Field>
        <Field label="Default payment terms">
          <TextInput value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="30 days" />
        </Field>
        <Field label="Default currency">
          <TextInput value={org.defaultCurrency || "GBP"} disabled />
        </Field>
        <Field label="Tax policy">
          <TextInput value={taxNote} onChange={(e) => setTaxNote(e.target.value)} />
        </Field>
      </div>
      <div className="brand-card overflow-hidden mt-3 divide-y divide-divider">
        {[
          ["From orders", "One-click convert keeps line items"],
          ["Dashboard", "Totals feed revenue & profit tiles"],
          ["Company on invoice", org.legalName || org.tradingName || "Organisation"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-[13px] text-ink-secondary">{label}</span>
            <span className="text-[14px] font-medium text-ink text-right">{value}</span>
          </div>
        ))}
      </div>
      <Button className="w-full h-12 rounded-full bg-accent-fill text-white font-semibold mt-3" onClick={save}>
        Save invoicing settings
      </Button>
      <p className="text-[13px] text-ink-tertiary px-1 mt-2">
        Prefix and terms apply when creating invoices from orders. Individual invoices stay under Deal Desk → Invoices.
      </p>
    </PanelShell>
  );
}


export function SettingsPage() {
  const store = useStore();
  const { theme, toggle, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<string | null>(() => {
    // The top-bar backup pill asks to open Local storage directly.
    try {
      const want = sessionStorage.getItem("tfl.settings.open");
      if (want) { sessionStorage.removeItem("tfl.settings.open"); return want; }
    } catch { /* ignore */ }
    return null;
  });
  // Opening a panel (or going Back) always starts at the top, on every screen size.
  useEffect(() => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [panel]);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<Role>("sales");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const groups: {
    title: string;
    items: { id: string; label: string; sub: string; icon: React.ElementType; color: string }[];
  }[] = [
    {
      title: "Organisation",
      items: [
        { id: "account", label: "My account", sub: "Profile, theme, password", icon: UserRound, color: "bg-accent-fill" },
        { id: "org", label: "Organisation", sub: "Company profile, VAT, address", icon: Building2, color: "bg-accent-fill" },
        { id: "users", label: "Users", sub: "Team members & access", icon: UserRound, color: "bg-accent-fill" },
        { id: "roles", label: "Roles & Permissions", sub: "What each role can do", icon: KeyRound, color: "bg-accent-fill" },
        { id: "modules", label: "Modules", sub: "Show or hide modules in navigation", icon: LayoutGrid, color: "bg-accent-fill" },
        { id: "modsettings", label: "Module settings", sub: "Density, side panel, hotkeys and more — per module", icon: SlidersHorizontal, color: "bg-accent-fill" },
      ],
    },
    {
      title: "Film Location",
      items: [
        { id: "tflsettings", label: "Defaults, numbering & alerts", sub: "VAT, payment terms, reference numbers, expiry warnings, booking rules", icon: SlidersHorizontal, color: "bg-accent-fill" },
      ],
    },
    {
      title: "Platform",
      items: [
        { id: "system", label: "System", sub: "Company, time zone, currency, date format", icon: SlidersHorizontal, color: "bg-accent-fill" },
        { id: "notifications", label: "Notifications", sub: "Which alerts and email prompts are on", icon: Bell, color: "bg-accent-fill" },
        { id: "storage", label: "Local storage", sub: "Backup, restore and reset browser data", icon: HardDrive, color: "bg-accent-fill" },
      ],
    },
    {
      title: "Configuration",
      items: [
        { id: "import", label: "Historical data", sub: "Templates, bulk upload, review queue", icon: Database, color: "bg-accent-fill" },
      ],
    },
    {
      title: "Communications",
      items: [
        { id: "email", label: "Email", sub: "Mailbox connection & history scan", icon: Mail, color: "bg-accent-fill" },
        { id: "whatsapp", label: "WhatsApp", sub: "Business app coexistence & chat import", icon: MessageCircle, color: "bg-accent-fill" },
        { id: "mailing", label: "Mass Mailing", sub: "Sending service, unsubscribe, suppression", icon: Send, color: "bg-accent-fill" },
      ],
    },
    {
      title: "Finance",
      items: [
        { id: "accounting", label: "Accounting", sub: "Xero / QuickBooks connector", icon: Wallet, color: "bg-accent-fill" },
      ],
    },
    {
      title: "Security",
      items: [
        { id: "audit", label: "Audit Log", sub: "Who changed what", icon: ScrollText, color: "bg-accent-fill" },
        { id: "appearance", label: "Appearance", sub: "Theme & language", icon: Palette, color: "bg-accent-fill" },
        { id: "data", label: "Data Management", sub: "Reset or reseed demo data", icon: Database, color: "bg-accent-fill" },
      ],
    },
    {
      title: "Legal",
      items: [
        { id: "terms", label: "Terms & Conditions", sub: "Platform terms of use", icon: Scale, color: "bg-accent-fill" },
        { id: "privacy", label: "Privacy Policy", sub: "Data handling & retention", icon: Lock, color: "bg-accent-fill" },
      ],
    },
  ];

  const filtered = groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          !query ||
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          i.sub.toLowerCase().includes(query.toLowerCase()),
      ),
    }))
    .filter((g) => g.items.length > 0);

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5 border-b border-divider last:border-0">
      <span className="text-[15px] text-ink-secondary shrink-0">{label}</span>
      <span className="text-[15px] font-medium text-right text-ink">{value}</span>
    </div>
  );

  const panelContent: React.ReactNode = (() => {
  if (panel === "account") {
    return (
      <PanelShell title="My account" onBack={() => setPanel(null)} toast={toast}>
        <AccountPanel onSignOut={() => store.signOut()} />
      </PanelShell>
    );
  }
  if (panel === "system") {
    return (
      <PanelShell title="System" onBack={() => setPanel(null)} toast={toast}>
        <SystemPanel />
      </PanelShell>
    );
  }
  if (panel === "notifications") {
    return (
      <PanelShell title="Notifications" onBack={() => setPanel(null)} toast={toast}>
        <NotificationsPanel />
      </PanelShell>
    );
  }
  if (panel === "storage") {
    return (
      <PanelShell title="Local storage" onBack={() => setPanel(null)} toast={toast}>
        <StoragePanel />
      </PanelShell>
    );
  }

  if (panel === "org") {
    return <OrganisationPanel onBack={() => setPanel(null)} showToast={showToast} toast={toast} />;
  }

  if (panel === "users") {
    const invite = () => {
      if (!newUserName.trim() || !newUserEmail.trim()) return;
      store.addUser({ name: newUserName.trim(), email: newUserEmail.trim(), role: newUserRole });
      setNewUserName("");
      setNewUserEmail("");
      setNewUserRole("sales");
      setAddingUser(false);
      showToast("Team member invited (demo)");
    };

    return (
      <PanelShell title="Users" onBack={() => setPanel(null)} toast={toast}>
        <div className="brand-card overflow-hidden divide-y divide-divider">
          {store.users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-elevated text-[12px] font-semibold text-ink-secondary">
                {u.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium truncate">
                  {u.name}{" "}
                  {u.id === store.user?.id ? (
                    <span className="text-ink-tertiary font-normal">(you)</span>
                  ) : null}
                  {!u.isActive ? (
                    <span className="ml-1 rounded-full bg-elevated px-2 py-0.5 text-[11px] font-medium text-ink-tertiary">
                      Inactive
                    </span>
                  ) : null}
                </div>
                <div className="text-[13px] text-ink-secondary truncate">{u.email}</div>
              </div>
              <select
                value={u.role}
                onChange={(e) => store.updateUser(u.id, { role: e.target.value as Role })}
                className="h-9 rounded-lg border border-divider bg-canvas px-2 text-[13px] font-medium text-ink-secondary outline-none focus:border-accent"
              >
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {u.id !== store.user?.id ? (
                <button
                  type="button"
                  onClick={() => store.updateUser(u.id, { isActive: !u.isActive })}
                  className="text-[13px] font-medium text-accent shrink-0"
                >
                  {u.isActive ? "Deactivate" : "Activate"}
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {addingUser ? (
          <div className="brand-card p-4 space-y-3">
            <Field label="Name" required>
              <TextInput value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Full name" />
            </Field>
            <Field label="Email" required>
              <TextInput value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="name@company.com" />
            </Field>
            <Field label="Role">
              <SelectInput
                value={newUserRole}
                onChange={(v) => setNewUserRole(v as Role)}
                options={(Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setAddingUser(false)}>
                Cancel
              </Button>
              <Button className="flex-1 h-11 rounded-xl bg-accent-fill" onClick={invite}>
                Send invite
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="w-full h-12 rounded-full bg-accent-fill text-white font-semibold"
            onClick={() => setAddingUser(true)}
          >
            Invite team member
          </Button>
        )}
      </PanelShell>
    );
  }

  if (panel === "roles") {
    return (
      <PanelShell title="Roles & Permissions" onBack={() => setPanel(null)} toast={toast}>
        <Suspense fallback={null}><RoleMatrix /></Suspense>
      </PanelShell>
    );
  }

  if (panel === "tflsettings") {
    return (
      <PanelShell title="Film Location" onBack={() => setPanel(null)} toast={toast}>
        <Suspense fallback={null}><TflSettingsPanel onSaved={showToast} /></Suspense>
      </PanelShell>
    );
  }

  if (panel === "modsettings") {
    return (
      <PanelShell title="Module settings" onBack={() => setPanel(null)} toast={toast}>
        <p className="text-[13px] text-ink-secondary -mt-2">
          Every module has its own settings: density, text size, side panel behaviour, reminders and hotkeys.
          You can also open them from the gear at the bottom of any module's side panel.
        </p>
        {NAV_GROUPS.map((group) => {
          const mods = group.items.filter((i) => i.id !== "settings");
          if (!mods.length) return null;
          return (
            <div key={group.label} className="space-y-2">
              <div className="px-1 text-[12.5px] font-semibold uppercase tracking-wide text-ink-tertiary">{group.label}</div>
              <div className="brand-card overflow-hidden divide-y divide-divider">
                {mods.map((item) => (
                  <button key={item.id} type="button" onClick={() => setPanel(`modset:${item.id}`)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-elevated">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><item.icon className="h-4 w-4" /></div>
                    <span className="flex-1 text-[15px] font-medium text-ink">{item.label}</span>
                    {isModuleCustomised(item.id) ? <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent">Customised</span> : null}
                    <ChevronRight className="h-4 w-4 text-ink-tertiary" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </PanelShell>
    );
  }

  if (panel === "modules") {
    return (
      <PanelShell title="Modules" onBack={() => setPanel(null)} toast={toast}>
        <p className="text-[13px] text-ink-secondary -mt-2">
          Hide modules your team doesn't use. Dashboard, Signals and Settings always stay
          visible — everything else can be switched off here without losing any data behind it.
        </p>
        {NAV_GROUPS.filter((g) => g.items.some((i) => CONFIGURABLE_SECTIONS.includes(i))).map(
          (group) => (
            <div key={group.label} className="space-y-2">
              <div className="px-1 text-[12.5px] font-semibold uppercase tracking-wide text-ink-tertiary">
                {group.label}
              </div>
              <div className="brand-card overflow-hidden divide-y divide-divider">
                {group.items
                  .filter((item) => CONFIGURABLE_SECTIONS.includes(item))
                  .map((item) => {
                    const enabled = store.moduleSettings[item.id] !== false;
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                          <item.icon className="h-4 w-4" />
                        </div>
                        <span className="flex-1 text-[15px] font-medium text-ink">{item.label}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          aria-label={`${enabled ? "Hide" : "Show"} ${item.label}`}
                          onClick={() => {
                            store.setModuleEnabled(item.id, !enabled);
                            showToast(`${item.label} ${!enabled ? "shown" : "hidden"} in navigation`);
                          }}
                          className={cn(
                            "relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors",
                            enabled ? "bg-accent-fill" : "bg-elevated",
                          )}
                        >
                          <span
                            className={cn(
                              "absolute left-0 top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow transition-transform",
                              enabled ? "translate-x-[20px]" : "translate-x-[2px]",
                            )}
                          />
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          ),
        )}
      </PanelShell>
    );
  }

  if (panel === "crm") {
    return <CrmSettingsPanel onBack={() => setPanel(null)} showToast={showToast} toast={toast} />;
  }

  if (panel === "sales") {
    return <SalesSettingsPanel onBack={() => setPanel(null)} showToast={showToast} toast={toast} />;
  }

  if (panel === "productsCfg") {
    return <ProductSettingsPanel onBack={() => setPanel(null)} showToast={showToast} toast={toast} />;
  }

  if (panel === "xeromap") {
    return <XeroMappingPanel onBack={() => setPanel(null)} toast={toast} />;
  }

  if (panel === "currency") {
    return <CurrencySettingsPanel onBack={() => setPanel(null)} showToast={showToast} toast={toast} />;
  }

  if (panel === "email") {
    return (
      <PanelShell title="Email" onBack={() => setPanel(null)} toast={toast}>
        <div className="brand-card overflow-hidden">
          <Row label="Provider" value="Zoho Mail (IMAP / API), several mailboxes" />
          <Row
            label="Status"
            value={<span className="text-accent font-semibold">NOT CONNECTED</span>}
          />
          <Row label="History rule" value="Received only · rolling 18 months" />
          <Row label="Mailbox" value="— configure credentials" />
        </div>
        <MailboxSettings />
        <div className="flex flex-col gap-2">
          <Button
            className="h-11 rounded-xl bg-accent-fill"
            onClick={() => showToast("Connect flow opens when credentials are set")}
          >
            Connect mailbox
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() => {
              const res = store.runHistoricalEmailScan();
              setScanMsg(res.message);
              showToast(res.message);
            }}
          >
            Run historical scan (demo data)
          </Button>
        </div>
        {scanMsg ? (
          <div className="brand-card p-4 text-[14px] text-ink-secondary leading-relaxed">
            {scanMsg}
          </div>
        ) : null}
        <p className="text-[13px] text-ink-tertiary">
          Scan creates/updates contacts and companies from realistic sample messages. Live mailbox requires provider credentials in production.
        </p>
      </PanelShell>
    );
  }

  if (panel === "whatsapp") {
    return (
      <PanelShell title="WhatsApp" onBack={() => setPanel(null)} toast={toast}>
        <WhatsAppSettings />
      </PanelShell>
    );
  }

  if (panel === "import") {
    return (
      <PanelShell title="Historical data" onBack={() => setPanel(null)} toast={toast}>
        <HistoricalImport />
      </PanelShell>
    );
  }

  if (panel === "mailing") {
    return (
      <PanelShell title="Mass Mailing" onBack={() => setPanel(null)} toast={toast}>
        <CampaignSendingSettings />
      </PanelShell>
    );
  }

  if (panel === "accounting") {
    const sales = sumByCurrency(store.invoices, (i) => i.currency, (i) => i.total);
    const paid = sumByCurrency(
      store.invoices.filter((i) => i.status === "paid"),
      (i) => i.currency,
      (i) => i.amountPaid || i.total,
    );
    return (
      <PanelShell title="Accounting" onBack={() => setPanel(null)} toast={toast}>
        <div className="grid grid-cols-2 gap-3">
          <div className="brand-card p-4">
            <div className="text-[12px] text-ink-secondary">Invoiced (CRM)</div>
            <div className="tfl-metric text-[22px] font-semibold mt-1">{formatByCurrency(sales)}</div>
          </div>
          <div className="brand-card p-4">
            <div className="text-[12px] text-ink-secondary">Received</div>
            <div className="tfl-metric text-[22px] font-semibold mt-1">{formatByCurrency(paid)}</div>
          </div>
        </div>
        <div className="brand-card overflow-hidden">
          <Row label="External connector" value="Xero-ready · QuickBooks-ready" />
          <Row label="Status" value={<span className="text-accent font-semibold">NOT CONNECTED</span>} />
          <Row label="Internal ledger" value="Linked to invoices & orders" />
        </div>
        <Button
          className="w-full h-12 rounded-full bg-accent-fill text-white font-semibold"
          onClick={() => showToast("OAuth connector not configured in demo")}
        >
          Connect Xero
        </Button>
      </PanelShell>
    );
  }

  if (panel === "invoicing") {
    return <InvoicingSettingsPanel onBack={() => setPanel(null)} showToast={showToast} toast={toast} />;
  }

  if (panel === "audit") {
    const events: { who: string; what: string; when: string }[] = [];
    return (
      <PanelShell title="Audit Log" onBack={() => setPanel(null)} toast={toast}>
        <div className="brand-card overflow-hidden divide-y divide-divider">
          {events.length === 0 && (
            <div className="px-4 py-6 text-[14px] text-ink-secondary">
              No audit entries are recorded in this session yet.
            </div>
          )}
          {events.map((e, i) => (
            <div key={i} className="px-4 py-3.5">
              <div className="text-[15px] font-medium">{e.what}</div>
              <div className="text-[13px] text-ink-secondary mt-0.5">
                {e.who} · {e.when}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-ink-tertiary">
          Sensitive actions will be recorded here with who made the change, what changed and when.
        </p>
      </PanelShell>
    );
  }

  if (panel === "appearance") {
    return (
      <PanelShell title="Appearance" onBack={() => setPanel(null)} toast={toast}>
        <div className="brand-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 border-b border-divider">
            <div>
              <div className="text-[15px] font-medium">Theme</div>
              <div className="text-[13px] text-ink-secondary">Light, Twilight or Dark across the app</div>
            </div>
            <div className="flex rounded-full bg-elevated p-1">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${
                  theme === "light" ? "bg-surface shadow-sm text-ink" : "text-ink-secondary"
                }`}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme("split")}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${
                  theme === "split" ? "bg-surface shadow-sm text-ink" : "text-ink-secondary"
                }`}
              >
                Twilight
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${
                  theme === "dark" ? "bg-surface shadow-sm text-ink" : "text-ink-secondary"
                }`}
              >
                Dark
              </button>
            </div>
          </div>
          <Row label="Language" value="English" />
        </div>
        <Button variant="outline" className="w-full h-11 rounded-xl" onClick={toggle}>
          Toggle theme now
        </Button>
      </PanelShell>
    );
  }

  if (panel === "data") {
    return (
      <PanelShell title="Data Management" onBack={() => setPanel(null)} toast={toast}>
        <div className="brand-card overflow-hidden">
          <Row label="Customers" value={String(store.customers.length)} />
          <Row label="Suppliers" value={String(store.suppliers.length)} />
          <Row label="Products" value={String(store.products.length)} />
          <Row label="Pricing records" value={String(store.pricingRecords.length)} />
          <Row label="Invoices" value={String(store.invoices.length)} />
          <Row label="Documents" value={String(store.documents.length)} />
        </div>
        <Button
          variant="outline"
          className="w-full h-11 rounded-xl"
          onClick={() => {
            const snapshot = {
              exportedAt: new Date().toISOString(),
              customers: store.customers,
              suppliers: store.suppliers,
              products: store.products,
              pricing: store.pricingRecords,
              quotations: store.quotations,
              orders: store.orders,
              invoices: store.invoices,
              contacts: store.contacts,
              documents: store.documents,
            };
            downloadText(
              `tfl-crm-snapshot-${new Date().toISOString().slice(0, 10)}.json`,
              JSON.stringify(snapshot, null, 2),
              "application/json",
            );
            showToast("CRM snapshot downloaded");
          }}
        >
          Export CRM snapshot
        </Button>
        <Button
          className="w-full h-11 rounded-xl bg-elevated text-ink hover:bg-canvas border border-divider"
          onClick={() => {
            if (window.confirm("Reload the app to reset demo session state?")) {
              window.location.reload();
            }
          }}
        >
          Reset demo session
        </Button>
        <p className="text-[13px] text-ink-tertiary">
          Demo data is seeded in memory. Clearing site data for this origin fully reseeds on next load.
        </p>
      </PanelShell>
    );
  }

  if (panel === "terms") {
    return (
      <PanelShell title="Terms & Conditions" onBack={() => setPanel(null)} toast={toast}>
        <TermsPanel />
      </PanelShell>
    );
  }

  if (panel === "privacy") {
    return (
      <PanelShell title="Privacy Policy" onBack={() => setPanel(null)} toast={toast}>
        <PrivacyPanel />
      </PanelShell>
    );
  }

  return null;
  })();

  if (panel?.startsWith("modset:")) {
    const mid = panel.slice(7);
    const label = ALL_SECTIONS_FOR_SETTINGS.find((i) => i.id === mid)?.label ?? mid;
    return (
      <div className="settings-root settings-modfull">
        <ModuleSettingsView key={mid} id={mid} title={label} embedded onClose={() => setPanel("modsettings")} />
      </div>
    );
  }

  return (
    <div className="settings-root">
      <div className="settings-split">
        <div className={`settings-list-pane${panel ? " has-detail" : ""}`}>
          <div className="settings-shell">
            <div className="settings-hero settings-hero-compact">
              <div className="settings-eyebrow"><span className="settings-dot" /><SlidersHorizontal size={14} /> Settings</div>
            </div>

            <div className="settings-profile-card">
              <div className="settings-profile-avatar" aria-hidden>{(store.user?.name || "Roni Ornadel").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
              <div className="settings-profile-user">
                <div className="settings-profile-name">{store.user?.name || "Roni Ornadel"}</div>
                <div className="settings-profile-role">Administrator · The Film Location</div>
              </div>
              <div className="settings-profile-meta">
                <div>{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
                <div className="settings-profile-session">Active session</div>
              </div>
            </div>

            <div className="settings-search-wrap">
              <Search size={16} />
              <input className="settings-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search settings" aria-label="Search settings" />
            </div>

            {filtered.length ? filtered.map((group) => (
              <div key={group.title} className="settings-list-group">
                <div className="settings-list-label">{group.title}</div>
                <div className="settings-list-card">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = panel === item.id || (item.id === "modsettings" && !!panel?.startsWith("modset:"));
                    return (
                      <button key={item.id} type="button" className={`settings-row${active ? " settings-row-active" : ""}`} onClick={() => setPanel(item.id)}>
                        <span className="settings-row-icon"><Icon size={17} strokeWidth={2} /></span>
                        <span className="settings-row-main">
                          <span className="settings-row-title">{item.label}</span>
                          <span className="settings-row-sub">{item.sub}</span>
                        </span>
                        <ChevronRight size={16} className="settings-row-chevron" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )) : <div className="settings-empty">Nothing found for “{query}”</div>}

            <button type="button" className="settings-signout" onClick={() => store.signOut()}>Sign out</button>
          </div>
        </div>

        <div className={`settings-detail-pane${panel ? " open" : ""}`}>
          {panel ? (
            <>
              <div className="settings-detail-head">
                <button type="button" className="settings-detail-back" onClick={() => setPanel(null)}>
                  <ChevronLeft size={18} strokeWidth={2.5} /><span>Settings</span>
                </button>
              </div>
              <div className="settings-detail-body">
                <Suspense fallback={<div className="space-y-3 pt-2"><div className="skeleton h-8 w-48" /><div className="skeleton h-[140px] w-full" /><div className="skeleton h-[140px] w-full" /></div>}>
                  {panelContent}
                </Suspense>
              </div>
            </>
          ) : (
            <div className="settings-detail-empty">
              <SlidersHorizontal size={28} strokeWidth={1.5} />
              <p>Choose a section on the left</p>
            </div>
          )}
        </div>
      </div>
      {toast ? <div className="toast-stack"><div className="toast"><span className="toast-msg">{toast}</span></div></div> : null}
    </div>
  );
}
