/**
 * Documents (v23). Two library categories only: KYC & Company, and Deals,
 * Contracts & Shipping, with a type-tag filter. Each file is stored once: the
 * same record shows on the company (customerId / supplierId / warehouseId), in
 * the deal folder (dealId) and here. Product documents live on Products and
 * expense receipts on Accounting.
 */
import { RecordViews } from "@/components/views";
import { useModuleCfg, readModuleCfg } from "@/lib/moduleConfig";
import { DocFilePicker, type PickedFile } from "@/components/DocFilePicker";
import { useMemo, useState } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrimaryButton, SegmentedControl, inputClass } from "@/components/brand";
import { FormSection, Field, TextInput, SelectInput } from "@/components/forms";
import { ExpiryBadge } from "@/components/DocumentBadges";
import { cn } from "@/lib/utils";
import { shortDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import { documentExpiry, documentsNeedingAttention, type ExpiryState } from "@/lib/documents";
import type { Document } from "@/lib/domain";
import { buildParties } from "@/lib/parties";
import { partyForRecord } from "@/lib/dealFolder";
import {
  LIBRARIES,
  confirmQueue,
  effectiveTag,
  hasStandardName,
  libTag,
  libraryDocs,
  libraryOf,
  missingExpiry,
  placeOf,
  standardName,
  tagCounts,
  tagLabel,
  tagsFor,
  type LibraryId,
} from "@/lib/library";

/** The "Library on open" setting stores all / deals / kyc / other, but the page only has two libraries.
 *  Map the setting onto a real library id; anything else (including the default "all") opens Deals & shipping,
 *  so the page never opens on a library that does not exist (it used to show "0 documents" on first open). */
function startLibraryFromSetting(v: unknown): LibraryId {
  const s = String(v ?? "");
  if (s === "kyc" || s === "kyc_company") return "kyc_company";
  return "deals_contracts_shipping";
}

export function DocumentsPage({ initialDocId }: { initialDocId?: string | null } = {}) {
  const store = useStore();
  const focused = store.documents.find((d) => d.id === initialDocId);
  const warningDays = store.crmSettings.documentExpiryWarningDays ?? 30;
  const [lib, setLib] = useState<LibraryId>(() => (focused && libraryOf(focused)) || startLibraryFromSetting(readModuleCfg("documents").startLibrary));
  const docSort = String(useModuleCfg("documents").sortBy);
  const [tag, setTag] = useState("");
  const [q, setQ] = useState(() => focused?.name ?? "");
  const [adding, setAdding] = useState(false);
  const emptyForm = { name: "", tag: "pre_advice", company: "", dealId: "", reference: "", issuedAt: "", expiresAt: "" };
  const [form, setForm] = useState(emptyForm);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const setF = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const parties = useMemo(
    () =>
      buildParties({
        customers: store.customers,
        suppliers: store.suppliers,
        contacts: store.contacts,
        deals: store.deals,
        pricingRecords: store.pricingRecords,
        requirements: store.requirements,
        communications: store.communications,
      }),
    [store.customers, store.suppliers, store.contacts, store.deals, store.pricingRecords, store.requirements, store.communications],
  );

  const companyName = (d: Pick<Document, "customerId" | "supplierId" | "warehouseId">) =>
    store.customers.find((c) => c.id === d.customerId)?.name ||
    store.suppliers.find((s) => s.id === d.supplierId)?.name ||
    partyForRecord(parties, d.warehouseId)?.name ||
    "";
  const dealRef = (id?: string) => store.deals.find((x) => x.id === id)?.ref;

  /** Standard name for an existing document, from what it is linked to. */
  const nameFor = (d: Document, forTag = effectiveTag(d)) => {
    const deal = store.deals.find((x) => x.id === d.dealId);
    const wh = partyForRecord(parties, deal?.warehouseId ?? d.warehouseId)?.name;
    return standardName({ date: d.issuedAt ?? d.createdAt, tag: forTag, counterparty: wh || companyName(d) || undefined, ref: deal?.ref ?? d.reference });
  };

  const inLibrary = store.documents.filter((d) => placeOf(d) === lib);
  const queue = confirmQueue(store.documents);
  const productCount = store.documents.filter((d) => placeOf(d) === "product").length;
  const expenseCount = store.documents.filter((d) => placeOf(d) === "expense").length;
  const kycMissingExpiry = missingExpiry(store.documents);
  const attention = documentsNeedingAttention(inLibrary, warningDays);
  const expiredCount = attention.filter((a) => a.expiry.state === "expired").length;

  const rows = libraryDocs(store.documents, lib, tag || undefined)
    .filter((d) => !q.trim() || `${d.name} ${companyName(d)} ${dealRef(d.dealId) ?? ""} ${d.reference ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => {
      if (docSort === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (docSort === "name") return a.name.localeCompare(b.name);
      const order: Record<ExpiryState, number> = { expired: 0, expiring: 1, valid: 2, none: 3 };
      const ea = documentExpiry(a, warningDays);
      const eb = documentExpiry(b, warningDays);
      if (order[ea.state] !== order[eb.state]) return order[ea.state] - order[eb.state];
      return b.createdAt.localeCompare(a.createdAt);
    });

  const save = () => {
    const t = libTag(form.tag);
    if (!t) return;
    const deal = store.deals.find((x) => x.id === form.dealId);
    const [kind, id] = form.company ? form.company.split(":") : ["", ""];
    const link = {
      customerId: deal?.clientId ?? (kind === "c" ? id : undefined),
      supplierId: deal?.supplierId ?? (kind === "s" ? id : undefined),
      warehouseId: deal?.warehouseId,
    };
    const wh = partyForRecord(parties, link.warehouseId)?.name;
    const counterparty = wh || companyName(link) || undefined;
    store.addDocument({
      name: form.name.trim() || standardName({ tag: form.tag, counterparty, ref: deal?.ref ?? (form.reference.trim() || undefined) }),
      type: t.type,
      library: t.library,
      docTag: t.tag,
      dealId: deal?.id,
      ...link,
      reference: form.reference.trim() || undefined,
      issuedAt: form.issuedAt ? new Date(form.issuedAt).toISOString() : undefined,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      source: "upload",
      ...(picked ? { originalName: picked.originalName, mimeType: picked.mimeType, size: picked.size, extractedText: picked.extractedText } : {}),
    });
    setLib(t.library);
    setPicked(null);
    setForm(emptyForm);
    setAdding(false);
  };

  const confirm = (d: Document, library: LibraryId, tg: string) => {
    const t = libTag(tg);
    const next: Document = { ...d, library, docTag: tg, type: t?.type ?? d.type };
    store.updateDocument(d.id, {
      library,
      docTag: tg,
      type: t?.type ?? d.type,
      needsConfirmation: false,
      filingNote: undefined,
      name: hasStandardName(d.name) ? d.name : nameFor(next, tg),
    });
  };

  const companyOptions = [
    { value: "", label: "Not linked to a company" },
    ...store.customers.map((c) => ({ value: `c:${c.id}`, label: `Buyer — ${c.name}` })),
    ...store.suppliers.map((s) => ({ value: `s:${s.id}`, label: `Supplier — ${s.name}` })),
  ];
  const dealOptions = [{ value: "", label: "Not linked to a deal" }, ...store.deals.map((x) => ({ value: x.id, label: x.ref }))];
  const tagOptions = [...tagsFor("deals_contracts_shipping"), ...tagsFor("kyc_company")].map((t) => ({
    value: t.tag,
    label: `${t.library === "kyc_company" ? "KYC & Company" : "Deals"} · ${t.label}`,
  }));
  const chips = tagCounts(store.documents, lib);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="ios-large-title text-ink">Documents</h1>
          <p className="mt-1 text-[14px] text-ink-secondary">
            Two places: KYC &amp; Company, and Deals, Contracts &amp; Shipping. Each file is stored once and also shows on the company and in the deal folder.
          </p>
        </div>
        <Button className="h-11 rounded-full bg-accent-fill font-semibold text-white shadow-sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add document"}
        </Button>
      </div>

      {queue.length > 0 ? (
        <div className="brand-card border-l-4 border-l-accent p-4">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-accent" />
            AI filed, please confirm · {queue.length}
          </div>
          <p className="mt-0.5 text-[12px] text-ink-secondary">
            Check where each file went. Confirming also gives it the standard name.
          </p>
          <div className="mt-3 divide-y divide-divider">
            {queue.map((d) => {
              const curLib = (placeOf(d) === "kyc_company" ? "kyc_company" : "deals_contracts_shipping") as LibraryId;
              const curTag = effectiveTag(d);
              return (
                <QueueRow
                  key={d.id}
                  d={d}
                  library={curLib}
                  tag={curTag}
                  company={companyName(d)}
                  proposed={nameFor(d, curTag)}
                  onConfirm={(l, t) => confirm(d, l, t)}
                  onRemove={() => store.removeDocument(d.id)}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {adding ? (
        <div className="space-y-4">
          <FormSection title="Document" description="Leave the name blank to use the standard name, e.g. “2026-10-04 – Pre-advice – [Warehouse] – [Deal ref]”.">
            <Field label="File" full>
              <DocFilePicker onPicked={setPicked} />
            </Field>
            <Field label="Type" full>
              <SelectInput value={form.tag} onChange={(v) => setF("tag", v)} options={tagOptions} />
            </Field>
            <Field label="Linked deal" hint="Fills in buyer, supplier and warehouse">
              <SelectInput value={form.dealId} onChange={(v) => setF("dealId", v)} options={dealOptions} />
            </Field>
            <Field label="Company">
              <SelectInput value={form.company} onChange={(v) => setF("company", v)} options={companyOptions} />
            </Field>
            <Field label="Name (optional)" full>
              <TextInput value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="Standard name is used if blank" />
            </Field>
            <Field label="Issuer reference" hint="Certificate, contract or policy number">
              <TextInput value={form.reference} onChange={(e) => setF("reference", e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Issued">
              <TextInput type="date" value={form.issuedAt} onChange={(e) => setF("issuedAt", e.target.value)} />
            </Field>
            <Field label="Expires" hint={libTag(form.tag)?.expires ? "This type normally expires" : undefined}>
              <TextInput type="date" value={form.expiresAt} onChange={(e) => setF("expiresAt", e.target.value)} />
            </Field>
          </FormSection>
          <div className="flex flex-col gap-2 sm:flex-row">
            <PrimaryButton onClick={save}>Save document</PrimaryButton>
            <Button variant="outline" className="h-12 rounded-full" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
          <p className="text-[12px] text-ink-tertiary">Real file storage needs the server build; this records the document, its links and its expiry.</p>
        </div>
      ) : null}

      <SegmentedControl
        value={lib}
        onChange={(v) => { setLib(v as LibraryId); setTag(""); }}
        options={LIBRARIES.map((l) => ({ id: l.id, label: `${l.label} · ${libraryDocs(store.documents, l.id).length}`, short: `${l.label.split(/[ ,&]/)[0]} · ${libraryDocs(store.documents, l.id).length}` }))}
      />
      <p className="-mt-3 text-[12px] text-ink-tertiary">{LIBRARIES.find((l) => l.id === lib)?.hint}</p>

      {attention.length > 0 || kycMissingExpiry.length > 0 ? (
        <div className="brand-card border-l-4 border-l-accent p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 text-[12.5px] text-ink-secondary">
              {attention.length > 0 ? (
                <div className="text-[14px] font-semibold text-ink">
                  {expiredCount > 0 ? `${expiredCount} expired` : "Approaching expiry"}
                  {attention.length - expiredCount > 0 && expiredCount > 0 ? ` · ${attention.length - expiredCount} expiring soon` : ""}
                  <span className="ml-1 text-[12px] font-normal text-ink-secondary">(warning window {warningDays} days)</span>
                </div>
              ) : null}
              {attention.length > 0 ? <p className="mt-0.5">{attention.slice(0, 3).map((a) => a.document.name).join(" · ")}</p> : null}
              {kycMissingExpiry.length > 0 ? (
                <p className="mt-1">{kycMissingExpiry.length} KYC/company document{kycMissingExpiry.length === 1 ? "" : "s"} normally expire but have no end date, so nothing will chase them: {kycMissingExpiry.slice(0, 2).map((x) => x.name).join(" · ")}{kycMissingExpiry.length > 2 ? " …" : ""}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(inputClass, "h-9 w-full text-[13px] sm:w-[240px]")} placeholder="Search name, company, deal" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={() => setTag("")} className={cn("rounded-full px-3 py-1 text-[12.5px]", tag === "" ? "bg-[rgb(var(--accent-fill))] text-white" : "bg-elevated text-ink-secondary")}>
          All types
        </button>
        {chips.map((c) => (
          <button key={c.tag} type="button" onClick={() => setTag(c.tag)} className={cn("rounded-full px-3 py-1 text-[12.5px]", tag === c.tag ? "bg-[rgb(var(--accent-fill))] text-white" : "bg-elevated text-ink-secondary")}>
            {c.label} · {c.count}
          </button>
        ))}
      </div>

      <RecordViews<Document>
        id="documents"
        label="documents"
        modes={["list", "table"]}
        defaultMode="list"
        items={rows}
        rowKey={(d) => d.id}
        columns={[
          { id: "name", label: "Document", sort: (d) => d.name, render: (d) => <span className="rv-cell-main">{d.name}</span> },
          { id: "type", label: "Type", secondary: true, sort: (d) => tagLabel(effectiveTag(d)), render: (d) => tagLabel(effectiveTag(d)) },
          { id: "company", label: "Company", sort: (d) => companyName(d) || "", render: (d) => companyName(d) || "—" },
          { id: "deal", label: "Deal", secondary: true, sort: (d) => dealRef(d.dealId) || "", render: (d) => dealRef(d.dealId) || "—" },
          { id: "filed", label: "Filed", secondary: true, sort: (d) => d.createdAt, render: (d) => shortDate(d.createdAt) },
          { id: "exp", label: "Expires", align: "right", sort: (d) => d.expiresAt ?? "9999", render: (d) => (d.expiresAt ? shortDate(d.expiresAt) : "—") },
        ]}
        renderList={() => (
        <div className="brand-card divide-y divide-divider overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-ink-secondary">{inLibrary.length === 0 ? "Nothing filed here yet." : "Nothing matches this filter."}</div>
        ) : (
          rows.map((d) => {
            const info = documentExpiry(d, warningDays);
            const ref = dealRef(d.dealId);
            return (
              <div key={d.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{d.name}</div>
                  <div className="text-[13px] text-ink-secondary">
                    <span className="mr-1.5 rounded-full bg-elevated px-2 py-0.5 text-[11.5px]">{tagLabel(effectiveTag(d))}</span>
                    {companyName(d) || "No company"}
                    {ref ? ` · deal ${ref}` : ""}
                    {d.reference ? ` · ${d.reference}` : ""}
                    {` · ${shortDate(d.createdAt)}`}
                    {d.expiresAt ? ` · expires ${shortDate(d.expiresAt)}` : ""}
                  </div>
                </div>
                <ExpiryBadge info={info} />
                <div className="flex items-center gap-2">
                  {!hasStandardName(d.name) ? (
                    <button type="button" className="text-[13px] font-medium text-[rgb(var(--accent))]" onClick={() => store.updateDocument(d.id, { name: nameFor(d) })}>
                      Standard name
                    </button>
                  ) : null}
                  <span className="text-[12px] text-ink-tertiary">Expires</span>
                  <input
                    type="date"
                    aria-label={`Expiry date for ${d.name}`}
                    value={d.expiresAt ? d.expiresAt.slice(0, 10) : ""}
                    onChange={(e) => store.updateDocument(d.id, { expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                    className={cn(inputClass, "h-9 w-[150px] text-[13px]")}
                  />
                  <button type="button" className="text-[13px] font-medium text-ink-secondary hover:text-ink" onClick={() => { if (readModuleCfg("documents").confirmDelete === false || window.confirm("Remove document?")) store.removeDocument(d.id); }}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
        )}
      />

      <p className="text-[12px] text-ink-tertiary">
        Product documents ({productCount}) are on each product in Products. Expense receipts ({expenseCount}) are on the expense in Accounting. They are not in this library.
      </p>
    </div>
  );
}

function QueueRow({
  d, library, tag, company, proposed, onConfirm, onRemove,
}: {
  d: Document; library: LibraryId; tag: string; company: string; proposed: string;
  onConfirm: (library: LibraryId, tag: string) => void; onRemove: () => void;
}) {
  const [l, setL] = useState<LibraryId>(library);
  const [t, setT] = useState(tag);
  const tags = tagsFor(l);
  return (
    <div className="space-y-2 py-3 text-[13px]">
      <div className="font-medium text-ink">{d.name}</div>
      <div className="text-ink-secondary">
        {d.filingNote ?? "Filed automatically"}{company ? ` · ${company}` : ""}
        {!hasStandardName(d.name) ? <> · will be named “{proposed}”</> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={cn(inputClass, "h-9 w-auto text-[13px]")} value={l} onChange={(e) => { const nl = e.target.value as LibraryId; setL(nl); setT(tagsFor(nl)[0].tag); }}>
          {LIBRARIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select className={cn(inputClass, "h-9 w-auto text-[13px]")} value={t} onChange={(e) => setT(e.target.value)}>
          {tags.map((x) => <option key={x.tag} value={x.tag}>{x.label}</option>)}
        </select>
        <button type="button" className="font-medium text-[rgb(var(--accent))]" onClick={() => onConfirm(l, t)}>Confirm</button>
        <button type="button" className="text-ink-secondary hover:text-ink" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}
