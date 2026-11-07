import { describe, expect, it } from "vitest";
import { buildXeroEntry, canPost, mappingGaps, EMPTY_MAPPING, unmappedExpenseCategories, type XeroMapping } from "./xeroMapping";
import { blankDeal } from "./deals";
import type { Deal } from "./domain";

const mapped: XeroMapping = {
  commissionIncome: { code: "200", name: "Commission income" },
  escrowFees: { code: "412", name: "Escrow / warehouse fees" },
  bankCharges: { code: "404", name: "Bank charges" },
  fxGainLoss: { code: "810", name: "FX gain / loss" },
  expenses: { travel: { code: "493", name: "Travel" } },
};
// Roni's example: client pays 100,000, supplier receives 97,000, fees 500 + 100.
const deal = (o: Partial<Deal> = {}): Deal => ({
  ...blankDeal("RG-2026-001", { salePrice: 100000, purchasePrice: 97000, escrowFees: 500, bankCharges: 100, currency: "EUR", marginReceivedDate: "2026-10-01" }),
  id: "d1", createdAt: "", updatedAt: "", ...o,
}) as Deal;

describe("xero entry", () => {
  it("posts commission with fees and bank charges separate, equal to the bank net", () => {
    const e = buildXeroEntry(deal(), mapped);
    expect(e.lines.map((l) => [l.code, l.amount])).toEqual([["200", 3000], ["412", -500], ["404", -100]]);
    expect(e.bankNet).toBe(2400);
    expect(e.status).toBe("DRAFT");
    expect(e.trackingCategory).toBe("RG-2026-001");
    expect(e.currency).toBe("EUR");
    expect(canPost(e)).toBe(true);
  });
  it("is blocked until the accounts are agreed (codes filled in)", () => {
    expect(mappingGaps(EMPTY_MAPPING)).toHaveLength(3);
    const e = buildXeroEntry(deal(), EMPTY_MAPPING);
    expect(canPost(e)).toBe(false);
    expect(e.blockers[0]).toMatch(/Commission income/);
  });
  it("is blocked before the margin is received, and for cancelled deals", () => {
    expect(canPost(buildXeroEntry(deal({ marginReceivedDate: undefined }), mapped))).toBe(false);
    expect(canPost(buildXeroEntry(deal({ stage: "cancelled" }), mapped))).toBe(false);
  });
  it("a difference to what was expected goes to FX gain/loss with a warning, and the lines still equal the bank", () => {
    const e = buildXeroEntry(deal({ actualMargin: 2350 }), mapped);
    const fx = e.lines.find((l) => l.kind === "fx");
    expect(fx?.amount).toBe(-50);
    expect(e.bankNet).toBe(2350);
    expect(e.warnings.join(" ")).toMatch(/short payment/);
    expect(canPost(e)).toBe(true);
    expect(canPost(buildXeroEntry(deal({ actualMargin: 2350 }), { ...mapped, fxGainLoss: { code: "", name: "FX" } }))).toBe(false);
  });
  it("lists the deal's documents as attachments, only its own", () => {
    const e = buildXeroEntry(deal(), mapped, [{ name: "a.pdf", dealId: "d1" }, { name: "b.pdf", dealId: "other" }]);
    expect(e.attachments).toEqual(["a.pdf"]);
    expect(buildXeroEntry(deal(), mapped, []).warnings.join(" ")).toMatch(/No documents/);
  });
  it("finds expense categories without a Xero code", () => {
    expect(unmappedExpenseCategories(mapped, ["travel", "software", "software"])).toEqual(["software"]);
  });
});
