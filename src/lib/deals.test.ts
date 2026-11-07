import { describe, it, expect } from "vitest";
import { expectedNet, expectedNetAfterExpenses, xeroPosting, sumByCurrency } from "@/lib/deals";
import type { Deal, Expense } from "@/lib/domain";

const deal = {
  id: "d1", ref: "RG-T-1", stage: "in_escrow", clientId: "c", supplierId: "s",
  productDescription: "x", quantity: 1, unit: "case", currency: "EUR",
  salePrice: 100000, purchasePrice: 97000, escrowFees: 400, bankCharges: 100,
  dutyStatus: "T2", origin: "UK", goodsLocation: "NL", destination: "FR",
  checklist: { kycApproved: true, contractSigned: true, preAdviceReceived: true, depositConfirmed: true, releaseConfirmed: false },
  xero: { status: "not_posted" }, createdAt: "", updatedAt: "",
} as Deal;

describe("deal maths", () => {
  it("matches Roni's example: 100k in, 97k out, 3k gross", () => {
    expect(expectedNet(deal)).toBe(2500);
  });
  it("linked expenses reduce margin, same currency only", () => {
    const ex = [
      { id: "e1", dealId: "d1", currency: "EUR", net: 200 },
      { id: "e2", dealId: "d1", currency: "GBP", net: 999 },
    ] as Expense[];
    expect(expectedNetAfterExpenses(deal, ex)).toBe(2300);
  });
  it("posts commission with fees as separate costs that sum to the bank net", () => {
    const p = xeroPosting(deal);
    expect(p.lines.reduce((s, l) => s + l.amount, 0)).toBe(p.bankNet);
    expect(p.status).toBe("DRAFT");
  });
  it("never mixes currencies", () => {
    const t = sumByCurrency([deal, { ...deal, currency: "USD" }], (d) => ({ currency: d.currency, amount: expectedNet(d) }));
    expect(t).toEqual({ EUR: 2500, USD: 2500 });
  });
});
