import {
  Bell, ChevronLeft, ChevronRight, Columns3, Database, FileSpreadsheet, FolderTree, Keyboard, LayoutList,
  PanelLeftClose, PanelLeftOpen, RotateCcw, Search, SlidersHorizontal, X, type LucideIcon,
} from "lucide-react";
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import {
  EXPORT_SECTION, HOTKEYS, KEYS_SECTION, NOTIFY_SECTION, SIDEBAR_SECTION, VIEW_SECTION, getModuleConfig, ownersOf, rulesFor,
  changedCount, defaultsFor, elementsSectionFor, EXPORT_MODULES, joinHidden, parseHidden, replaceModuleConfig,
  resetModuleConfig, resetModuleConfigKeys, setModuleConfig, useModuleConfigValues, type ConfigField, type ConfigSection,
} from "@/lib/moduleConfig";
import { askNotificationPermission, notificationState, notifyModule, type PermState } from "@/lib/moduleRuntime";
import { cn } from "@/lib/utils";

/**
 * One settings screen for every module — port of unique-ops v132 ModuleSettingsView.
 * Grouped, searchable list of sections | section detail. Esc clears the search, then closes.
 * Every section has its own reset; the module's settings can be exported, imported and reset.
 * All values live in lib/moduleConfig.ts.
 */
export interface SettingsItem { key: string; label: string }

const RULE_ICON: Record<string, LucideIcon> = {};
const LIST_HIDDEN_KEY = "tfl.modules.settingsListHidden";

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={cn("ms-switch", on && "is-on")} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}
function Option({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="ms-opt">
      <div className="ms-opt-main">
        <div className="ms-opt-title">{title}</div>
        {sub ? <div className="ms-opt-sub">{sub}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** One schema field → the right control (toggle / segmented / select / number). */
function FieldRow({ f, value, onChange }: { f: ConfigField; value: boolean | string | number; onChange: (v: boolean | string | number) => void }) {
  let control: ReactNode = null;
  if (f.kind === "toggle") control = <Switch label={f.label} on={!!value} onChange={onChange} />;
  else if (f.kind === "select" && f.options) {
    const short = f.options.length <= 4 && f.options.reduce((n, o) => n + o.label.length, 0) <= 40;
    control = short ? (
      <div className="ms-seg" role="radiogroup" aria-label={f.label}>
        {f.options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? "is-on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    ) : (
      <select className="ms-select" value={String(value)} onChange={(e) => onChange(e.target.value)} aria-label={f.label}>
        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (f.kind === "number") {
    control = (
      <span className="ms-num">
        <input type="number" value={Number(value)} min={f.min} max={f.max} step={f.step ?? 1} aria-label={f.label}
          onChange={(e) => { const n = Number(e.target.value); if (isFinite(n)) onChange(n); }} />
        {f.unit ? <span>{f.unit}</span> : null}
      </span>
    );
  }
  if (!control) return null;
  return <Option title={f.label} sub={f.hint}>{control}</Option>;
}

const keysOf = (sections: ConfigSection[]) => sections.flatMap((s) => s.fields.map((f) => f.key));

type Row = { id: string; label: string; sub: string; icon: LucideIcon; keywords?: string };
type Group = { title: string; items: Row[] };

/** What a typical row of the module looks like — the preview on «View & layout» shows it. */
const PREVIEW: Record<string, { t: string; s: string; m: string; b?: string }[]> = {
  dashboard: [{ t: "Funds awaiting release", s: "RG-2026-014 · held in escrow", m: "€2,430" }, { t: "Supplier offers to review", s: "Latest: Premium spirits case", m: "2" }],
  reports: [{ t: "Net margin received", s: "Last 90 days", m: "€4,980" }, { t: "Brand: Macallan", s: "12 cases · 2 deals", m: "€1,120" }],
  contacts: [{ t: "Isla Verde Spirits Co.", s: "Madrid · buyer · 3 deals", m: "€48,200", b: "Active" }, { t: "Hartmann Getränke GmbH", s: "Hamburg · supplier", m: "€12,900", b: "KYC sent" }],
  markets: [{ t: "Spain", s: "Travel retail · 4 buyers", m: "€61,000" }, { t: "Germany", s: "Wholesale · 2 buyers", m: "€38,400" }],
  products: [{ t: "Glenfiddich 18 · 70cl", s: "Whisky · 6 × 70cl", m: "€412 / case" }, { t: "Moët Impérial · 75cl", s: "Champagne · 6 × 75cl", m: "€198 / case" }],
  requirements: [{ t: "Premium vodka · 20 pallets", s: "Isla Verde · Spain", m: "New", b: "Matched" }, { t: "Prosecco DOC · 8 pallets", s: "Nordic Wine AB", m: "Quoted" }],
  dealdesk: [{ t: "RG-2026-014", s: "Glenfiddich 18 · Spain → UK", m: "€2,430", b: "In escrow" }, { t: "RG-2026-013", s: "Moët Impérial · Germany", m: "€1,880", b: "Agreed" }],
  warehouses: [{ t: "Glenfiddich 18 · lot 0412", s: "Bonded · T1 · Rotterdam", m: "120 cs", b: "Available" }, { t: "Moët Impérial · lot 0398", s: "Bonded · T2 · Antwerp", m: "40 cs", b: "Reserved" }],
  email: [{ t: "Isla Verde Spirits Co.", s: "Re: Quotation RG-Q-221", m: "09:41", b: "New" }, { t: "Hartmann Getränke", s: "Price list October", m: "Yesterday" }],
  whatsapp: [{ t: "Isla Verde — Marco", s: "Can you hold 20 pallets?", m: "10:02" }, { t: "Hartmann — Lena", s: "Pre-advice attached", m: "Mon" }],
  campaigns: [{ t: "October price list", s: "Sent to 142 buyers", m: "38% opened", b: "Sent" }, { t: "Q4 brand focus", s: "Draft", m: "—", b: "Draft" }],
  kyc: [{ t: "Nordic Wine AB", s: "Company · Stockholm", m: "Submitted", b: "Review" }, { t: "Hartmann Getränke GmbH", s: "Company · Hamburg", m: "Sent", b: "Sent" }],
  documents: [{ t: "CMR · RG-2026-014.pdf", s: "Deals, contracts & shipping", m: "2 Oct" }, { t: "Excise licence.pdf", s: "KYC & Company", m: "30 Sep" }],
  residency: [{ t: "Roni O.", s: "UK · 112 days this tax year", m: "112", b: "On track" }, { t: "Nikolai", s: "Spain · 64 days", m: "64" }],
  accounting: [{ t: "Net margin received", s: "RG-2026-012 · posted to Xero", m: "€1,540" }, { t: "Storage — Rotterdam", s: "Expense · September", m: "−€320" }],
  cashflow: [{ t: "Margin awaiting release", s: "RG-2026-014 · expected 14 Oct", m: "€2,430" }, { t: "Warehouse rent", s: "Monthly · Rotterdam", m: "−€1,900" }],
};

function ModuleSettingsInner({
  id, title, items, onClose, embedded, hasAttention, newLabel,
}: {
  id: string;
  title: string;
  /** Sections of the module's own sidebar (so they can be hidden / opened first). */
  items?: SettingsItem[];
  onClose: () => void;
  embedded?: boolean;
  hasAttention?: boolean;
  /** What “n” creates in this module (the primary button of its panel), e.g. “New request”. */
  newLabel?: string;
}) {
  const values = useModuleConfigValues(id);
  const rules = rulesFor(id);
  const elements = elementsSectionFor(id);
  const canExport = EXPORT_MODULES.includes(id);
  const [tab, setTab] = useState<string | null>(() => (rulesFor(id)[0] ? `rule:${rulesFor(id)[0].id}` : "view"));
  const [mobileDetail, setMobileDetail] = useState(false);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [perm, setPerm] = useState<PermState>(notificationState());
  const fileRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const [listHidden, setListHidden] = useState<boolean>(() => { try { return localStorage.getItem(LIST_HIDDEN_KEY) === "1"; } catch { return false; } });
  const toggleList = () => setListHidden((v) => { const n = !v; try { localStorage.setItem(LIST_HIDDEN_KEY, n ? "1" : "0"); } catch { /* ignore */ } return n; });

  // Opening a screen or a section always starts at its top, never wherever the previous one was scrolled.
  useEffect(() => {
    const el = detailRef.current;
    if (!el) return;
    el.scrollTop = 0;
    const page = el.closest("main");
    if (page) page.scrollTop = 0;
  }, [tab, mobileDetail]);

  const flash = (m: string) => { setNote(m); window.setTimeout(() => setNote(null), 2400); };
  const done = () => flash("Section reset");

  // Esc: clears the search first, then closes. Ignored while typing in another field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable);
      if (typing && !t?.classList.contains("ms-search-input")) return;
      if (query) { setQuery(""); return; }
      if (typing) { t?.blur(); return; }
      if (document.querySelector('[role="dialog"]')) return;
      if (mobileDetail) setMobileDetail(false); else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query, onClose, mobileDetail]);

  const hidden = parseHidden(values.hiddenItems);
  const setHidden = (key: string, hide: boolean) => {
    const next = hide ? [...new Set([...hidden, key])] : hidden.filter((k) => k !== key);
    if (hide && items && items.every((i) => next.includes(i.key))) { flash("At least one section must stay"); return; }
    setModuleConfig(id, { hiddenItems: joinHidden(next) });
  };

  // Only this module's own sections — nothing shared/generic across modules
  const GROUPS: Group[] = [
    { title: title, items: [
      ...rules.map((s): Row => ({ id: `rule:${s.id}`, label: s.title, sub: s.sub, icon: RULE_ICON[s.id] ?? SlidersHorizontal, keywords: s.keywords })),
      ...(items?.length ? [{ id: "panel", label: `${title} panel`, sub: "Which sections show and which opens first", icon: FolderTree, keywords: "panel sections hide show start" }] : []),
      ...(elements ? [{ id: "elements", label: elements.title, sub: elements.sub, icon: Columns3, keywords: elements.keywords }] : []),
      ...(canExport ? [{ id: "export", label: "Export data", sub: "CSV for this module", icon: FileSpreadsheet, keywords: EXPORT_SECTION.keywords }] : []),
      { id: "data", label: "Backup these settings", sub: "Export, import or reset this module", icon: Database, keywords: "backup file json export import reset" },
    ] },
  ];
  const q = query.trim().toLowerCase();
  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !q || `${i.label} ${i.sub} ${i.keywords ?? ""}`.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length);
  const active = GROUPS.flatMap((g) => g.items).find((i) => i.id === tab) ?? null;
  const ActiveIcon = active?.icon;

  const renderFields = (sections: ConfigSection[]) => (
    <>
      {sections.map((s) => {
        const fields = s.fields.filter((f) => !f.hidden);
        if (!fields.length) return null;
        return (
          <div key={s.id}>
            {sections.length > 1 ? <div className="ms-label">{s.title}</div> : null}
            <div className="ms-card">
              {fields.map((f) => <FieldRow key={f.key} f={f} value={(s.owner && s.owner !== id ? getModuleConfig(s.owner) : values)[f.key]} onChange={(v) => setModuleConfig(s.owner ?? id, { [f.key]: v })} />)}
            </div>
          </div>
        );
      })}
    </>
  );
  const renderReset = (keys: string[], owner?: string) => (
    <div className="ms-actions">
      <button type="button" className="ms-btn" onClick={() => { resetModuleConfigKeys(owner ?? id, keys); done(); }}><RotateCcw size={14} /> Reset this section</button>
    </div>
  );

  const exportCfg = () => {
    const tabs = Object.fromEntries(ownersOf(id).slice(1).map((o) => [o, getModuleConfig(o)]));
    const blob = new Blob([JSON.stringify({ module: id, values, tabs }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `tfl-${id}-settings.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash("Settings exported");
  };
  const importCfg = async (file: File | undefined) => {
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (!j || typeof j !== "object" || (j.module && j.module !== id)) throw new Error("bad");
      replaceModuleConfig(id, (j.values ?? j) as Record<string, unknown>);
      const t = (j.tabs ?? {}) as Record<string, Record<string, unknown>>;
      ownersOf(id).slice(1).forEach((o) => { if (t[o]) replaceModuleConfig(o, t[o]); });
      flash(`Settings for ${title} imported`);
    } catch { flash(`That file is not a ${title} settings export`); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const sample = PREVIEW[id] ?? [{ t: title, s: "Sample record", m: "" }, { t: `${title} · another`, s: "Sample record", m: "" }];

  const detail = (() => {
    switch (tab) {
      case "view":
        return (
          <>
            <div className={cn("ms-prev", values.density === "compact" && "is-compact", `fs-${values.textSize}`, values.zebra && "is-zebra")} data-width={values.pageWidth as string}>
              <div className="ms-prev-cap">Preview</div>
              {sample.map((r, n) => (
                <div className="ms-prev-row" key={r.t + n}>
                  <div className="ms-prev-av">{r.t.slice(0, 1).toUpperCase()}</div>
                  <div className="ms-prev-body">
                    <div className="ms-prev-top"><b>{r.t}</b>{r.m ? <span style={values.tabularNums ? { fontVariantNumeric: "tabular-nums" } : undefined}>{r.m}</span> : null}</div>
                    {values.density !== "compact" ? <div className="ms-prev-sub">{r.s}</div> : null}
                    {values.density !== "compact" && r.b ? <span className="ms-prev-badge">{r.b}</span> : null}
                  </div>
                </div>
              ))}
            </div>
            {renderFields([VIEW_SECTION])}
            {renderReset(keysOf([VIEW_SECTION]))}
          </>
        );
      case "panel": {
        const startOpts = items ?? [];
        return (
          <>
            {startOpts.length > 0 ? (
              <div className="ms-card">
                <Option title="Section to open first" sub={`When you open ${title}`}>
                  <select className="ms-select" aria-label="Section to open first" value={String(values.startItem ?? "")} onChange={(e) => setModuleConfig(id, { startItem: e.target.value })}>
                    <option value="">As the module decides</option>
                    {startOpts.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                  </select>
                </Option>
              </div>
            ) : null}
            <div className="ms-label">Sections in the {title} panel</div>
            <div className="ms-card">
              {items?.map((i) => (
                <Option key={i.key} title={i.label}><Switch label={i.label} on={!hidden.includes(i.key)} onChange={(v) => setHidden(i.key, !v)} /></Option>
              ))}
            </div>
            <p className="ms-hint">The section open right now stays visible even if hidden here.</p>
          </>
        );
      }
      case "sidebar": {
        const startOpts = items ?? [];
        return (
          <>
            {renderFields([SIDEBAR_SECTION])}
            {startOpts.length > 0 ? (
              <div className="ms-card" style={{ marginTop: 12 }}>
                <Option title="Section to open first" sub="Which panel section is selected when you open the module">
                  <select className="ms-select" aria-label="Section to open first" value={String(values.startItem ?? "")} onChange={(e) => setModuleConfig(id, { startItem: e.target.value })}>
                    <option value="">As the module decides</option>
                    {startOpts.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                  </select>
                </Option>
              </div>
            ) : null}
            <div className="ms-label">Sections shown in the panel</div>
            <div className="ms-card">
              {items?.length ? items.map((i) => (
                <Option key={i.key} title={i.label}><Switch label={i.label} on={!hidden.includes(i.key)} onChange={(v) => setHidden(i.key, !v)} /></Option>
              )) : (
                <Option title="Panel sections" sub="The list appears when you open settings from inside the module (gear at the bottom of its panel)."><span /></Option>
              )}
            </div>
            {items?.length ? <p className="ms-hint">The section that is open right now stays visible even if hidden.</p> : null}
            {renderReset(keysOf([SIDEBAR_SECTION]))}
          </>
        );
      }
      case "elements":
        return elements ? (
          <>
            <p className="ms-hint" style={{ margin: "0 4px 8px" }}>Hidden items are only not shown — the data stays where it is and comes back as soon as you switch them on.</p>
            {renderFields([elements])}
            <div className="ms-actions">
              <button type="button" className="ms-btn" onClick={() => { setModuleConfig(id, Object.fromEntries(elements.fields.map((f) => [f.key, true]))); flash("Everything shown"); }}>Show all</button>
              <button type="button" className="ms-btn" onClick={() => { resetModuleConfigKeys(id, keysOf([elements])); done(); }}><RotateCcw size={14} /> Reset this section</button>
            </div>
          </>
        ) : null;
      case "notify":
        return (
          <>
            {renderFields([NOTIFY_SECTION])}
            {hasAttention === false ? <p className="ms-hint">This module's panel has no sections with warnings yet — reminders and alerts appear when it does.</p> : null}
            <div className={cn("ms-note", perm === "granted" ? "is-ok" : "is-warn")}>
              {perm === "unsupported" && "This browser does not support notifications."}
              {perm === "granted" && "The browser allows notifications. They arrive while the app is open in this tab."}
              {perm === "denied" && "Notifications are blocked in the browser settings. Allow them for this site (lock icon next to the address) and come back."}
              {perm === "default" && "The browser has not asked yet. Press “Allow” to enable notifications."}
            </div>
            <div className="ms-actions is-start">
              {perm === "default" ? <button type="button" className="ms-btn" onClick={async () => setPerm(await askNotificationPermission())}>Allow notifications</button> : null}
              <button type="button" className="ms-btn" disabled={perm !== "granted"} onClick={() => { if (!notifyModule(id, `${title}: test`, "This is how a notification will look", true)) flash("Could not show a notification"); }}>Send a test</button>
            </div>
            <p className="ms-hint">A notification is sent when the number of panel sections that need attention (the highlighted counters) goes up — for example a new overdue item.</p>
            {renderReset(keysOf([NOTIFY_SECTION]))}
          </>
        );
      case "export":
        return (<>{renderFields([EXPORT_SECTION])}{renderReset(keysOf([EXPORT_SECTION]))}</>);
      case "keys":
        return (
          <>
            {renderFields([KEYS_SECTION])}
            <div className="ms-label">All keys</div>
            <div className="ms-card">
              {HOTKEYS.map(([k, d]) => <Option key={k} title={k === "n" ? (newLabel ? `${newLabel}` : "Create a new record") : k === "1–9" && items?.length ? `${title} panel section by number (1–${Math.min(9, items.length)})` : d}><kbd className="ms-kbd">{k}</kbd></Option>)}
            </div>
            {renderReset(keysOf([KEYS_SECTION]))}
          </>
        );
      case "data": {
        const changed = ownersOf(id).reduce((n, o) => n + changedCount(o), 0);
        return (
          <>
            <div className="ms-label">These settings</div>
            <div className="ms-card">
              <Option title="Changed values" sub="Options that differ from the defaults"><b>{changed}</b></Option>
            </div>
            <div className="ms-label">Backup</div>
            <div className="ms-card">
              <Option title="Export settings" sub="A JSON file — can be moved to another computer"><button type="button" className="ms-btn" onClick={exportCfg}>Download</button></Option>
              <Option title="Import settings" sub={`Replaces the current settings of ${title}`}>
                <>
                  <button type="button" className="ms-btn" onClick={() => fileRef.current?.click()}>Choose file</button>
                  <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importCfg(e.target.files?.[0])} />
                </>
              </Option>
            </div>
            <div className="ms-label">Reset</div>
            <div className="ms-card">
              <Option title={`Reset settings of ${title}`} sub="View, behaviour and rules go back to the defaults. The data of the module is not touched.">
                <button type="button" className="ms-btn is-danger" onClick={() => { if (!window.confirm(`Reset the settings of ${title}?`)) return; ownersOf(id).forEach((o) => resetModuleConfig(o)); flash("Settings reset"); }}>Reset</button>
              </Option>
            </div>
          </>
        );
      }
      default: {
        const sec = rules.find((x) => `rule:${x.id}` === tab);
        if (!sec) return null;
        return (<>{renderFields([sec])}{renderReset(keysOf([sec]), sec.owner)}</>);
      }
    }
  })();

  const list = (
    <div className="ms-list-pane">
      <div className="ms-head">
        <div className="ms-head-row">
          <h1 className="ms-title">Settings · {title}</h1>
          <div className="ms-head-btns">
            {!embedded ? <button type="button" className="ms-icon-btn" onClick={toggleList} aria-label="Hide the list of sections" title="Hide the list of sections"><PanelLeftClose size={18} /></button> : null}
            <button type="button" className="ms-icon-btn" onClick={onClose} aria-label={embedded ? "Back to the module list" : "Close settings"} title={embedded ? "Back to the module list (Esc)" : "Close settings (Esc)"}><X size={18} /></button>
          </div>
        </div>
        <p className="ms-sub">Local options for this module — stored in this browser.</p>
      </div>
      <div className="ms-list">
        <div className="ms-search">
          <Search size={16} />
          <input className="ms-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search settings: ${title}`} />
        </div>
        {groups.length ? groups.map((g) => (
          <div key={g.title} className="ms-group">
            <div className="ms-label">{g.title}</div>
            <div className="ms-card">
              {g.items.map((item) => (
                <button key={item.id} type="button" className={cn("ms-row", tab === item.id && "is-active")} onClick={() => { setTab(item.id); setMobileDetail(true); }}>
                  <span className="ms-row-ico"><item.icon size={17} /></span>
                  <span className="ms-row-txt"><b>{item.label}</b><small>{item.sub}</small></span>
                  <ChevronRight size={15} className="ms-row-chev" />
                </button>
              ))}
            </div>
          </div>
        )) : <div className="ms-empty">Nothing found for “{query}”</div>}
      </div>
    </div>
  );

  return (
    <div className={cn("ms-frame", embedded && "is-embedded")}>
    <div className={cn("ms-root", embedded && "is-embedded", listHidden && !embedded && "list-hidden", mobileDetail && "is-detail")}>
      {list}
      <section className="ms-detail-pane" ref={detailRef}>
        {tab && active ? (
          <div className="ms-detail">
            <button type="button" className="ms-mback" onClick={() => setMobileDetail(false)}><ChevronLeft size={16} /> Settings · {title}</button>
            <div className="ms-detail-title">
              {ActiveIcon ? <span className="ms-row-ico is-lg"><ActiveIcon size={20} /></span> : null}
              <h2>{active.label}</h2>
              {listHidden && !embedded ? (
                <div className="ms-head-btns">
                  <button type="button" className="ms-icon-btn" onClick={toggleList} aria-label="Show the list of sections" title="Show the list of sections"><PanelLeftOpen size={18} /></button>
                  <button type="button" className="ms-icon-btn" onClick={onClose} aria-label="Close settings"><X size={18} /></button>
                </div>
              ) : null}
            </div>
            {detail}
          </div>
        ) : <div className="ms-empty">Choose a section on the left</div>}
      </section>
      {note ? <div className="ms-toast" role="status">{note}</div> : null}
    </div>
    </div>
  );
}

type ViewProps = Parameters<typeof ModuleSettingsInner>[0];

/** A settings screen must never blank the whole app: on any error it shows a short message and a reset. */
class SettingsBoundary extends Component<{ id: string; onClose: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error("Module settings failed", err, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="ms-frame is-embedded">
        <div className="ms-empty">
          <p>These settings could not be shown.</p>
          <div className="ms-actions is-start" style={{ justifyContent: "center" }}>
            <button type="button" className="ms-btn" onClick={() => { try { ownersOf(this.props.id).forEach((o) => resetModuleConfig(o)); } catch { /* ignore */ } this.setState({ failed: false }); }}>Reset and retry</button>
            <button type="button" className="ms-btn" onClick={this.props.onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }
}

export function ModuleSettingsView(props: ViewProps) {
  return <SettingsBoundary id={props.id} onClose={props.onClose}><ModuleSettingsInner {...props} /></SettingsBoundary>;
}

export const moduleSettingsDefaults = defaultsFor;
