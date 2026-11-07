/**
 * The Film Location CRM — notifications (v17).
 *
 * "Signals" was renamed Notifications and merged into the dashboard. This file
 * adds the trading-specific items Roni listed (escrow, supplier offers,
 * requests with a match, KYC, follow-ups) on top of the existing engine, and
 * drops the credit-control items — TFL gives no credit.
 */
import type { Deal, Contact, Customer, Supplier, KycRecord, PricingRecord, CustomerRequirement, Product } from "@/lib/domain";
import type { Signal } from "@/lib/signals";
import { normaliseRequestStatus, opportunitiesForOffers } from "@/lib/requests";

const DAY = 86400000;
export const STUCK_ESCROW_DAYS = 14;
/** Warn this many days before a supplier price stops being valid. */
export const PRICE_EXPIRY_WARN_DAYS = 3;
/** A deposit counts as "just received" for this many days. */
export const RECENT_DEPOSIT_DAYS = 3;

export interface NotificationInput {
  deals: Deal[];
  customers: Customer[];
  suppliers: Supplier[];
  /** People at companies; each can carry their own follow-up date and note. */
  contacts?: Contact[];
  kycRecords: KycRecord[];
  pricingRecords: PricingRecord[];
  requirements: CustomerRequirement[];
  /** Needed to recognise aliases when matching a new offer to buyers who asked for it. */
  products?: Product[];
  /** Accepted quotes that have not been taken to the Deal Desk raise a "potential deal" notification. */
  quotations?: { id: string; number?: string; status: string; customerId?: string; dealId?: string }[];
  now?: number;
}

export function buildTradeNotifications(i: NotificationInput): Signal[] {
  const now = i.now ?? Date.now();
  const out: Signal[] = [];

  for (const d of i.deals) {
    if (d.stage === "in_escrow" || d.stage === "released") {
      const since = d.depositDate ? Math.floor((now - new Date(d.depositDate).getTime()) / DAY) : 0;
      const stuck = since > STUCK_ESCROW_DAYS;
      out.push({
        id: `deal-escrow:${d.id}`, kind: "pipeline", severity: stuck ? "high" : "medium",
        title: stuck ? `${d.ref}: funds stuck in escrow` : `${d.ref}: funds in escrow, awaiting release`,
        detail: `${d.productDescription} · deposit held ${since} day(s) · ${d.currency}`,
        action: "Open the deal", target: "dealdesk", recordId: d.id, weight: stuck ? 80 : 50,
      });
    }
    if (d.stage === "margin_received" && d.xero.status !== "reconciled") {
      out.push({
        id: `deal-xero:${d.id}`, kind: "data", severity: "high",
        title: `${d.ref}: margin received — approve Xero draft`,
        detail: "Posts as commission income with fees as separate costs.",
        action: "Review posting", target: "dealdesk", recordId: d.id, weight: 70,
      });
    }
  }

  for (const q of i.quotations ?? []) {
    if (q.status === "accepted" && !q.dealId) {
      const who = i.customers.find((c) => c.id === q.customerId)?.name ?? "A customer";
      out.push({
        id: `quote-accepted:${q.id}`, kind: "pipeline", severity: "high",
        title: `${q.number ?? "Quote"} accepted: potential deal`,
        detail: `${who} accepted the quote. Decide whether to take it to the Deal Desk.`,
        action: "Open the request", target: "requirements", recordId: q.id, weight: 90,
      });
    }
  }

  for (const r of i.pricingRecords) {
    if (r.status === "pending_review") {
      out.push({
        id: `offer-review:${r.id}`, kind: "price", severity: "medium",
        title: "New supplier offer to review",
        detail: "Extracted offer waiting for your approval.",
        action: "Review offer", target: "pricing", recordId: r.id, weight: 40,
      });
    }
  }

  for (const q of i.requirements) {
    // v39: the Requests screen writes "matched" (legacy rows say "matching"); both mean a match exists.
    if (normaliseRequestStatus(q.status) === "matched") {
      out.push({
        id: `request-match:${q.id}`, kind: "pipeline", severity: "medium",
        title: `Customer request has a match: ${q.productName}`,
        detail: `${q.matchedSupplierIds?.length ?? 0} matching supplier offer(s).`,
        action: "Open request", target: "requirements", recordId: q.id, weight: 45,
      });
    }
  }

  // "This new offer matches three buyers who have asked for this brand."
  for (const o of opportunitiesForOffers(i.pricingRecords, i.requirements, i.products ?? [])) {
    const n = o.requests.length;
    out.push({
      id: `offer-matches:${o.offer.id}`, kind: "pipeline", severity: "medium",
      title: `${o.offer.productName}: this offer matches ${n} buyer request${n === 1 ? "" : "s"}`,
      detail: "A supplier offer lines up with open customer requests. Open the request to quote.",
      action: "Open requests", target: "requirements", recordId: o.requests[0].id, weight: 55,
    });
  }

  for (const k of i.kycRecords) {
    if (k.status === "submitted") {
      out.push({
        id: `kyc-submitted:${k.id}`, kind: "compliance", severity: "medium",
        title: "KYC submitted — ready to review",
        detail: "Form submitted; the contact record is pre-filled.",
        action: "Review KYC", target: "kyc", recordId: k.id, weight: 42,
      });
    }
  }

  // Escrow deposit received (new, so it is worth a look) and funds released.
  for (const d of i.deals) {
    if (d.stage === "in_escrow" && d.depositDate) {
      const age = (now - new Date(d.depositDate).getTime()) / DAY;
      if (age >= 0 && age <= RECENT_DEPOSIT_DAYS) {
        out.push({
          id: `deal-deposit:${d.id}`, kind: "pipeline", severity: "medium",
          title: `${d.ref}: escrow deposit received`,
          detail: `${d.depositAmount !== undefined ? `${d.depositAmount.toLocaleString("en-GB")} ${d.currency} · ` : ""}confirm it on the checklist`,
          action: "Open the deal", target: "dealdesk", recordId: d.id, weight: 48,
        });
      }
    }
    if (d.stage === "released") {
      out.push({
        id: `deal-released:${d.id}`, kind: "pipeline", severity: "medium",
        title: `${d.ref}: funds released`,
        detail: "Waiting for the margin to land; record it when it does.",
        action: "Open the deal", target: "dealdesk", recordId: d.id, weight: 49,
      });
    }
  }

  // Supplier prices that are about to stop being valid (approved offers only).
  for (const r of i.pricingRecords) {
    if (r.status !== "approved" || !r.validUntil) continue;
    const left = Math.ceil((new Date(r.validUntil).getTime() - now) / DAY);
    if (left >= 0 && left <= PRICE_EXPIRY_WARN_DAYS) {
      out.push({
        id: `offer-expiry:${r.id}`, kind: "price", severity: left <= 1 ? "high" : "medium",
        title: `Supplier price expiring: ${r.productName}`,
        detail: `${r.supplierName} · valid until ${r.validUntil.slice(0, 10)} (${left === 0 ? "today" : `${left} day(s)`})`,
        action: "Open pricing", target: "pricing", recordId: r.id, weight: 46,
      });
    }
  }

  const due = (date?: string) => !!date && new Date(date).getTime() <= now;
  // v39: a company that is both buyer and supplier is ONE party; the follow-up is written to both
  // records, so key on partyId to raise one notification, not two.
  const seenParty = new Set<string>();
  const followUps: { key: string; name: string; note?: string; target: "customers" | "suppliers"; id: string; date?: string }[] = [
    ...i.customers.map((c) => ({ key: (c as any).partyId ?? c.id, name: c.name, note: c.followUpNote, target: "customers" as const, id: c.id, date: c.followUpDate })),
    ...i.suppliers.map((s) => ({ key: (s as any).partyId ?? s.id, name: s.name, note: s.followUpNote, target: "suppliers" as const, id: s.id, date: s.followUpDate })),
  ];
  for (const f of followUps) {
    if (!due(f.date) || seenParty.has(f.key)) continue;
    seenParty.add(f.key);
    out.push({
      id: `follow-up:${f.key}`, kind: "relationship", severity: "low",
      title: `Follow up: ${f.name}`, detail: f.note || "Follow-up date reached.",
      action: "Open contact", target: f.target, recordId: f.id, weight: 20,
    });
  }
  // Per-person follow-ups (a person's own date and note), opening the company they belong to.
  for (const c of i.contacts ?? []) {
    if (!due(c.followUpDate)) continue;
    const company = i.customers.find((x) => x.id === c.customerId) ?? i.suppliers.find((x) => x.id === c.supplierId);
    const isCustomer = !!c.customerId && !!company;
    out.push({
      id: `follow-up-person:${c.id}`, kind: "relationship", severity: "low",
      title: `Follow up: ${c.firstName} ${c.lastName}${company ? ` (${company.name})` : ""}`,
      detail: c.followUpNote || "Follow-up date reached.",
      action: "Open contact", target: isCustomer ? "customers" : "suppliers", recordId: company?.id ?? c.id, weight: 20,
    });
  }
  return out;
}
