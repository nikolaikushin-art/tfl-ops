/**
 * The Film Location CRM — deal maths.
 *
 * Everything here is pure so it can be tested without the UI. TFL trades
 * back-to-back under bond, so there is no import duty, freight or VAT in any
 * figure: the margin is sale - purchase - escrow fees - bank charges - linked
 * expenses. Each currency is kept separate; nothing is silently converted.
 */
import type { Deal, DealStage, Expense } from "@/lib/domain";

export const LIVE_STAGES: DealStage[] = ["agreed", "awaiting_deposit", "in_escrow", "released"];

/** Gross margin before fees: what the client pays minus what the supplier gets. */
export const grossMargin = (d: Deal) => d.salePrice - d.purchasePrice;

/** Expected net margin before deal-linked expenses. */
export const expectedNet = (d: Deal) => grossMargin(d) - d.escrowFees - d.bankCharges;

export const dealExpenses = (d: Deal, expenses: Expense[]) =>
  expenses.filter((e) => e.dealId === d.id && e.currency === d.currency);

/** Net margin after expenses tied to the deal (same currency only). */
export const expectedNetAfterExpenses = (d: Deal, expenses: Expense[]) =>
  expectedNet(d) - dealExpenses(d, expenses).reduce((s, e) => s + e.net, 0);

/** True when funds are with the warehouse but the margin has not been released to us. */
export const isAwaitingRelease = (d: Deal) =>
  d.stage === "in_escrow" || d.stage === "released";

export const CHECKLIST_LABELS: Record<keyof Deal["checklist"], string> = {
  kycApproved: "KYC approved",
  contractSigned: "Contract signed",
  preAdviceReceived: "Pre-advice received",
  depositConfirmed: "Deposit confirmed",
  releaseConfirmed: "Release confirmed",
};

export const missingChecklist = (d: Deal) =>
  (Object.keys(CHECKLIST_LABELS) as (keyof Deal["checklist"])[]).filter((k) => !d.checklist[k]);

/** Sum by currency — never mixes currencies into one number. */
export function sumByCurrency<T>(items: T[], pick: (t: T) => { currency: string; amount: number } | null) {
  const out: Record<string, number> = {};
  for (const it of items) {
    const v = pick(it);
    if (v) out[v.currency] = (out[v.currency] ?? 0) + v.amount;
  }
  return out;
}

/**
 * The entry sent to Xero when the margin is received. Official books treat
 * this as commission income with fees as separate costs, so the net matches
 * the bank line and reconciliation is one click. Entries are drafts.
 */
export function xeroPosting(d: Deal) {
  const net = d.actualMargin ?? expectedNet(d);
  return {
    reference: d.ref,
    trackingCategory: d.ref,
    currency: d.currency,
    status: "DRAFT" as const,
    lines: [
      { account: "Commission income", amount: grossMargin(d) },
      { account: "Escrow / warehouse fees", amount: -d.escrowFees },
      { account: "Bank charges", amount: -d.bankCharges },
    ],
    bankNet: net,
  };
}

export const dealsByStage = (deals: Deal[]) => {
  const out: Partial<Record<DealStage, Deal[]>> = {};
  for (const d of deals) (out[d.stage] ??= []).push(d);
  return out;
};

/** Next free human reference, e.g. RG-2026-016. Never reuses a number even
 *  after a deal has been deleted, because it looks at the highest in use. */
export function nextDealRef(deals: Pick<Deal, "ref">[], year = new Date().getFullYear()): string {
  const re = new RegExp(`^RG-${year}-(\\d+)$`);
  const highest = deals.reduce((m, d) => {
    const hit = d.ref.match(re);
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return `RG-${year}-${String(highest + 1).padStart(3, "0")}`;
}

/** An empty deal with every field the record needs, for "new deal" and
 *  "start deal from quote". Duty status is T2 unless told otherwise. */
export function blankDeal(
  ref: string,
  over: Partial<Omit<Deal, "id" | "createdAt" | "updatedAt">> = {},
): Omit<Deal, "id" | "createdAt" | "updatedAt"> {
  return {
    ref,
    stage: "agreed",
    clientId: "",
    supplierId: "",
    productDescription: "",
    quantity: 0,
    unit: "cases",
    currency: "EUR",
    salePrice: 0,
    purchasePrice: 0,
    escrowFees: 0,
    bankCharges: 0,
    dutyStatus: "T2",
    origin: "",
    goodsLocation: "",
    destination: "",
    checklist: { kycApproved: false, contractSigned: false, preAdviceReceived: false, depositConfirmed: false, releaseConfirmed: false },
    xero: { status: "not_posted" },
    ...over,
  };
}
