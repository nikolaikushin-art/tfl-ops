/**
 * Settings > Historical data (v26): templates, bulk upload, a review queue and
 * duplicate checking across sources. Nothing reaches the live records until a
 * row is approved. Order: contacts -> offers -> past deals.
 */
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { parseCsv, type Cell, type OfferDraft } from "@/lib/offerImport";
import { fileKind } from "@/lib/readFile";
import {
  KIND_LABEL, KIND_ORDER, TEMPLATES, dealBlockers, findByName, itemsFromRows, markDuplicates, queueSummary,
  templateCsv, toDealFields, toOfferFields, toPartyInput, type ImportKind, type ReviewItem,
} from "@/lib/historicalImport";
import { blankDeal } from "@/lib/deals";
import { useImportQueue } from "@/lib/useImportQueue";

const btn = "brand-focus h-9 rounded-full border border-divider px-3 text-[13px] font-medium text-ink-secondary hover:bg-elevated hover:text-ink disabled:opacity-40";
const primary = "brand-focus h-9 rounded-full bg-accent-fill px-4 text-[13px] font-semibold text-white disabled:opacity-40";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function readRows(file: File): Promise<Cell[][]> {
  if (fileKind(file.name) === "excel") {
    const { default: readXlsx } = await import("read-excel-file/browser");
    const sheets = await readXlsx(file);
    return (sheets[0]?.data ?? []) as Cell[][];
  }
  return parseCsv(await file.text());
}

export function HistoricalImport() {
  const store = useStore();
  const { items, save } = useImportQueue();
  const [kind, setKind] = useState<ImportKind>("contacts");
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");

  const known = useMemo(
    () => ({
      companies: [
        ...store.customers.map((c) => ({ name: c.name, country: c.country, email: c.email })),
        ...store.suppliers.map((c) => ({ name: c.name, country: c.country, email: c.email })),
      ],
      offers: store.pricingRecords.map((o) => ({ supplierName: o.supplierName, productName: o.productName, unitPrice: o.unitPrice, currency: o.currency })),
      dealRefs: store.deals.map((d) => d.ref),
    }),
    [store.customers, store.suppliers, store.pricingRecords, store.deals],
  );

  const checked = useMemo(() => markDuplicates(items, known), [items, known]);
  const summary = queueSummary(checked);
  const shown = checked.filter((i) => i.status === filter && i.kind === kind);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const rows = await readRows(file);
      const batchId = `h${Date.now()}`;
      const r = itemsFromRows(kind, rows, { source: "spreadsheet", sourceName: file.name, batchId, nowIso: new Date().toISOString() });
      if (r.missingColumns.length) return setMsg(`Not loaded. This file has no column for: ${r.missingColumns.join(", ")}. Download the template to see the layout.`);
      save([...items, ...r.items]);
      setMsg(`${r.items.length} rows from ${file.name} added to the review queue. Nothing is live until you approve it.`);
    } catch (e) {
      setMsg(`Could not read this file: ${(e as Error).message}`);
    }
  };

  const setStatus = (ids: string[], status: ReviewItem["status"]) => save(items.map((i) => (ids.includes(i.id) ? { ...i, status } : i)));
  const edit = (id: string, key: string, value: string) => {
    // Editing re-validates by rebuilding the row through the same reader.
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const header = TEMPLATES[it.kind].map((c) => c.key);
    const data = { ...it.data, [key]: value };
    const rebuilt = itemsFromRows(it.kind, [TEMPLATES[it.kind].map((c) => c.header), header.map((k) => data[k] ?? "")], {
      source: it.source, sourceName: it.sourceName, batchId: it.batchId, nowIso: it.createdAt,
    }).items[0];
    if (rebuilt) save(items.map((i) => (i.id === id ? { ...i, data, errors: rebuilt.errors, warnings: rebuilt.warnings } : i)));
  };

  const lookupFor = (d: Record<string, string>) => ({
    clientId: findByName([...store.customers], d.client)?.id,
    supplierId: findByName([...store.suppliers], d.supplier)?.id,
    warehouseId: d.warehouse ? findByName([...store.suppliers], d.warehouse)?.id : undefined,
  });

  const blockersOf = (i: ReviewItem): string[] => [...i.errors, ...(i.kind === "deals" ? dealBlockers(i.data, lookupFor(i.data)) : [])];

  const approve = (list: ReviewItem[]) => {
    const ok = list.filter((i) => i.status === "pending" && !i.duplicateOf && blockersOf(i).length === 0);
    const done: string[] = [];
    const offers: OfferDraft[] = [];
    for (const i of ok) {
      if (i.kind === "contacts") store.addParty(toPartyInput(i.data));
      else if (i.kind === "offers") {
        const f = toOfferFields(i.data);
        offers.push({
          ...f, quantity: f.quantity, supplierName: f.supplierName, productName: f.productName,
          source: "excel", sourceRef: i.sourceName, status: "pending_review", extractedAt: new Date().toISOString(),
          importBatchId: i.batchId, confidence: 0.9,
        } as OfferDraft);
      } else store.addDeal({ ...blankDeal(i.data.ref), ...toDealFields(i.data, lookupFor(i.data)) });
      done.push(i.id);
    }
    if (offers.length) store.addPricingBatch(offers);
    setStatus(done, "approved");
    const skipped = list.length - ok.length;
    setMsg(`${done.length} approved${skipped ? `, ${skipped} left in the queue (errors, duplicates or missing contacts)` : ""}. Approved offers still wait in Pricing & Supplier Offers for the normal review.`);
  };

  const readyIds = shown.filter((i) => i.status === "pending");

  return (
    <div className="space-y-3">
      <div className="brand-card space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Load historical data</h3>
          <p className="text-[12px] text-ink-secondary">
            Do it in this order, so later steps can find the companies they refer to: contacts, then supplier offers, then past deals. Mailbox history, Xero exports and
            document folders need the server build; spreadsheets of the same shape load here today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {KIND_ORDER.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`${btn} ${kind === k ? "!border-accent !text-accent" : ""}`}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => download(`tfl-import-${kind}.csv`, templateCsv(kind))}>Download template</button>
          <label className={`${primary} inline-flex cursor-pointer items-center`}>
            Upload .csv or .xlsx
            <input type="file" accept=".csv,.tsv,.xlsx,.xlsm" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
        <p className="text-[12px] text-ink-tertiary">Columns: {TEMPLATES[kind].map((c) => c.header + (c.required ? "*" : "")).join(", ")}</p>
        {kind === "deals" ? (
          <p className="text-[12px] text-ink-secondary">
            Past deals are filed as already booked in Xero, so they are never posted a second time. Put "no" in the Already in Xero column for any that still need posting.
          </p>
        ) : null}
        {msg ? <p className="text-[12px] font-medium text-ink">{msg}</p> : null}
      </div>

      <div className="brand-card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-ink">Review queue</h3>
          <span className="text-[12px] text-ink-secondary">
            {summary.pending} waiting · {summary.ready} ready · {summary.duplicates} duplicates · {summary.errors} with errors · {summary.approved} approved
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["pending", "approved", "rejected"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`${btn} ${filter === f ? "!border-accent !text-accent" : ""}`}>
              {f === "pending" ? "Waiting" : f === "approved" ? "Approved" : "Rejected"}
            </button>
          ))}
          {filter === "pending" ? (
            <>
              <button type="button" className={primary} disabled={!readyIds.length} onClick={() => approve(readyIds)}>Approve all ready</button>
              <button type="button" className={btn} disabled={!readyIds.some((i) => i.duplicateOf)} onClick={() => setStatus(readyIds.filter((i) => i.duplicateOf).map((i) => i.id), "rejected")}>Reject duplicates</button>
            </>
          ) : null}
        </div>

        <div className="thin-scroll max-h-[460px] divide-y divide-divider overflow-y-auto rounded-xl border border-divider">
          {shown.length === 0 ? <p className="p-4 text-[12.5px] text-ink-tertiary">Nothing here for {KIND_LABEL[kind].slice(3).toLowerCase()}.</p> : null}
          {shown.map((i) => {
            const problems = blockersOf(i);
            const cols = TEMPLATES[i.kind].filter((c) => i.data[c.key]).slice(0, 5);
            return (
              <div key={i.id} className="space-y-1.5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] text-ink-tertiary">{i.sourceName} · row {i.row}</span>
                  {i.status === "pending" ? (
                    <span className="flex gap-2">
                      <button type="button" className="text-[12px] font-medium text-accent disabled:opacity-40" disabled={!!i.duplicateOf || problems.length > 0} onClick={() => approve([i])}>Approve</button>
                      <button type="button" className="text-[12px] text-ink-secondary" onClick={() => setStatus([i.id], "rejected")}>Reject</button>
                    </span>
                  ) : (
                    <button type="button" className="text-[12px] text-ink-secondary" onClick={() => setStatus([i.id], "pending")}>Put back</button>
                  )}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {cols.map((c) => (
                    <label key={c.key} className="text-[11.5px] text-ink-tertiary">
                      {c.header}
                      <input
                        className="mt-0.5 h-8 w-full rounded-lg border border-divider bg-transparent px-2 text-[12.5px] text-ink outline-none focus:border-accent"
                        value={i.data[c.key] ?? ""}
                        disabled={i.status !== "pending"}
                        onChange={(e) => edit(i.id, c.key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                {i.duplicateOf ? <p className="text-[12px] text-amber-700">Duplicate of {i.duplicateOf}. Reject it, or change the row if it is a different record.</p> : null}
                {problems.map((p) => <p key={p} className="text-[12px] text-red-600">• {p}</p>)}
                {i.warnings.map((w) => <p key={w} className="text-[12px] text-ink-tertiary">• {w}</p>)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
