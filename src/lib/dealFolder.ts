/**
 * The Film Location CRM — the deal folder and warehouse terms (v21). Pure helpers.
 *
 * A deal folder is not a separate store: every document is held once and
 * carries `dealId`. The folder is just that set, in date order, with a list of
 * which of the usual deal documents are present and which are still missing.
 */
import type { Deal, Document } from "./domain";
import type { Party } from "./parties";
import { escrowFeeFor } from "./parties";

export interface DealDocTag {
  tag: string;
  /** Short label used in the file name. */
  label: string;
  type: Document["type"];
  /** Usually expected on a deal; drives the "missing" list. */
  core?: boolean;
}

export const DEAL_DOC_TAGS: DealDocTag[] = [
  { tag: "offer", label: "Offer", type: "quotation" },
  { tag: "po", label: "PO", type: "order", core: true },
  { tag: "proforma", label: "Pro-forma", type: "invoice" },
  { tag: "contract", label: "Contract", type: "contract", core: true },
  { tag: "invoice_ours", label: "Invoice (ours)", type: "invoice" },
  { tag: "invoice_supplier", label: "Invoice (supplier)", type: "invoice", core: true },
  { tag: "pre_advice", label: "Pre-advice", type: "other", core: true },
  { tag: "release_note", label: "Release note", type: "other", core: true },
  { tag: "transfer_note", label: "Transfer note", type: "other" },
  { tag: "escrow_statement", label: "Escrow statement", type: "other", core: true },
  { tag: "warehouse_fees", label: "Warehouse fees", type: "invoice" },
  { tag: "cmr", label: "CMR", type: "other" },
  { tag: "bl", label: "B/L", type: "other" },
  { tag: "packing_list", label: "Packing list", type: "other" },
  { tag: "e_ad", label: "e-AD / ARC", type: "other" },
  { tag: "t1_t2", label: "T1 / T2 document", type: "other", core: true },
  { tag: "coo", label: "Certificate of origin", type: "certificate" },
  { tag: "other", label: "Other", type: "other" },
];

export const dealTag = (tag?: string) => DEAL_DOC_TAGS.find((t) => t.tag === tag);

/** "2026-10-04 – Pre-advice – Rotterdam European Hub – RG-2026-011" */
export function dealDocName(opts: { date?: string; tag: string; counterparty?: string; dealRef: string }): string {
  const date = (opts.date ?? new Date().toISOString()).slice(0, 10);
  const label = dealTag(opts.tag)?.label ?? "Document";
  return [date, label, opts.counterparty, opts.dealRef].filter(Boolean).join(" – ");
}

/** Documents filed to the deal, oldest first so the story reads in order. */
export function dealFolder(dealId: string, documents: Document[]): Document[] {
  return documents.filter((d) => d.dealId === dealId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Usual deal documents that are not in the folder yet. Escrow documents are
 *  only expected when the deal actually has a warehouse acting as escrow. */
export function missingDealDocs(deal: Pick<Deal, "warehouseId">, docs: Document[]): DealDocTag[] {
  const have = new Set(docs.map((d) => d.docTag));
  return DEAL_DOC_TAGS.filter(
    (t) => t.core && !have.has(t.tag) && (deal.warehouseId || !["escrow_statement", "release_note"].includes(t.tag)),
  );
}

/** Documents the AI filed that are still waiting for a person to confirm. */
export const awaitingConfirmation = (docs: Document[]) => docs.filter((d) => d.needsConfirmation);

/* -------------------------------------------------------------------------- */
/* Warehouse from Contacts                                                    */
/* -------------------------------------------------------------------------- */

/** Warehouses are Contacts with the Warehouse role, not a separate list. */
export const warehouseParties = (parties: Party[]): Party[] => parties.filter((p) => p.roles.includes("warehouse"));

/** The Contact (party) a deal's warehouseId points at. */
export const partyForRecord = (parties: Party[], recordId?: string): Party | undefined =>
  recordId ? parties.find((p) => p.recordIds.includes(recordId)) : undefined;

export interface WarehouseTermsSuggestion {
  escrowFees: number;
  releaseTerms?: string;
  releaseDays?: number;
  storagePerPalletPerWeek?: number;
  /** False when the warehouse has no escrow terms recorded. */
  hasTerms: boolean;
}

/** What the warehouse's own terms in Contacts imply for this deal's size. */
export function warehouseTermsFor(party: Party | undefined, salePrice: number): WarehouseTermsSuggestion {
  const w = party?.profile.warehouse;
  return {
    escrowFees: escrowFeeFor(party?.profile, salePrice),
    releaseTerms: w?.releaseTerms,
    releaseDays: w?.releaseDays,
    storagePerPalletPerWeek: w?.storagePerPalletPerWeek,
    hasTerms: !!w && (w.escrowFeePct != null || w.escrowFeeFlat != null),
  };
}
