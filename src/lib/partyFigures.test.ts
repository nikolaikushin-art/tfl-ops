import { describe, expect, it } from "vitest";
import type { Customer, Deal, Supplier } from "./domain";
import { buildParties, figuresForRecord } from "./parties";
import { figuresFor, formatByCurrency, isRealDeal, sumByCurrency } from "./partyFigures";

const deal = (o: Partial<Deal>): Deal =>
  ({
    id: "d?", ref: "R", stage: "released", clientId: "c1", supplierId: "s1", currency: "EUR",
    salePrice: 100_000, purchasePrice: 97_000, escrowFees: 500, bankCharges: 100,
    createdAt: "2026-05-01T00:00:00Z", updatedAt: "2026-05-01T00:00:00Z", ...o,
  }) as Deal;

describe("figuresFor", () => {
  it("counts deals and sums volume per currency without mixing", () => {
    const f = figuresFor(["c1"], [
      deal({ id: "a", salePrice: 100_000 }),
      deal({ id: "b", salePrice: 50_000 }),
      deal({ id: "c", salePrice: 30_000, currency: "USD" }),
    ]);
    expect(f.deals).toBe(3);
    expect(f.volume).toEqual({ EUR: 150_000, USD: 30_000 });
  });

  it("leaves out cancelled deals and deals still waiting for approval", () => {
    const f = figuresFor(["c1"], [
      deal({ id: "a" }),
      deal({ id: "b", stage: "cancelled" }),
      deal({ id: "c", pendingApproval: true }),
    ]);
    expect(f.deals).toBe(1);
    expect(f.volume).toEqual({ EUR: 100_000 });
    expect(isRealDeal(deal({ pendingApproval: true }))).toBe(false);
  });

  it("separates what a company bought from TFL and what TFL bought from it", () => {
    const deals = [deal({ id: "a", clientId: "x", supplierId: "t" }), deal({ id: "b", clientId: "t", supplierId: "y", salePrice: 80_000, purchasePrice: 76_000 })];
    const trader = figuresFor(["t"], deals);
    expect(trader.soldTo).toEqual({ EUR: 80_000 });
    expect(trader.boughtFrom).toEqual({ EUR: 97_000 });
    expect(trader.deals).toBe(2);
  });

  it("uses margin actually received, not a forecast", () => {
    const f = figuresFor(["c1"], [deal({ id: "a", actualMargin: 2_400 }), deal({ id: "b" })]);
    expect(f.netMargin).toEqual({ EUR: 2_400 });
  });

  it("covers every record id of a company and counts a deal once", () => {
    // Same company held as a customer record (c1) and a supplier record (s1), on one deal.
    const f = figuresFor(["c1", "s1"], [deal({ id: "a", clientId: "c1", supplierId: "s1" })]);
    expect(f.deals).toBe(1);
    expect(f.volume).toEqual({ EUR: 100_000 });
  });

  it("returns empty figures for a company with no deals", () => {
    const f = figuresFor(["nobody"], [deal({})]);
    expect(f).toMatchObject({ deals: 0, volume: {}, lastDeal: undefined });
    expect(formatByCurrency(f.volume)).toBe("—");
  });
});

describe("one calculation on every screen", () => {
  const customers = [{ id: "c1", name: "Nordisk Hotels", status: "active", kycStatus: "none", country: "Denmark", currency: "EUR" } as unknown as Customer];
  const suppliers = [{ id: "s1", name: "Highland Spirits", status: "active", country: "UK", currency: "GBP" } as unknown as Supplier];
  const deals = [deal({ id: "a", salePrice: 120_000, actualMargin: 3_000 }), deal({ id: "b", currency: "USD", salePrice: 40_000 }), deal({ id: "x", stage: "cancelled" })];

  it("the Contacts directory row equals the detail-screen calculation", () => {
    const parties = buildParties({ customers, suppliers, contacts: [], deals, pricingRecords: [], requirements: [], communications: [] });
    const row = parties.find((p) => p.name === "Nordisk Hotels")!;
    const detail = figuresFor(row.recordIds, deals);
    expect(row.deals).toBe(detail.deals);
    expect(row.volume).toEqual(detail.volume);
    expect(row.netMargin).toEqual(detail.netMargin);
    expect(formatByCurrency(row.volume)).toBe(formatByCurrency(detail.volume));
    expect(row.volume).toEqual({ EUR: 120_000, USD: 40_000 });
  });

  it("a customer who is also a supplier shows the same figures from either record", () => {
    const both = [{ ...customers[0], partyId: "p" }] as Customer[];
    const sup = [{ id: "s9", name: "Nordisk Hotels", status: "active", country: "Denmark", partyId: "p", currency: "EUR" } as unknown as Supplier];
    const ds = [deal({ id: "a", clientId: "c1", supplierId: "other" }), deal({ id: "b", clientId: "other", supplierId: "s9", salePrice: 10_000, purchasePrice: 9_000 })];
    const parties = buildParties({ customers: both, suppliers: sup, contacts: [], deals: ds, pricingRecords: [], requirements: [], communications: [] });
    const p = parties.filter((x) => x.recordIds.includes("c1"));
    expect(p).toHaveLength(1);
    expect(figuresFor(p[0].recordIds, ds).deals).toBe(2);
    expect(p[0].deals).toBe(2);
  });
});

describe("figuresForRecord (what Mail, WhatsApp, Orders and the lists call)", () => {
  const customers = [{ id: "c1", name: "Nordisk Hotels", status: "active", country: "Denmark", currency: "EUR", partyId: "p", totalRevenue: 999_999 } as unknown as Customer];
  const suppliers = [{ id: "s9", name: "Nordisk Hotels", status: "active", country: "Denmark", currency: "EUR", partyId: "p" } as unknown as Supplier];
  const deals = [
    deal({ id: "a", clientId: "c1", supplierId: "other", salePrice: 120_000 }),
    deal({ id: "b", clientId: "c1", supplierId: "other", currency: "USD", salePrice: 40_000 }),
    deal({ id: "c", clientId: "other", supplierId: "s9", salePrice: 10_000, purchasePrice: 9_000 }),
  ];
  const parties = buildParties({ customers, suppliers, contacts: [], deals, pricingRecords: [], requirements: [], communications: [] });

  it("gives the same figures from the customer record and the supplier record of one company", () => {
    expect(figuresForRecord("c1", parties, deals)).toEqual(figuresForRecord("s9", parties, deals));
  });
  it("matches the directory row exactly and ignores the static seed totalRevenue", () => {
    const row = parties.find((p) => p.recordIds.includes("c1"))!;
    const f = figuresForRecord("c1", parties, deals);
    expect(f.soldTo).toEqual({ EUR: 120_000, USD: 40_000 });
    expect(f.boughtFrom).toEqual({ EUR: 9_000 });
    expect(f.volume).toEqual(row.volume);
    expect(JSON.stringify(f)).not.toContain("999999");
  });
  it("an unknown record id gives empty figures rather than throwing", () => {
    expect(figuresForRecord("nope", parties, deals).deals).toBe(0);
  });
});

describe("sumByCurrency / formatByCurrency", () => {
  it("keeps currencies apart and orders by currency code, not amount", () => {
    const m = sumByCurrency([{ c: "EUR", a: 5 }, { c: "USD", a: 90 }, { c: "EUR", a: 10 }], (r) => r.c, (r) => r.a);
    expect(m).toEqual({ EUR: 15, USD: 90 });
    expect(formatByCurrency(m)).toBe("€15 · US$90");
  });
});
