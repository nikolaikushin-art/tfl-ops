/**
 * The Film Location CRM — one directory (v18).
 *
 * Buyers and suppliers are stored as two kinds of record (orders, quotes and
 * deals point at them by id), but Roni works with ONE list: a trader is a buyer
 * on one deal and a supplier on the next. A `Party` is that one company, built
 * from whichever records exist for it. Records are linked by `partyId`, with the
 * normalised company name as a fallback for data that predates the link.
 */
import type {
  Communication,
  ContactRole,
  Customer,
  Deal,
  Document,
  PartyProfile,
  PricingRecord,
  CustomerRequirement,
  Supplier,
  TradeTerms,
  Contact,
} from "./domain";
import { figuresFor } from "./partyFigures";

export interface Party {
  key: string;
  name: string;
  customer?: Customer;
  supplier?: Supplier;
  roles: ContactRole[];
  country: string;
  region?: string;
  city?: string;
  address?: string;
  status: string;
  kyc: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  language?: string;
  source?: string;
  soleTrader: boolean;
  profile: PartyProfile;
  tradeTerms: TradeTerms;
  /** Product categories + brands, flattened for filtering. */
  categories: string[];
  brands: string[];
  tags: string[];
  rating?: "reliable" | "caution" | "avoid";
  followUpDate?: string;
  followUpNote?: string;
  /** Ids of the underlying records, for matching deals / offers / requests. */
  recordIds: string[];
  people: Contact[];
  // automatic
  deals: number;
  volume: Record<string, number>;
  soldTo: Record<string, number>;
  boughtFrom: Record<string, number>;
  netMargin: Record<string, number>;
  /** 0–100, or null when there is nothing to measure yet. */
  completion: number | null;
  lastDeal?: string;
  lastContacted?: string;
}

export const normaliseCompanyName = (v: string) =>
  v
    .toLowerCase()
    .replace(/\b(ltd|limited|llc|llp|gmbh|sa|sas|sarl|bv|nv|inc|co|fze|fzco|ag|as|spa|srl|plc)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");

export interface PartyInput {
  customers: Customer[];
  suppliers: Supplier[];
  contacts: Contact[];
  deals: Deal[];
  pricingRecords: PricingRecord[];
  requirements: CustomerRequirement[];
  communications: Communication[];
  kycStatusFor?: (recordId: string) => string | undefined;
}

export function buildParties(i: PartyInput): Party[] {
  const map = new Map<string, Party>();
  const keyFor = (partyId: string | undefined, name: string) => partyId ?? (normaliseCompanyName(name) || name);
  const blank = (key: string, name: string): Party => ({
    key, name, roles: [], country: "", status: "", kyc: "not_sent", soleTrader: false, profile: {},
    tradeTerms: {}, categories: [], brands: [], tags: [], recordIds: [], people: [],
    deals: 0, volume: {}, soldTo: {}, boughtFrom: {}, netMargin: {}, completion: null,
  });
  const get = (partyId: string | undefined, name: string) => {
    const k = keyFor(partyId, name);
    // A partyId link wins; otherwise fall back to the company name.
    const byName = [...map.values()].find((p) => normaliseCompanyName(p.name) === normaliseCompanyName(name));
    const hit = map.get(k) ?? byName;
    if (hit) return hit;
    const p = blank(k, name);
    map.set(k, p);
    return p;
  };

  const absorb = (
    p: Party,
    r: Customer | Supplier,
    baseRole: ContactRole,
  ) => {
    p.roles.push(...(r.roles ?? [baseRole, ...(r.extraRoles ?? [])]));
    p.recordIds.push(r.id);
    p.country ||= r.country;
    p.city ||= r.city;
    p.email ||= r.email;
    p.phone ||= r.phone;
    p.rating ||= r.myRating;
    p.followUpDate ||= r.followUpDate;
    p.followUpNote ||= r.followUpNote;
    p.tags.push(...(r.tags ?? []));
    p.tradeTerms = { ...(r.tradeTerms ?? {}), ...p.tradeTerms };
    if (r.profile) p.profile = { ...r.profile, ...p.profile };
  };

  for (const c of i.customers) {
    const p = get(c.partyId, c.name);
    p.customer = c;
    p.status = c.status;
    p.kyc = c.kycStatus;
    if (p.kyc === "none") p.kyc = i.kycStatusFor?.(c.id) ?? "none";
    absorb(p, c, "buyer");
  }
  for (const s of i.suppliers) {
    const p = get(s.partyId, s.name);
    p.supplier = s;
    p.status ||= s.status;
    absorb(p, s, "supplier");
    if (p.kyc === "none") p.kyc = i.kycStatusFor?.(s.id) ?? "none";
  }

  for (const p of map.values()) {
    p.kyc = kycWord(p.kyc);
    p.roles = [...new Set(p.roles)];
    p.tags = [...new Set(p.tags)];
    p.region = p.profile.region;
    p.address = p.profile.address;
    p.language = p.profile.language;
    p.source = p.profile.source;
    p.whatsapp = p.profile.whatsapp ?? p.whatsapp;
    p.soleTrader = !!p.profile.soleTrader;
    const t = p.tradeTerms;
    p.brands = [...new Set([...(t.brandsAsBuyer ?? []), ...(t.brandsAsSupplier ?? [])])];
    p.categories = [...new Set([...(t.categories ?? [])])];
    p.people = i.contacts.filter((c) => (c.customerId && p.recordIds.includes(c.customerId)) || (c.supplierId && p.recordIds.includes(c.supplierId)));

    // One shared calculation (partyFigures.ts), so every screen agrees.
    const f = figuresFor(p.recordIds, i.deals);
    p.deals = f.deals;
    p.volume = f.volume;
    p.soldTo = f.soldTo;
    p.boughtFrom = f.boughtFrom;
    p.netMargin = f.netMargin;
    p.lastDeal = f.lastDeal;

    p.completion = completionRate(p.recordIds, i);
    const comms = i.communications.filter(
      (c) => (c.customerId && p.recordIds.includes(c.customerId)) || (c.supplierId && p.recordIds.includes(c.supplierId)),
    );
    p.lastContacted = comms.map((c) => c.occurredAt).sort().reverse()[0];
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Deal completion rate: of the offers this company made and the requests it
 * sent, how many became a real (non-cancelled) deal. Returns null when there
 * is nothing to measure — a blank is more honest than a made-up 100%.
 */
export function completionRate(
  recordIds: string[],
  i: Pick<PartyInput, "deals" | "pricingRecords" | "requirements">,
): number | null {
  const live = i.deals.filter((d) => d.stage !== "cancelled");
  const offers = i.pricingRecords.filter(
    (o) => o.supplierId && recordIds.includes(o.supplierId) && o.status !== "rejected" && o.status !== "draft",
  );
  const offersDone = offers.filter((o) => o.status === "converted" || live.some((d) => d.offerId === o.id));
  const requests = i.requirements.filter((r) => recordIds.includes(r.customerId));
  const requestsDone = requests.filter((r) => r.status === "won" || live.some((d) => d.requirementId === r.id));
  const total = offers.length + requests.length;
  if (!total) return null;
  return Math.round(((offersDone.length + requestsDone.length) / total) * 100);
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Roni's KYC words: Not sent > Sent > Submitted > Approved / Rejected.
 * Older records use none / pending / draft / under_review etc.; they all fold into these.
 */
export const KYC_WORDS = [
  { id: "not_sent", label: "Not sent" },
  { id: "sent", label: "Sent" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "expired", label: "Expired" },
] as const;

export function kycWord(status: string | undefined): string {
  switch (status) {
    case undefined: case "": case "none": case "draft": return "not_sent";
    case "pending": case "sent": return "sent";
    case "submitted": case "under_review": case "changes_requested": return "submitted";
    default: return status;
  }
}
export const kycWordLabel = (id: string) => KYC_WORDS.find((w) => w.id === id)?.label ?? id;

export interface PartyFilters {
  q: string;
  tab: "all" | "buyer" | "supplier" | "trader" | "other";
  country: string;
  region: string;
  category: string;
  brand: string;
  buyerType: string;
  supplierType: string;
  status: string;
  kyc: string;
  rating: string;
  tag: string;
  /** "" | "T1" | "T2" */
  duty: string;
  payment: string;
}
export const EMPTY_FILTERS: PartyFilters = {
  q: "", tab: "all", country: "", region: "", category: "", brand: "", buyerType: "",
  supplierType: "", status: "", kyc: "", rating: "", tag: "", duty: "", payment: "",
};

const TAB_ROLES: Record<PartyFilters["tab"], ContactRole[] | null> = {
  all: null,
  buyer: ["buyer"],
  supplier: ["supplier"],
  trader: ["trader"],
  other: ["warehouse", "broker", "service", "other"],
};

export function filterParties(parties: Party[], f: PartyFilters): Party[] {
  const q = f.q.trim().toLowerCase();
  const roles = TAB_ROLES[f.tab];
  const has = (list: string[], v: string) => list.some((x) => x.toLowerCase() === v.toLowerCase());
  return parties.filter(
    (p) =>
      (!roles || p.roles.some((r) => roles.includes(r))) &&
      (!f.country || p.country === f.country) &&
      (!f.region || p.region === f.region) &&
      (!f.category || has(p.categories, f.category)) &&
      (!f.brand || has(p.brands, f.brand)) &&
      (!f.buyerType || p.profile.buyerType === f.buyerType) &&
      (!f.supplierType || p.profile.supplierType === f.supplierType) &&
      (!f.status || p.status === f.status) &&
      (!f.kyc || p.kyc === f.kyc) &&
      (!f.rating || p.rating === f.rating) &&
      (!f.tag || has([...p.tags, ...(p.profile.freeTags ?? [])], f.tag)) &&
      (!f.duty || p.tradeTerms.dutyStatus === f.duty) &&
      (!f.payment || p.tradeTerms.payment === f.payment) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        p.people.some((x) => `${x.firstName} ${x.lastName} ${x.email ?? ""}`.toLowerCase().includes(q))),
  );
}

/** How many active filters (the "Filters (3)" badge). The tab doesn't count. */
export const activeFilterCount = (f: PartyFilters) =>
  (Object.entries(f) as [keyof PartyFilters, string][]).filter(([k, v]) => k !== "tab" && k !== "q" && v).length;

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

export interface TimelineItem {
  id: string;
  at: string;
  kind: "email" | "whatsapp" | "deal" | "document" | "note";
  title: string;
  detail?: string;
  /** Section + id the item opens. */
  open?: { section: string; id: string };
}

/** Activity timeline built automatically from email, WhatsApp, deals and files. */
export function buildTimeline(
  party: Pick<Party, "recordIds">,
  data: { communications: Communication[]; deals: Deal[]; documents: Document[] },
  limit = 40,
): TimelineItem[] {
  const mine = (a?: string, b?: string) => (a && party.recordIds.includes(a)) || (b && party.recordIds.includes(b));
  const items: TimelineItem[] = [];
  for (const c of data.communications) {
    if (!mine(c.customerId, c.supplierId)) continue;
    const kind = c.channel === "whatsapp" ? "whatsapp" : c.channel === "email" ? "email" : "note";
    items.push({
      id: `c:${c.id}`,
      at: c.occurredAt,
      kind,
      title: `${c.direction === "outbound" ? "Sent" : c.direction === "inbound" ? "Received" : "Note"}${c.subject ? `: ${c.subject}` : ""}`,
      detail: c.body.slice(0, 140),
      open: { section: kind === "whatsapp" ? "whatsapp" : "email", id: c.id },
    });
  }
  for (const d of data.deals) {
    if (!party.recordIds.includes(d.clientId) && !party.recordIds.includes(d.supplierId) && !(d.warehouseId && party.recordIds.includes(d.warehouseId))) continue;
    items.push({ id: `d:${d.id}`, at: d.createdAt, kind: "deal", title: `Deal ${d.ref}`, detail: d.productDescription, open: { section: "dealdesk", id: d.id } });
  }
  for (const doc of data.documents) {
    // v24: a warehouse's documents (pre-advice, release notes ...) belong to it too.
    if (!mine(doc.customerId, doc.supplierId) && !mine(doc.warehouseId)) continue;
    items.push({ id: `f:${doc.id}`, at: doc.createdAt, kind: "document", title: doc.name, detail: doc.docTag, open: { section: "documents", id: doc.id } });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Warehouse terms                                                            */
/* -------------------------------------------------------------------------- */

/** Escrow fee the warehouse's own terms imply for a deal of this size. */
export function escrowFeeFor(profile: PartyProfile | undefined, salePrice: number): number {
  const w = profile?.warehouse;
  if (!w) return 0;
  const pct = w.escrowFeePct ? (salePrice * w.escrowFeePct) / 100 : 0;
  return Math.round((pct + (w.escrowFeeFlat ?? 0)) * 100) / 100;
}

/**
 * Trading figures for ONE underlying customer/supplier/contact record, taken
 * over every record id of the company it belongs to. This is the only way a
 * screen should get "lifetime" numbers for a customer: it is the same
 * calculation the Contacts directory uses (figuresFor), so they cannot differ.
 */
export function figuresForRecord(recordId: string, parties: Party[], deals: Deal[]) {
  const party = parties.find((p) => p.recordIds.includes(recordId));
  return figuresFor(party?.recordIds ?? [recordId], deals);
}
