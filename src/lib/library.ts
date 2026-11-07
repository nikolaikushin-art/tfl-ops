/**
 * The Film Location CRM — the document library (v23). Pure helpers.
 *
 * One file is stored once. It carries customerId / supplierId / warehouseId
 * (the company), dealId (the deal folder) and library + docTag (the library).
 * The company view, the deal folder and the library are three filters over the
 * same list, never three copies.
 *
 * Two library categories only: KYC & Company, and Deals, Contracts & Shipping.
 * Product documents live on Products and expense receipts on Accounting; they
 * are not in the library.
 */
import type { Document } from "./domain";
import { DEAL_DOC_TAGS } from "./dealFolder";
import { documentExpiry, type ExpiryState } from "./documents";

export type LibraryId = "kyc_company" | "deals_contracts_shipping";
export type DocPlace = LibraryId | "product" | "expense";

export const LIBRARIES: { id: LibraryId; label: string; hint: string }[] = [
  { id: "kyc_company", label: "KYC & Company", hint: "Registration, IDs, bank letters, licences, insurance, brand authorisations" },
  { id: "deals_contracts_shipping", label: "Deals, Contracts & Shipping", hint: "Offers, POs, contracts, invoices, pre-advice, escrow, CMR, B/L, T1/T2" },
];

export interface LibTag {
  tag: string;
  label: string;
  library: LibraryId;
  type: Document["type"];
  /** Normally carries an end date, so we ask for one and chase it. */
  expires?: boolean;
}

export const COMPANY_DOC_TAGS: LibTag[] = [
  { tag: "kyc_form", label: "KYC form", library: "kyc_company", type: "kyc" },
  { tag: "incorporation", label: "Certificate of incorporation", library: "kyc_company", type: "kyc" },
  { tag: "director_id", label: "Director ID", library: "kyc_company", type: "kyc", expires: true },
  { tag: "proof_address", label: "Proof of address", library: "kyc_company", type: "kyc", expires: true },
  { tag: "bank_letter", label: "Bank letter", library: "kyc_company", type: "kyc", expires: true },
  { tag: "licence", label: "Licence", library: "kyc_company", type: "certificate", expires: true },
  { tag: "brand_auth", label: "Brand authorisation", library: "kyc_company", type: "certificate", expires: true },
  { tag: "insurance", label: "Insurance", library: "kyc_company", type: "certificate", expires: true },
  { tag: "nda", label: "NDA / framework agreement", library: "kyc_company", type: "contract", expires: true },
  { tag: "company_other", label: "Other company document", library: "kyc_company", type: "other" },
];

const DEAL_LIB_TAGS: LibTag[] = DEAL_DOC_TAGS.map((t) => ({
  tag: t.tag,
  label: t.label,
  library: "deals_contracts_shipping" as const,
  type: t.type,
}));

export const ALL_LIB_TAGS: LibTag[] = [...COMPANY_DOC_TAGS, ...DEAL_LIB_TAGS];
export const libTag = (tag?: string) => ALL_LIB_TAGS.find((t) => t.tag === tag);
export const tagsFor = (lib: LibraryId) => ALL_LIB_TAGS.filter((t) => t.library === lib);
export const tagLabel = (tag?: string) => libTag(tag)?.label ?? "Document";

/* -------------------------------------------------------------------------- */
/* Where does a document live?                                                */
/* -------------------------------------------------------------------------- */

/** Receipts → Accounting, product sheets → Products, everything else → one of
 *  the two library categories. An explicit `library` always wins. */
export function placeOf(doc: Document): DocPlace {
  if (doc.expenseId) return "expense";
  if (doc.library) return doc.library;
  if (doc.productId && !doc.dealId) return "product";
  if (doc.dealId) return "deals_contracts_shipping";
  const t = libTag(doc.docTag);
  if (t) return t.library;
  if (doc.type === "kyc" || doc.type === "certificate") return "kyc_company";
  return "deals_contracts_shipping";
}

export function libraryOf(doc: Document): LibraryId | null {
  const p = placeOf(doc);
  return p === "product" || p === "expense" ? null : p;
}

/** The tag a document shows: its own, or a sensible one from its type. */
export function effectiveTag(doc: Document): string {
  if (doc.docTag && libTag(doc.docTag)) return doc.docTag;
  switch (doc.type) {
    case "kyc": return "kyc_form";
    case "certificate": return libraryOf(doc) === "deals_contracts_shipping" ? "coo" : "licence";
    case "contract": return libraryOf(doc) === "kyc_company" ? "nda" : "contract";
    case "quotation": return "offer";
    case "order": return "po";
    case "invoice": return "invoice_ours";
    default: return libraryOf(doc) === "kyc_company" ? "company_other" : "other";
  }
}

export const libraryDocs = (docs: Document[], lib: LibraryId, tag?: string): Document[] =>
  docs.filter((d) => libraryOf(d) === lib && (!tag || effectiveTag(d) === tag));

export const productDocs = (docs: Document[], productId: string): Document[] =>
  docs.filter((d) => placeOf(d) === "product" && d.productId === productId);

export const expenseDocs = (docs: Document[], expenseId?: string): Document[] =>
  docs.filter((d) => placeOf(d) === "expense" && (!expenseId || d.expenseId === expenseId));

/** Everything filed against a company, whichever record id it is known by. */
export const docsForCompany = (docs: Document[], recordIds: string[]): Document[] => {
  const ids = new Set(recordIds);
  return docs.filter(
    (d) => (d.customerId && ids.has(d.customerId)) || (d.supplierId && ids.has(d.supplierId)) || (d.warehouseId && ids.has(d.warehouseId)),
  );
};

/** Tag → count within a library, for the filter chips. */
export function tagCounts(docs: Document[], lib: LibraryId): { tag: string; label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const d of libraryDocs(docs, lib)) m.set(effectiveTag(d), (m.get(effectiveTag(d)) ?? 0) + 1);
  return [...m.entries()].map(([tag, count]) => ({ tag, label: tagLabel(tag), count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* -------------------------------------------------------------------------- */
/* Naming: "2026-10-04 – Pre-advice – [Warehouse] – [Deal ref]"               */
/* -------------------------------------------------------------------------- */

export const NAME_PATTERN = /^\d{4}-\d{2}-\d{2} [-–] .+/;
export const hasStandardName = (name: string) => NAME_PATTERN.test(name.trim());

export function standardName(o: { date?: string; tag: string; counterparty?: string; ref?: string }): string {
  const date = (o.date ?? new Date().toISOString()).slice(0, 10);
  return [date, tagLabel(o.tag), o.counterparty, o.ref].filter(Boolean).join(" – ");
}

/* -------------------------------------------------------------------------- */
/* "AI filed, please confirm" queue                                           */
/* -------------------------------------------------------------------------- */

export interface FilingSuggestion {
  library: LibraryId;
  tag: string;
  type: Document["type"];
  confidence: "high" | "low";
  note: string;
}

/** Order matters: the more specific wording is tested first. Rule-based
 *  stand-in for AI reading the file; scanned PDFs need the server build. */
const RULES: { re: RegExp; tag: string }[] = [
  { re: /pre[-\s]?advice/i, tag: "pre_advice" },
  { re: /release note|delivery order/i, tag: "release_note" },
  { re: /transfer note/i, tag: "transfer_note" },
  { re: /escrow/i, tag: "escrow_statement" },
  { re: /warehouse (fee|invoice|charges)|storage fee/i, tag: "warehouse_fees" },
  { re: /(?<![a-z])cmr(?![a-z])/i, tag: "cmr" },
  { re: /bill of lading|(?<![a-z])b\/l(?![a-z])|(?<![a-z])bl[-_ ]?\d/i, tag: "bl" },
  { re: /packing list/i, tag: "packing_list" },
  { re: /(?<![a-z])e-?ad(?![a-z])|(?<![a-z])arc(?![a-z])/i, tag: "e_ad" },
  { re: /(?<![a-z])t[12](?![a-z])/i, tag: "t1_t2" },
  { re: /certificate of origin|(?<![a-z])coo(?![a-z])|origin cert/i, tag: "coo" },
  { re: /pro[-\s]?forma/i, tag: "proforma" },
  { re: /purchase order|(?<![a-z])po[-_ ]?\d|(?<![a-z])po(?![a-z])/i, tag: "po" },
  { re: /offer|quotation|\bquote\b|price list/i, tag: "offer" },
  { re: /incorporation|certificate of registration|company registration/i, tag: "incorporation" },
  { re: /passport|director id|\bid card\b/i, tag: "director_id" },
  { re: /proof of address|utility bill/i, tag: "proof_address" },
  { re: /bank (letter|reference|confirmation)/i, tag: "bank_letter" },
  { re: /licen[cs]e|permit/i, tag: "licence" },
  { re: /brand authori[sz]ation|letter of authori[sz]ation/i, tag: "brand_auth" },
  { re: /insurance|policy/i, tag: "insurance" },
  { re: /(?<![a-z])nda(?![a-z])|non[-\s]?disclosure|framework agreement/i, tag: "nda" },
  { re: /(?<![a-z])kyc(?![a-z])|onboarding/i, tag: "kyc_form" },
  { re: /contract|agreement|(?<![a-z])spa(?![a-z])/i, tag: "contract" },
  { re: /invoice|(?<![a-z])inv[-_ ]?\d/i, tag: "invoice_supplier" },
];

export function suggestFiling(fileName: string): FilingSuggestion {
  for (const r of RULES) {
    if (r.re.test(fileName)) {
      const t = libTag(r.tag)!;
      return { library: t.library, tag: t.tag, type: t.type, confidence: "high", note: `Name suggests “${t.label}”` };
    }
  }
  return { library: "deals_contracts_shipping", tag: "other", type: "other", confidence: "low", note: "Could not tell what this is from the name; please choose" };
}

/** Fields to put on a new document so it lands in the confirm queue. */
export function intakeFields(fileName: string): Partial<Document> {
  const s = suggestFiling(fileName);
  return { library: s.library, docTag: s.tag, type: s.type, needsConfirmation: true, filingNote: s.note };
}

export const confirmQueue = (docs: Document[]): Document[] =>
  docs.filter((d) => d.needsConfirmation).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/* -------------------------------------------------------------------------- */
/* Expiry tracking                                                            */
/* -------------------------------------------------------------------------- */

export function expirySummary(docs: Document[], warningDays = 30, now: Date = new Date()): Record<ExpiryState, number> {
  const out: Record<ExpiryState, number> = { none: 0, valid: 0, expiring: 0, expired: 0 };
  for (const d of docs) out[documentExpiry(d, warningDays, now).state]++;
  return out;
}

/** Documents that normally expire (IDs, licences, insurance …) but have no
 *  end date recorded, so nothing would ever chase them. */
export const missingExpiry = (docs: Document[]): Document[] =>
  docs.filter((d) => placeOf(d) === "kyc_company" && !d.expiresAt && libTag(effectiveTag(d))?.expires);

/* -------------------------------------------------------------------------- */
/* What a company file should hold, by role                                   */
/* -------------------------------------------------------------------------- */

const ROLE_CORE: Record<string, string[]> = {
  buyer: ["kyc_form", "incorporation", "director_id", "proof_address"],
  supplier: ["kyc_form", "incorporation", "director_id", "bank_letter", "brand_auth"],
  trader: ["kyc_form", "incorporation", "director_id", "bank_letter"],
  warehouse: ["kyc_form", "incorporation", "licence", "insurance"],
};

/** Usual KYC / company documents this company has none of yet, from its roles.
 *  Only company-library files count; deal documents never fill a KYC gap. */
export function missingCompanyDocs(roles: string[], docs: Document[]): LibTag[] {
  const have = new Set(docs.filter((d) => libraryOf(d) === "kyc_company").map(effectiveTag));
  const want: string[] = [];
  for (const r of roles) for (const t of ROLE_CORE[r] ?? []) if (!want.includes(t)) want.push(t);
  return want.filter((t) => !have.has(t)).map((t) => libTag(t)!).filter(Boolean);
}

/** The library and tag lists a document can be re-filed under, for pickers. */
export const libraryOptions = () => LIBRARIES.map((l) => ({ ...l, tags: tagsFor(l.id) }));
