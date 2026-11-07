import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { canAdminister, roleMatrix } from "./access";
import { MODULE_ORDER, MODULES } from "./model";
import { CURRENCIES, CALENDAR_RANGES, SETTINGS_DEFAULTS, resolveSettings, type TflSettings } from "./settings";
import { tflActions, useTflSettings } from "./useTfl";
import { useStore } from "@/lib/store";

const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#C6A15B] disabled:opacity-60";

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="brand-card p-4">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {hint && <p className="mb-3 mt-0.5 text-[13px] text-ink-secondary">{hint}</p>}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="mt-1 block">{children}</span>
      {help && <span className="mt-1 block text-xs text-muted-foreground">{help}</span>}
    </label>
  );
}

/** Film Location defaults, numbering, alert thresholds and booking rules. All of these are used by the app. */
export function TflSettingsPanel({ onSaved }: { onSaved?: (msg: string) => void }) {
  const stored = useTflSettings();
  const role = useStore().user?.role;
  const canEdit = !role || canAdminister(role);
  const [d, setD] = useState<TflSettings>(stored);
  useEffect(() => { setD(stored); }, [stored]);
  const dirty = JSON.stringify(resolveSettings(d)) !== JSON.stringify(stored);
  const set = <K extends keyof TflSettings>(k: K, v: TflSettings[K]) => setD((x) => ({ ...x, [k]: v }));
  const n = (k: keyof TflSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === "" ? "" : Number(e.target.value)) as never);
  const t = (k: keyof TflSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never);
  const save = () => { tflActions.setSettings(resolveSettings(d)); onSaved?.("Settings saved"); };
  const reset = () => { setD(SETTINGS_DEFAULTS); };
  return (
    <div className="space-y-3">
      {!canEdit && <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">Only administrators and management can change these settings.</p>}
      <Group title="Money and VAT" hint="Starting values for new quotations, invoices and productions.">
        <Row label="VAT registered"><input type="checkbox" disabled={!canEdit} checked={d.vatRegistered} onChange={(e) => set("vatRegistered", e.target.checked)} /> <span className="text-sm">Charge VAT on new quotations and invoices</span></Row>
        <Row label="VAT %" help="UK standard rate is 20."><input className={input} type="number" min={0} max={100} disabled={!canEdit || !d.vatRegistered} value={d.vatPct} onChange={n("vatPct")} /></Row>
        <Row label="Default currency"><select className={input} disabled={!canEdit} value={d.currency} onChange={(e) => set("currency", e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Row>
        <Row label="Payment terms (days)" help="Sets the due date on new invoices and the terms on new productions."><input className={input} type="number" min={0} max={365} disabled={!canEdit} value={d.paymentTermsDays} onChange={n("paymentTermsDays")} /></Row>
        <Row label="Quotation valid for (days)"><input className={input} type="number" min={1} max={365} disabled={!canEdit} value={d.quoteValidDays} onChange={n("quoteValidDays")} /></Row>
      </Group>
      <Group title="Numbering" hint="The next quotation, invoice or payment gets the highest number already used plus one.">
        <Row label="Quotation prefix" help={`Next: ${d.quotePrefix}0001 and up`}><input className={input} maxLength={12} disabled={!canEdit} value={d.quotePrefix} onChange={t("quotePrefix")} /></Row>
        <Row label="Invoice prefix" help={`Next: ${d.invoicePrefix}0001 and up`}><input className={input} maxLength={12} disabled={!canEdit} value={d.invoicePrefix} onChange={t("invoicePrefix")} /></Row>
        <Row label="Payment prefix" help={`Next: ${d.paymentPrefix}0001 and up`}><input className={input} maxLength={12} disabled={!canEdit} value={d.paymentPrefix} onChange={t("paymentPrefix")} /></Row>
      </Group>
      <Group title="Reminders and alerts" hint="These decide what the Smart views, the dashboard and the Calendar flag.">
        <Row label="Enquiry follow-up after (days)" help="New enquiries get a follow-up date this far ahead."><input className={input} type="number" min={0} max={60} disabled={!canEdit} value={d.followUpDays} onChange={n("followUpDays")} /></Row>
        <Row label="Warn before expiry (days)" help="Permits, insurance and contracts."><input className={input} type="number" min={1} max={365} disabled={!canEdit} value={d.expiryWarnDays} onChange={n("expiryWarnDays")} /></Row>
        <Row label="Shoot counts as “starting soon” (days)"><input className={input} type="number" min={1} max={180} disabled={!canEdit} value={d.bookingSoonDays} onChange={n("bookingSoonDays")} /></Row>
        <Row label="Calendar looks ahead"><select className={input} disabled={!canEdit} value={d.calendarDays} onChange={(e) => set("calendarDays", Number(e.target.value))}>{CALENDAR_RANGES.map((r) => <option key={r} value={r}>{r} days</option>)}</select></Row>
      </Group>
      <Group title="Booking rules" hint="A confirmed booking is flagged under “Missing paperwork” until these are in.">
        <Row label="Public liability insurance"><input type="checkbox" disabled={!canEdit} checked={d.requireInsurance} onChange={(e) => set("requireInsurance", e.target.checked)} /> <span className="text-sm">Required before a shoot</span></Row>
        <Row label="Risk assessment (RAMS)"><input type="checkbox" disabled={!canEdit} checked={d.requireRams} onChange={(e) => set("requireRams", e.target.checked)} /> <span className="text-sm">Required before a shoot</span></Row>
        <Row label="Minimum public liability cover (GBP)" help="Certificates below this are flagged. 0 turns the check off."><input className={input} type="number" min={0} disabled={!canEdit} value={d.minCover} onChange={n("minCover")} /></Row>
      </Group>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty} onClick={save}>Save settings</Button>
          <Button variant="outline" onClick={reset}>Restore defaults</Button>
          {dirty && <span className="self-center text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Settings are stored with your records, so they sync to the server and are included in backups.</p>
    </div>
  );
}

/** The real role table from the access rules: what each role can do in every module. */
export function RoleMatrix() {
  const rows = roleMatrix(MODULE_ORDER);
  const mark = { edit: "Edit", view: "View", none: "–" } as const;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 font-mono uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2">Module</th>{rows.map((r) => <th key={r.role} className="px-2 py-2">{r.label}</th>)}</tr>
          </thead>
          <tbody>
            {MODULE_ORDER.map((k) => (
              <tr key={k} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{MODULES[k].title}</td>
                {rows.map((r) => <td key={r.role} className={"px-2 py-2 " + (r.cells[k] === "edit" ? "" : "text-muted-foreground")}>{mark[r.cells[k]]}</td>)}
              </tr>
            ))}
            <tr className="border-t border-border"><td className="px-3 py-2 font-medium">Settings, users, backups</td>{rows.map((r) => <td key={r.role} className={"px-2 py-2 " + (canAdminister(r.role) ? "" : "text-muted-foreground")}>{canAdminister(r.role) ? "Edit" : "–"}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-ink-tertiary">This table is generated from the same rules the menu, the screens and the server use. Roles come from each person's sign-in account (<code>TFL_USERS</code>); to change a role, edit that account in Vercel and redeploy.</p>
    </div>
  );
}
