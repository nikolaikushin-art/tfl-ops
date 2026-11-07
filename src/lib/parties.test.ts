import { describe, it, expect } from "vitest";
import { buildParties, filterParties, EMPTY_FILTERS, completionRate, buildTimeline, escrowFeeFor, activeFilterCount } from "./parties";
import type { Customer, Supplier, Deal, PricingRecord, CustomerRequirement, Communication } from "./domain";

const cust = (o: Partial<Customer>) => ({ id: "c1", name: "Alpha Trading Ltd", country: "France", status: "active", kycStatus: "approved", tags: [], currency: "EUR", ...o }) as Customer;
const sup = (o: Partial<Supplier>) => ({ id: "s1", name: "Alpha Trading", country: "France", status: "active", tags: [], currency: "EUR", ...o }) as Supplier;
const base = { contacts: [], deals: [], pricingRecords: [], requirements: [], communications: [] };

describe("one directory", () => {
  it("merges a buyer and a supplier of the same company into one party with both roles", () => {
    const p = buildParties({ ...base, customers: [cust({})], suppliers: [sup({})] });
    expect(p).toHaveLength(1);
    expect(p[0].roles).toEqual(expect.arrayContaining(["buyer", "supplier"]));
    expect(p[0].recordIds).toEqual(["c1", "s1"]);
  });
  it("prefers the partyId link over the name", () => {
    const p = buildParties({ ...base, customers: [cust({ partyId: "P1" })], suppliers: [sup({ name: "Totally Different SA", partyId: "P1" })] });
    expect(p).toHaveLength(1);
  });
  it("keeps unrelated companies apart (the v16 bug: a customer showing as a supplier)", () => {
    const p = buildParties({ ...base, customers: [cust({})], suppliers: [sup({ id: "s2", name: "Beta Spirits" })] });
    expect(p).toHaveLength(2);
    expect(p.find((x) => x.name === "Beta Spirits")!.roles).toEqual(["supplier"]);
    expect(p.find((x) => x.name.startsWith("Alpha"))!.roles).toEqual(["buyer"]);
  });
});

describe("filters", () => {
  const parties = buildParties({
    ...base,
    customers: [cust({ id: "c1", name: "Paris Traders", country: "France", extraRoles: ["trader"], tradeTerms: { categories: ["Champagne"] } }), cust({ id: "c2", name: "Berlin Buyer", country: "Germany", tradeTerms: { categories: ["Whisky"] } })],
    suppliers: [],
  });
  it("Suppliers tab: a pure customer never appears, and a two-role company appears once in each tab", () => {
    const parties = buildParties({
      ...base,
      customers: [cust({ id: "c9", name: "Only Buyer GmbH" }), cust({})],
      suppliers: [sup({ id: "s9", name: "Only Supplier SA" }), sup({})],
    });
    const supplierTab = filterParties(parties, { ...EMPTY_FILTERS, tab: "supplier" }).map((p) => p.name);
    const buyerTab = filterParties(parties, { ...EMPTY_FILTERS, tab: "buyer" }).map((p) => p.name);
    expect(supplierTab).not.toContain("Only Buyer GmbH");
    expect(buyerTab).not.toContain("Only Supplier SA");
    expect(supplierTab.filter((n) => n.startsWith("Alpha"))).toHaveLength(1);
    expect(buyerTab.filter((n) => n.startsWith("Alpha"))).toHaveLength(1);
  });
  it("Traders + France + Champagne", () => {
    const r = filterParties(parties, { ...EMPTY_FILTERS, tab: "trader", country: "France", category: "Champagne" });
    expect(r.map((x) => x.name)).toEqual(["Paris Traders"]);
    expect(activeFilterCount({ ...EMPTY_FILTERS, tab: "trader", country: "France", category: "Champagne" })).toBe(2);
  });
  it("tabs: Buyers excludes a pure supplier", () => {
    const p = buildParties({ ...base, customers: [], suppliers: [sup({})] });
    expect(filterParties(p, { ...EMPTY_FILTERS, tab: "buyer" })).toHaveLength(0);
    expect(filterParties(p, { ...EMPTY_FILTERS, tab: "supplier" })).toHaveLength(1);
  });
});

describe("completion rate", () => {
  const deals = [{ id: "d1", stage: "booked", offerId: "o1", requirementId: "r1", clientId: "c1", supplierId: "s1", currency: "EUR", salePrice: 1, createdAt: "2026-01-01" }, { id: "d2", stage: "cancelled", offerId: "o2", clientId: "c1", supplierId: "s1", currency: "EUR", salePrice: 1, createdAt: "2026-01-01" }] as Deal[];
  const offers = [{ id: "o1", supplierId: "s1", status: "approved" }, { id: "o2", supplierId: "s1", status: "approved" }, { id: "o3", supplierId: "s1", status: "rejected" }] as PricingRecord[];
  const reqs = [{ id: "r1", customerId: "c1", status: "quoted" }, { id: "r2", customerId: "c1", status: "lost" }] as CustomerRequirement[];
  it("counts offers + requests that became a live deal; cancelled deals don't count; rejected offers are ignored", () => {
    // offers: o1 (done), o2 (cancelled deal -> not done) = 1/2; requests: r1 (done), r2 = 1/2 -> 2/4
    expect(completionRate(["c1", "s1"], { deals, pricingRecords: offers, requirements: reqs })).toBe(50);
  });
  it("is null, not 100, when there is nothing to measure", () => {
    expect(completionRate(["x"], { deals: [], pricingRecords: [], requirements: [] })).toBeNull();
  });
});

describe("timeline and warehouse terms", () => {
  it("builds a newest-first timeline from mail and deals", () => {
    const comms = [{ id: "m1", channel: "email", direction: "inbound", subject: "Offer", body: "hello", customerId: "c1", occurredAt: "2026-09-01" }, { id: "m2", channel: "whatsapp", direction: "outbound", body: "ok", customerId: "c9", occurredAt: "2026-09-02" }] as Communication[];
    const deals = [{ id: "d1", ref: "RG-1", clientId: "c1", supplierId: "x", productDescription: "JWB", createdAt: "2026-09-03" }] as Deal[];
    const t = buildTimeline({ recordIds: ["c1"] }, { communications: comms, deals, documents: [] });
    expect(t.map((x) => x.id)).toEqual(["d:d1", "c:m1"]);
  });
  it("derives the escrow fee from the warehouse's terms", () => {
    expect(escrowFeeFor({ warehouse: { escrowFeePct: 0.5, escrowFeeFlat: 150 } }, 100000)).toBe(650);
    expect(escrowFeeFor(undefined, 100000)).toBe(0);
  });
});
