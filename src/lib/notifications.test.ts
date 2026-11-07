import { describe, expect, it } from "vitest";
import { buildTradeNotifications } from "./notifications";
import { blankDeal } from "./deals";
import type { Deal, PricingRecord } from "./domain";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const base = { customers: [], suppliers: [], kycRecords: [], requirements: [], now: NOW };
const deal = (over: Partial<Deal>): Deal => ({ ...blankDeal("RG-2026-001", { currency: "EUR" }), id: "d1", createdAt: "", updatedAt: "", ...over }) as Deal;
const offer = (over: Partial<PricingRecord>): PricingRecord => ({ id: "p1", productName: "JW Black 12x1L", supplierName: "Acme", unitPrice: 10, currency: "EUR", source: "email", status: "approved", extractedAt: "", createdAt: "", updatedAt: "", ...over }) as PricingRecord;
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("trade notifications (v25 additions)", () => {
  it("escrow deposit received appears for a fresh deposit, not an old one", () => {
    const fresh = buildTradeNotifications({ ...base, deals: [deal({ stage: "in_escrow", depositDate: "2026-10-04" })], pricingRecords: [] });
    expect(ids(fresh)).toContain("deal-deposit:d1");
    const old = buildTradeNotifications({ ...base, deals: [deal({ stage: "in_escrow", depositDate: "2026-09-01" })], pricingRecords: [] });
    expect(ids(old)).not.toContain("deal-deposit:d1");
    expect(ids(old)).toContain("deal-escrow:d1");
  });
  it("funds released", () => {
    expect(ids(buildTradeNotifications({ ...base, deals: [deal({ stage: "released" })], pricingRecords: [] }))).toContain("deal-released:d1");
  });
  it("supplier price expiring soon (approved only, not expired, not far off)", () => {
    const n = (r: PricingRecord) => ids(buildTradeNotifications({ ...base, deals: [], pricingRecords: [r] }));
    expect(n(offer({ validUntil: "2026-10-06" }))).toContain("offer-expiry:p1");
    expect(n(offer({ validUntil: "2026-10-30" }))).not.toContain("offer-expiry:p1");
    expect(n(offer({ validUntil: "2026-10-01" }))).not.toContain("offer-expiry:p1");
    expect(n(offer({ validUntil: "2026-10-06", status: "pending_review" }))).not.toContain("offer-expiry:p1");
  });
});

import { buildTradeNotifications as _b } from "./notifications";
describe("accepted quote", () => {
  it("raises a potential-deal notification until a deal exists", () => {
    const base = { deals: [], customers: [{ id: "c1", name: "Acme" }], suppliers: [], kycRecords: [], pricingRecords: [], requirements: [] } as any;
    const open = _b({ ...base, quotations: [{ id: "q1", number: "Q-1", status: "accepted", customerId: "c1" }] });
    expect(open.some((n) => n.id === "quote-accepted:q1" && /potential deal/.test(n.title))).toBe(true);
    const done = _b({ ...base, quotations: [{ id: "q1", number: "Q-1", status: "accepted", customerId: "c1", dealId: "d1" }] });
    expect(done.some((n) => n.id === "quote-accepted:q1")).toBe(false);
  });
});

describe("v39: every notification kind Roni listed fires", () => {
  const b = (over: any) => buildTradeNotifications({ ...base, deals: [], pricingRecords: [], quotations: [], ...over } as any);
  it("request with match fires for the v38 'matched' status and the legacy 'matching' one, not for 'new'", () => {
    const r = (status: string) => ({ id: "r1", customerId: "c1", productName: "Tequila", status, matchedSupplierIds: ["s1"] });
    expect(ids(b({ requirements: [r("matched")] }))).toContain("request-match:r1");
    expect(ids(b({ requirements: [r("matching")] }))).toContain("request-match:r1");
    expect(ids(b({ requirements: [r("new")] }))).not.toContain("request-match:r1");
    expect(ids(b({ requirements: [r("quoted")] }))).not.toContain("request-match:r1");
  });
  it("new supplier offer, KYC submitted and follow-up due", () => {
    expect(ids(b({ pricingRecords: [offer({ status: "pending_review" })] }))).toContain("offer-review:p1");
    expect(ids(b({ kycRecords: [{ id: "k1", status: "submitted" }] }))).toContain("kyc-submitted:k1");
    expect(ids(b({ customers: [{ id: "c1", name: "A", followUpDate: "2026-10-01" }] }))).toContain("follow-up:c1");
    expect(ids(b({ suppliers: [{ id: "s1", name: "S", followUpDate: "2026-12-01" }] }))).not.toContain("follow-up:s1");
  });
});

describe("v39: follow-up is one notification per company", () => {
  it("a buyer+supplier company with the date on both records raises one notification", () => {
    const n = buildTradeNotifications({ ...base, deals: [], pricingRecords: [], quotations: [],
      customers: [{ id: "c1", name: "Trader Ltd", partyId: "p1", followUpDate: "2026-10-01" }],
      suppliers: [{ id: "s1", name: "Trader Ltd", partyId: "p1", followUpDate: "2026-10-01" }] } as any);
    expect(n.filter((x) => x.id.startsWith("follow-up:")).length).toBe(1);
  });
  it("a new offer that matches open buyer requests raises one alert with the count", () => {
    const req = (id: string, status = "new") => ({ id, productName: "JW Black 12x1L", status } as any);
    const out = buildTradeNotifications({
      ...base, deals: [], pricingRecords: [offer({ status: "pending_review" })],
      requirements: [req("r1"), req("r2"), req("r3"), req("r4", "won")],
    });
    const n = out.find((x) => x.id === "offer-matches:p1")!;
    expect(n).toBeDefined();
    expect(n.title).toContain("matches 3 buyer requests");
  });
  it("no alert when no open request matches", () => {
    const out = buildTradeNotifications({ ...base, deals: [], pricingRecords: [offer({ status: "pending_review" })], requirements: [{ id: "r1", productName: "Moet Imperial 6x75cl", status: "new" } as any] });
    expect(ids(out)).not.toContain("offer-matches:p1");
  });
});
