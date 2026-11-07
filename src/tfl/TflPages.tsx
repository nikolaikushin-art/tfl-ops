import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X, AlertTriangle, Download, ArrowLeft, Pencil, Printer, Paperclip, Upload, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODULES, MODULE_ORDER, type FieldDef, type TflKey, type TflRecord } from "./model";
import { addFile, getFileBlob, removeFile, removeOwnerFiles, useFiles } from "./files";
import { formatSize, ownerKey } from "@/lib/attachments";
import { csvTemplate, mapRows, parseCsv, toCsv, type ImportResult } from "@/lib/tflCsv";
import { compareCells, balanceOf, currencyTile, formatMoney, formatUkDate, grossOf, isHttpUrl, newRecordDefaults, sumByCurrency, toHttpUrl, validateRecord, vatOf } from "@/lib/tflRecords";
import { useStore } from "@/lib/store";
import { useSideExtra } from "@/lib/sideExtra";
import { canEditTfl } from "./access";
import { bookingClashes, readTflSettings, refLabel, relatedTo, textOf, tflActions, tflNav, useTfl, useTflFocus, useTflSettings } from "./useTfl";
import { attentionList, viewCounts, viewsFor } from "./views";
import { todayIso } from "./settings";
type Data = ReturnType<typeof useTfl>;

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#C6A15B]";
type OrgInfo = { legalName?: string; tradingName?: string; addressLine1?: string; city?: string; postcode?: string; vatNumber?: string; registrationNumber?: string; phone?: string; email?: string; website?: string };

function printDoc(kind: string, rec: Record<string, string | number>, k: TflKey, data: Data, org: OrgInfo = {}) {
  const w = window.open("", "_blank");
  if (!w) return;
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const cc = String(rec.currency || "GBP");
  const fm = (n: number) => esc(formatMoney(n, cc));
  const skip = new Set(["id", "ref", "amount", "vatPct", "paid", "currency", "description", "status", "terms"]);
  const rows = MODULES[k].fields.filter((f) => !skip.has(f.key) && rec[f.key] !== undefined && rec[f.key] !== "")
    .map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(f.ref ? refLabel(data, f.ref, rec[f.key]) : f.type === "date" ? formatUkDate(rec[f.key]) : MONEY_KEYS.has(f.key) ? formatMoney(rec[f.key], cc) : f.key === "vatPct" ? `${rec[f.key]}%` : rec[f.key])}</td></tr>`).join("");
  const from = [org.legalName || org.tradingName, [org.addressLine1, org.city, org.postcode].filter(Boolean).join(", "), org.vatNumber && `VAT no. ${org.vatNumber}`, org.registrationNumber && `Company no. ${org.registrationNumber}`, [org.phone, org.email, org.website].filter(Boolean).join(" · ")]
    .filter(Boolean).map((l) => esc(l)).join("<br/>");
  const amount = Number(rec.amount || 0), paid = Number(rec.paid || 0), vat = vatOf(rec), gross = grossOf(rec);
  const totals = (vat > 0 ? `<div class="tot"><span>Subtotal</span><b>${fm(amount)}</b></div><div class="tot"><span>VAT ${esc(rec.vatPct)}%</span><b>${fm(vat)}</b></div>` : "") +
    `<div class="tot"><span>Total${vat > 0 ? " incl. VAT" : ""}</span><b>${fm(gross)}</b></div>` +
    (kind === "invoice" ? `<div class="tot"><span>Paid</span><b>${fm(paid)}</b></div><div class="tot due"><span>Balance due</span><b>${fm(balanceOf(rec))}</b></div>` : "") +
    (rec.terms ? `<h3>Terms &amp; conditions</h3><div class="scope">${esc(rec.terms)}</div>` : "");
  w.document.write(`<html><head><title>${esc(kind)} ${esc(rec.ref)}</title><style>
  body{font-family:Archivo,Arial,sans-serif;padding:48px;color:#0B0B0C;max-width:760px;margin:auto}
  header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #C6A15B;padding-bottom:14px}
  header img{height:54px}h1{font-family:'Bodoni Moda',Georgia,serif;font-size:30px;margin:0;text-transform:capitalize}
  .ref{font-family:'IBM Plex Mono',monospace;color:#5C1A24;margin:14px 0 6px}
  table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:7px 4px;border-bottom:1px solid #ddd}td:first-child{text-transform:capitalize;color:#666;width:35%}
  .scope{white-space:pre-wrap;background:#F3F0E9;padding:14px;border-radius:6px}
  .tot{display:flex;justify-content:space-between;padding:8px 4px;font-size:16px}.due{border-top:2px solid #0B0B0C;font-size:19px;color:#5C1A24}
  .from{margin-top:10px;font-size:12px;color:#444;line-height:1.5}
  footer{margin-top:40px;font-size:11px;color:#777;border-top:1px solid #ddd;padding-top:10px}
  </style></head><body><header><h1>${esc(kind)}</h1><img src="${location.origin}/tfl-logo-original.png" alt="The Film Location"/></header>
  ${from ? `<div class="from">${from}</div>` : ""}
  <div class="ref">${esc(rec.ref)} · ${esc(rec.status)}${rec.issued ? ` · ${esc(formatUkDate(rec.issued))}` : ""}</div>
  ${rec.description ? `<div class="scope">${esc(rec.description)}</div>` : ""}
  <table>${rows}</table>${totals}<footer>The Film Location</footer></body></html>`);
  w.document.close(); setTimeout(() => w.print(), 400);
}

function BookingsCalendar({ bookings }: { bookings: TflRecord[] }) {
  const all = useTfl();
  const [m, setM] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const lead = (m.getDay() + 6) % 7;
  const iso = (d: number) => `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const clash = bookingClashes(bookings);
  const on = (d: number) => bookings.filter((b) => b.status !== "Cancelled" && String(b.startDate) <= iso(d) && String(b.endDate) >= iso(d));
  return (
    <div className="mb-5 rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</Button>
        <div className="font-heading text-lg">{m.toLocaleString("en-GB", { month: "long", year: "numeric" })}</div>
        <Button variant="outline" size="sm" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</Button>
      </div>
      <div className="grid grid-cols-7 gap-px text-[11px]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => <div key={x} className="p-1 font-mono uppercase text-muted-foreground">{x}</div>)}
        {Array.from({ length: lead }).map((_, i) => <div key={"e" + i} />)}
        {Array.from({ length: days }).map((_, i) => (
          <div key={i} className="min-h-[64px] rounded border border-border p-1">
            <div className="text-muted-foreground">{i + 1}</div>
            {on(i + 1).slice(0, 3).map((b) => (
              <div key={b.id} title={`${refLabel(all, "locations", b.location)} · ${refLabel(all, "productions", b.production)}`} onClick={() => tflNav.open("bookings", b.id)} className={"cursor-pointer truncate rounded px-1 " + (clash.has(b.id) ? "bg-[#5C1A24] text-white" : "bg-[#C6A15B]/25")}>{refLabel(all, "locations", b.location)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const money = (n: number, c = "GBP") => formatMoney(n, c);

const MONEY_KEYS = new Set(["amount", "paid", "agreed", "budget", "dayRate", "halfDayRate", "prepRate", "deposit", "fee", "value"]);

function Field({ f, value, onChange }: { f: FieldDef; value: string | number; onChange: (v: string | number) => void }) {
  const data = useTfl();
  const v = value ?? "";
  if (f.type === "textarea") return <textarea className={inputCls} rows={3} value={v} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === "select") return (
    <select className={inputCls} value={v} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>{f.options!.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
  if (f.ref) {
    const tk = MODULES[f.ref].titleKey;
    return (
      <select className={inputCls} value={v} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>{data[f.ref].map((r) => <option key={r.id} value={r.id}>{String(r[tk])}</option>)}
      </select>
    );
  }
  const htmlType = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text";
  return <input className={inputCls} type={htmlType} min={f.type === "number" ? 0 : undefined} step={f.type === "number" ? "any" : undefined}
    inputMode={f.type === "url" ? "url" : undefined} value={v}
    onChange={(e) => onChange(f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />;
}

function Editor({ k, rec, onClose }: { k: TflKey; rec: TflRecord | null; onClose: () => void }) {
  const m = MODULES[k];
  const all = useTfl();
  const { organisation } = useStore();
  const [form, setForm] = useState<Record<string, string | number>>(rec ?? newRecordDefaults(k, { settings: readTflSettings(), data: all }));
  const [tried, setTried] = useState(false);
  const errors = validateRecord(k, form);
  const hasErrors = Object.keys(errors).length > 0;
  const save = () => {
    if (hasErrors) { setTried(true); return; }
    tflActions.save(k, { ...form, id: rec?.id });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-xl">{rec ? "Edit" : "New"} {m.singular}</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          {m.fields.map((f) => (
            <div key={f.key}>
              {f.section && <div className="mb-2 mt-5 border-b border-border pb-1 font-mono text-[11px] uppercase tracking-wider text-[#C6A15B] first:mt-0">{f.section}</div>}
              <label className="block text-xs uppercase tracking-wider text-muted-foreground">
                {f.label}{f.required && " *"}
                <div className="mt-1 normal-case tracking-normal text-foreground">
                  <Field f={f} value={form[f.key]} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} />
                </div>
              </label>
              {f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}
              {errors[f.key] && (tried || form[f.key] !== undefined) && <p className="mt-1 text-xs text-red-500">{errors[f.key]}</p>}
            </div>
          ))}
          {(k === "quotes" || k === "invoices") && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between"><span>VAT</span><b>{formatMoney(vatOf(form), String(form.currency || "GBP"))}</b></div>
              <div className="flex justify-between"><span>Total incl. VAT</span><b>{formatMoney(grossOf(form), String(form.currency || "GBP"))}</b></div>
              {k === "invoices" && <div className="flex justify-between"><span>Balance due</span><b>{formatMoney(balanceOf(form), String(form.currency || "GBP"))}</b></div>}
            </div>
          )}
        </div>
        {tried && hasErrors && <p className="mt-4 text-sm text-red-500">Fix the highlighted fields to save.</p>}
        <div className="mt-5 flex gap-2">
          <Button onClick={save}>Save</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {rec && (k === "quotes" || k === "invoices") && <Button variant="outline" onClick={() => printDoc(m.singular, form, k, all, organisation)}>Print / PDF</Button>}
        </div>
      </div>
    </div>
  );
}

function RecLink({ k, id, data }: { k: TflKey; id: unknown; data: Data }) {
  const label = refLabel(data, k, id);
  if (!label) return <span className="text-muted-foreground">—</span>;
  const exists = data[k].some((r) => r.id === id);
  if (!exists) return <span>{label}</span>;
  return (
    <button className="text-left text-[#C6A15B] underline-offset-2 hover:underline"
      onClick={(e) => { e.stopPropagation(); tflNav.open(k, String(id)); }}>{label}</button>
  );
}

function Attachments({ k, id }: { k: TflKey; id: string }) {
  const owner = ownerKey(k, id);
  const { files, error, setError, refresh } = useFiles(owner);
  const [busy, setBusy] = useState(false);
  const pick = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setBusy(true); setError("");
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      try { await addFile(owner, f); } catch (e) { problems.push((e as Error).message); }
    }
    setBusy(false);
    if (problems.length) setError(problems.join(" "));
    refresh();
  };
  const open = async (fid: string, name: string, download: boolean) => {
    const blob = await getFileBlob(fid);
    if (!blob) { setError("That file is no longer stored in this browser."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    if (download) a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return (
    <div>
      <div className="mb-2 mt-8 flex items-center justify-between gap-3">
        <h2 className="font-heading text-xl">Attachments</h2>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
          <Paperclip className="mr-1 h-4 w-4" />{busy ? "Adding…" : "Attach files"}
          <input type="file" multiple className="hidden" disabled={busy}
            onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {files.length === 0 && !error && <p className="text-sm text-muted-foreground">No files yet. Photos, PDFs, permits and signed contracts up to 10 MB each.</p>}
      {files.length > 0 && (
        <div className="rounded-lg border border-border">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-sm first:border-0">
              <button className="min-w-0 truncate text-left text-[#C6A15B] hover:underline" onClick={() => void open(f.id, f.name, false)}>{f.name}</button>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <span>{formatSize(f.size)} · {f.added.slice(0, 10)}</span>
                <button title="Download" onClick={() => void open(f.id, f.name, true)}><Download className="h-4 w-4" /></button>
                <button title="Remove" onClick={() => { if (confirm(`Remove ${f.name}?`)) void removeFile(f.id); }}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Files stay in this browser only: they are not in the server sync or the JSON backup yet.</p>
    </div>
  );
}

function RecordDetail({ k, id }: { k: TflKey; id: string }) {
  const m = MODULES[k];
  const data = useTfl();
  const { organisation, user } = useStore();
  const role = user?.role;
  const rec = data[k].find((r) => r.id === id);
  const [editing, setEditing] = useState(false);
  if (!rec) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={tflNav.close}><ArrowLeft className="mr-1 h-4 w-4" />Back to {m.title.toLowerCase()}</Button>
        <p className="mt-6 text-sm text-muted-foreground">This {m.singular} no longer exists.</p>
      </div>
    );
  }
  const related = relatedTo(data, k, id);
  const linked = related.reduce((n, g) => n + g.recs.length, 0);
  const cur = String(rec.currency || "GBP");
  const status = m.statusKey ? String(rec[m.statusKey] ?? "") : "";
  const show = (f: FieldDef) => {
    const v = rec[f.key];
    if (v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
    if (f.ref) return <RecLink k={f.ref} id={v} data={data} />;
    if (f.type === "email") return <a className="text-[#C6A15B] hover:underline" href={`mailto:${String(v)}`}>{String(v)}</a>;
    if (f.type === "tel") return <a className="text-[#C6A15B] hover:underline" href={`tel:${String(v).replace(/[^\d+]/g, "")}`}>{String(v)}</a>;
    if (f.type === "url") return isHttpUrl(String(v))
      ? <a className="break-all text-[#C6A15B] hover:underline" href={toHttpUrl(String(v))} target="_blank" rel="noopener noreferrer">{String(v)}</a>
      : <span>{String(v)}</span>;
    if (f.key === "vatPct") return <>{String(v)}%</>;
    if (f.type === "date") return <>{formatUkDate(v)}</>;
    if (f.type === "number" && (f.key === m.money || MONEY_KEYS.has(f.key))) return <>{money(v as number, cur)}</>;
    return <span className="whitespace-pre-wrap">{String(v)}</span>;
  };
  const isDoc = k === "quotes" || k === "invoices";
  const balance = k === "invoices" ? balanceOf(rec as Record<string, string | number>) : null;
  return (
    <div>
      <Button variant="outline" size="sm" onClick={tflNav.close}><ArrowLeft className="mr-1 h-4 w-4" />Back to {m.title.toLowerCase()}</Button>
      <div className="mb-5 mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{m.singular}</div>
          <h1 className="font-heading text-3xl">{String(rec[m.titleKey] ?? "Untitled")}</h1>
          {status && <span className="mt-2 inline-block rounded-full border border-[#C6A15B] px-2.5 py-0.5 text-xs text-[#C6A15B]">{status}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditTfl(role, k) && <Button onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" />Edit</Button>}
          {isDoc && <Button variant="outline" onClick={() => printDoc(m.singular, rec, k, data, organisation)}><Printer className="mr-1 h-4 w-4" />Print / PDF</Button>}
          {canEditTfl(role, k) && <Button variant="outline" onClick={() => {
            const note = linked ? ` ${linked} linked record${linked === 1 ? "" : "s"} will lose their link to it.` : "";
            if (confirm(`Delete this ${m.singular}?${note}`)) { void removeOwnerFiles(ownerKey(k, id)); tflActions.remove(k, id); tflNav.close(); }
          }}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>}
        </div>
      </div>
      {balance !== null && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Tile label="Invoiced (incl. VAT)" value={money(grossOf(rec as Record<string, string | number>), cur)} />
          <Tile label="Paid" value={money(Number(rec.paid || 0), cur)} />
          <Tile label="Balance due" value={money(balance, cur)} />
        </div>
      )}
      <div className="rounded-lg border border-border bg-card">
        {m.fields.filter((f) => f.key !== m.statusKey && f.key !== m.titleKey).map((f) => (
          <div key={f.key}>
            {f.section && <div className="border-t border-border bg-muted/40 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground first:border-0">{f.section}</div>}
            <div className="grid grid-cols-3 gap-3 border-t border-border px-4 py-2.5 text-sm first:border-0">
              <div className="text-muted-foreground">{f.label}</div>
              <div className="col-span-2">{show(f)}</div>
            </div>
          </div>
        ))}
      </div>
      <h2 className="mb-2 mt-8 font-heading text-xl">Linked records</h2>
      {related.length === 0 && <p className="text-sm text-muted-foreground">Nothing links to this {m.singular} yet.</p>}
      <div className="space-y-3">
        {related.map((g) => (
          <div key={g.mod + g.field} className="rounded-lg border border-border">
            <div className="bg-muted/40 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{MODULES[g.mod].title} · as {g.label.toLowerCase()}</div>
            {g.recs.map((r) => (
              <button key={r.id} className="flex w-full justify-between border-t border-border px-4 py-2.5 text-left text-sm hover:bg-muted/30" onClick={() => tflNav.open(g.mod, r.id)}>
                <span>{String(r[MODULES[g.mod].titleKey] ?? "")}</span>
                <span className="text-xs text-muted-foreground">{MODULES[g.mod].statusKey ? String(r[MODULES[g.mod].statusKey!] ?? "") : ""}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <Attachments k={k} id={id} />
      {editing && <Editor k={k} rec={rec} onClose={() => setEditing(false)} />}
    </div>
  );
}

function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function ImportDialog({ k, onClose }: { k: TflKey; onClose: () => void }) {
  const m = MODULES[k];
  const data = useTfl();
  const [res, setRes] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [done, setDone] = useState(0);
  const resolve = (mod: TflKey, name: string) => {
    const tk = MODULES[mod].titleKey;
    const n = name.trim().toLowerCase();
    return data[mod].find((r) => r.id === name || String(r[tk]).trim().toLowerCase() === n)?.id ?? null;
  };
  const read = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name); setDone(0);
    const rows = parseCsv(await f.text());
    setRes(mapRows(k, rows, resolve, data[k].map((r) => String(r[m.titleKey] ?? ""))));
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-xl">Import {m.title.toLowerCase()} from CSV</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          First row = column names (the same names as the fields; any order). Links are matched by name. Dates as DD/MM/YYYY or YYYY-MM-DD.
          Rows that already exist or have errors are skipped and listed below.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
            <Upload className="mr-1 h-4 w-4" />Choose CSV file
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <Button variant="outline" size="sm" onClick={() => download(`tfl-${k}-template.csv`, csvTemplate(k))}><Download className="mr-1 h-4 w-4" />Template</Button>
        </div>
        {fileName && <p className="mb-2 text-xs text-muted-foreground">{fileName}</p>}
        {res?.fatal && <p className="text-sm text-red-500">{res.fatal}</p>}
        {res && !res.fatal && (
          <div className="space-y-3 text-sm">
            <p><b>{res.records.length}</b> ready to import · <b>{res.skipped.length}</b> skipped{res.warnings.length ? ` · ${res.warnings.length} warnings` : ""}</p>
            {res.unknownColumns.length > 0 && <p className="text-muted-foreground">Ignored columns: {res.unknownColumns.join(", ")}</p>}
            {res.skipped.length > 0 && (
              <div className="rounded-md border border-border">
                <div className="bg-muted/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Skipped rows</div>
                {res.skipped.slice(0, 30).map((s) => <div key={s.line} className="border-t border-border px-3 py-1.5 text-xs">Row {s.line}: {s.reason}</div>)}
                {res.skipped.length > 30 && <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">…and {res.skipped.length - 30} more.</div>}
              </div>
            )}
            {res.warnings.length > 0 && (
              <div className="rounded-md border border-border">
                <div className="bg-muted/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Warnings</div>
                {res.warnings.slice(0, 15).map((w, i) => <div key={i} className="border-t border-border px-3 py-1.5 text-xs">Row {w.line}: {w.message}</div>)}
              </div>
            )}
            {done > 0 ? <p className="text-[#C6A15B]">Imported {done} {done === 1 ? m.singular : m.title.toLowerCase()}.</p> : (
              <Button disabled={res.records.length === 0} onClick={() => setDone(tflActions.importMany(k, res.records))}>Import {res.records.length} {res.records.length === 1 ? "row" : "rows"}</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Modules worth jumping to from each module's second sidebar. */
const RELATED: Partial<Record<TflKey, TflKey[]>> = {
  locations: ["assessments", "owners", "bookings", "shortlists"],
  assessments: ["locations", "scouting", "permits"],
  shortlists: ["enquiries", "locations", "productions"],
  owners: ["locations", "contracts", "payments"],
  productions: ["enquiries", "bookings", "insurance"],
  enquiries: ["productions", "shortlists", "scouting", "quotes"],
  scouting: ["locations", "assessments", "enquiries"],
  bookings: ["locations", "contracts", "insurance", "payments"],
  quotes: ["enquiries", "invoices", "productions"],
  invoices: ["payments", "quotes", "bookings"],
  payments: ["invoices", "bookings", "owners"],
  contracts: ["bookings", "owners", "permits"],
  permits: ["bookings", "insurance", "assessments"],
  insurance: ["bookings", "productions", "permits"],
};

export function TflModulePage({ k }: { k: TflKey }) {
  const m = MODULES[k];
  const data = useTfl();
  const focus = useTflFocus();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState("");
  const settings = useTflSettings();
  const [edit, setEdit] = useState<TflRecord | null | "new">(null);
  const [importing, setImporting] = useState(false);
  const canEdit = canEditTfl(useStore().user?.role, k);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  // Leaving a module closes its open record, unless the link just opened a record elsewhere.
  useEffect(() => () => { if (tflNav.current()?.k === k) tflNav.close(); }, [k]);
  const clashes = useMemo(() => (k === "bookings" ? bookingClashes(data.bookings) : new Set<string>()), [k, data.bookings]);
  // Second sidebar: new record, stage filters with counts, and the neighbouring modules.
  const sideStatusField = m.fields.find((f) => f.key === m.statusKey);
  const vctx = useMemo(() => ({ today: todayIso(), s: settings }), [settings]);
  const smart = viewsFor(k);
  const smartCounts = useMemo(() => viewCounts(k, data[k], vctx), [k, data, vctx]);
  useSideExtra({
    primary: canEdit ? { label: `New ${m.singular}`, onClick: () => { tflNav.close(); setEdit("new"); } } : undefined,
    active: [`status:${status || "all"}`, ...(view ? [`view:${view}`] : [])],
    sections: [
      {
        id: "smart", label: "Smart views",
        items: smart.map((v) => ({ key: `view:${v.key}`, label: v.label, count: smartCounts[v.key] || undefined, warn: v.warn })),
      },
      {
        id: "stages", label: sideStatusField?.label ?? "Show",
        items: [
          { key: "status:all", label: `All ${m.title.toLowerCase()}`, count: data[k].length },
          ...(sideStatusField?.options ?? []).map((o) => ({ key: `status:${o}`, label: o, count: data[k].filter((r) => r[m.statusKey!] === o).length })),
        ],
      },
      {
        id: "related", label: "Related", collapsible: true,
        items: (RELATED[k] ?? []).map((rk) => ({ key: `go:${rk}`, label: MODULES[rk].title })),
      },
    ],
    onPick: (key) => {
      if (key.startsWith("status:")) { tflNav.close(); setStatus(key === "status:all" ? "" : key.slice(7)); if (key === "status:all") setView(""); }
      else if (key.startsWith("view:")) { tflNav.close(); setView((cur) => (cur === key.slice(5) ? "" : key.slice(5))); }
      else if (key.startsWith("go:")) window.dispatchEvent(new CustomEvent("tfl:navigate", { detail: `tfl-${key.slice(3)}` }));
    },
  });
  if (focus && focus.k === k) return <RecordDetail key={focus.id} k={k} id={focus.id} />;
  const cols = m.fields.filter((f) => f.list);
  const statusField = m.fields.find((f) => f.key === m.statusKey);
  const activeView = smart.find((v) => v.key === view);
  const filtered = data[k].filter((r) =>
    (!status || r[m.statusKey!] === status) &&
    (!activeView || activeView.test(r, vctx)) &&
    (!q || textOf(data, k, r).toLowerCase().includes(q.toLowerCase())));
  const sortField = sort ? m.fields.find((f) => f.key === sort.key) : undefined;
  const rows = sort && sortField
    ? [...filtered].sort((a, b) => sortField.ref
        ? compareCells(refLabel(data, sortField.ref, a[sort.key]), refLabel(data, sortField.ref, b[sort.key]), false, sort.dir)
        : compareCells(a[sort.key], b[sort.key], sortField.type === "number", sort.dir))
    : filtered;
  const clickSort = (key: string) => setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl">{m.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{m.blurb}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="outline" onClick={() => setImporting(true)}><Upload className="mr-1 h-4 w-4" />Import CSV</Button>}
          <Button variant="outline" disabled={rows.length === 0} onClick={() => download(`tfl-${k}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(k, rows, (mod, id) => refLabel(data, mod, id)))}><Download className="mr-1 h-4 w-4" />Export CSV</Button>
          {canEdit && <Button onClick={() => setEdit("new")}><Plus className="mr-1 h-4 w-4" />New {m.singular}</Button>}
        </div>
      </div>
      {k === "bookings" && <BookingsCalendar bookings={data.bookings} />}
      <div className="mb-3 flex flex-wrap gap-2">
        <input className={inputCls + " max-w-xs"} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        {statusField?.options && (
          <select className={inputCls + " max-w-[180px]"} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All {statusField.label.toLowerCase()}</option>
            {statusField.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        )}
      </div>
      {activeView && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span>Showing: <strong>{activeView.label}</strong> · {rows.length} {rows.length === 1 ? "record" : "records"}</span>
          <button className="text-xs underline" onClick={() => setView("")}>Clear</button>
        </div>
      )}
      {clashes.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-[#5C1A24] bg-[#5C1A24]/20 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-[#C6A15B]" /> {clashes.size} bookings overlap on the same location (marked ⚠).
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>{cols.map((c) => (
              <th key={c.key} className="px-3 py-2" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                <button className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground" onClick={() => clickSort(c.key)}>
                  {c.label}{sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </button>
              </th>
            ))}<th className="w-20" /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={cols.length + 1} className="px-3 py-10 text-center text-muted-foreground">No {m.title.toLowerCase()} yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => tflNav.open(k, r.id)}>
                {cols.map((c, i) => (
                  <td key={c.key} className="px-3 py-2">
                    {i === 0 && clashes.has(r.id) && <span title="Overlapping booking">⚠ </span>}
                    {c.ref ? <RecLink k={c.ref} id={r[c.key]} data={data} />
                      : c.key === m.money || MONEY_KEYS.has(c.key) ? money(r[c.key] as number, String(r.currency || "GBP")) : c.type === "date" ? formatUkDate(r[c.key]) : String(r[c.key] ?? "")}
                  </td>
                ))}
                <td className="whitespace-nowrap px-2">
                  <button aria-label="Edit" className="mr-2" onClick={(e) => { e.stopPropagation(); setEdit(r); }}>
                    <Pencil className="h-4 w-4 text-muted-foreground hover:text-[#C6A15B]" />
                  </button>
                  {canEdit && <button aria-label="Delete" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete this ${m.singular}?`)) tflActions.remove(k, r.id); }}>
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-[#C6A15B]" />
                  </button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <Editor k={k} rec={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {importing && <ImportDialog k={k} onClose={() => setImporting(false)} />}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-3xl text-[#C6A15B]">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function AttentionPanel() {
  const d = useTfl();
  const s = useTflSettings();
  const items = attentionList(d, { today: todayIso(), s });
  return (
    <div className="mt-6">
      <h2 className="mb-2 font-heading text-xl">Needs attention</h2>
      <div className="divide-y divide-border rounded-lg border border-border">
        {items.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nothing is overdue, expiring or missing. Well done.</div>}
        {items.slice(0, 12).map((a) => (
          <button key={`${a.k}:${a.view.key}`} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/30"
            onClick={() => window.dispatchEvent(new CustomEvent("tfl:navigate", { detail: `tfl-${a.k}` }))}>
            <span><span className="text-muted-foreground">{MODULES[a.k].title} · </span>{a.view.label}</span>
            <span className="rounded-full bg-[#5C1A24]/30 px-2 py-0.5 font-mono text-xs">{a.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TflDashboard(_props: { onNavigate?: (s: string) => void }) {
  const d = useTfl();
  const today = new Date().toISOString().slice(0, 10);
  const open = d.enquiries.filter((e) => !["Won", "Lost"].includes(String(e.status))).length;
  const upcoming = d.bookings.filter((b) => b.status !== "Cancelled" && String(b.endDate) >= today).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  const outstanding = currencyTile(sumByCurrency(d.invoices.filter((i) => i.status !== "Paid"), (i) => balanceOf(i)));
  const overdue = d.invoices.filter((i) => i.status !== "Paid" && i.due && String(i.due) < today).length;
  const quoted = currencyTile(sumByCurrency(d.quotes.filter((q) => q.status === "Sent"), (q) => grossOf(q)));
  const clashes = bookingClashes(d.bookings).size;
  const soon = (r: TflRecord) => r.expires && String(r.expires) >= today && String(r.expires) <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const expiring = [...d.permits, ...d.contracts].filter(soon).length;
  return (
    <div>
      <h1 className="font-heading text-3xl">Dashboard</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">The Film Location — what needs attention today.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Open enquiries" value={open} />
        <Tile label="Locations" value={d.locations.length} sub={`${d.locations.filter((l) => l.status === "Available").length} available`} />
        <Tile label="Quotes out (incl. VAT)" value={quoted.value} sub={quoted.sub} />
        <Tile label="Outstanding" value={outstanding.value} sub={[`${overdue} overdue`, outstanding.sub].filter(Boolean).join(" · ")} />
        <Tile label="Upcoming bookings" value={upcoming.length} />
        <Tile label="Booking clashes" value={clashes} />
        <Tile label="Expiring in 30 days" value={expiring} sub="permits + contracts" />
        <Tile label="Productions" value={d.productions.length} />
      </div>
      <AttentionPanel />
      <h2 className="mb-2 mt-8 font-heading text-xl">Next on the calendar</h2>
      <div className="divide-y divide-border rounded-lg border border-border">
        {upcoming.length === 0 && <div className="p-4 text-sm text-muted-foreground">No upcoming bookings.</div>}
        {upcoming.slice(0, 6).map((b) => (
          <button key={b.id} className="flex w-full justify-between px-4 py-3 text-left text-sm hover:bg-muted/30" onClick={() => tflNav.open("bookings", b.id)}>
            <span>{refLabel(d, "locations", b.location)} <span className="text-muted-foreground">· {refLabel(d, "productions", b.production)}</span></span>
            <span className="font-mono text-xs">{formatUkDate(b.startDate)} → {formatUkDate(b.endDate)} · {String(b.status)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TflReports() {
  const d = useTfl();
  const hasSamples = MODULE_ORDER.some((k) => d[k].some((r) => /\(sample\)/i.test(textOf(d, k, r))));
  const count = (list: TflRecord[], key: string) => list.reduce<Record<string, number>>((a, r) => ((a[String(r[key])] = (a[String(r[key])] || 0) + 1), a), {});
  const blocks: [string, Record<string, number>][] = [
    ["Enquiries by status", count(d.enquiries, "status")],
    ["Bookings by status", count(d.bookings, "status")],
    ["Quotations by status", count(d.quotes, "status")],
    ["Invoices by status", count(d.invoices, "status")],
    ["Locations by type", count(d.locations, "type")],
  ];
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([tflActions.exportJson()], { type: "application/json" }));
    a.download = "tfl-data.json"; a.click();
  };
  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <h1 className="font-heading text-3xl">Reports</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={download}><Download className="mr-1 h-4 w-4" />Export data</Button>
          {hasSamples && <Button variant="outline" onClick={() => { if (confirm("Remove the leftover sample records?")) tflActions.clearSamples(); }}>Remove sample records</Button>}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {blocks.map(([t, c]) => (
          <div key={t} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{t}</div>
            {Object.keys(c).length === 0 && <div className="text-sm text-muted-foreground">No data</div>}
            {Object.entries(c).map(([k, n]) => (
              <div key={k} className="flex justify-between border-t border-border py-1 text-sm first:border-0"><span>{k || "—"}</span><span className="font-mono">{n}</span></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
