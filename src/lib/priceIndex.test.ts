import { describe, expect, it } from "vitest";
import { priceCurve, priceCurves, priceMoves, supplierSpread, FLAT_BAND_PCT } from "./priceIndex";
import type { FxTable } from "./fx";
import type { PricingRecord, Product } from "./domain";

const NOW = new Date("2026-03-01T00:00:00Z");

const product = (over: Partial<Product> = {}): Product => ({
  id: "p1",
  sku: "SKU-1",
  name: "Reserve Blend Whisky 70cl",
  unit: "case",
  currency: "GBP",
  supplierIds: [],
  tags: [],
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

let seq = 0;
const offer = (over: Partial<PricingRecord> = {}): PricingRecord => {
  seq += 1;
  return {
    id: `offer-${seq}`,
    productId: "p1",
    productName: "Reserve Blend Whisky 70cl",
    supplierId: "s1",
    supplierName: "Supplier A",
    unitPrice: 100,
    currency: "GBP",
    source: "manual",
    status: "approved",
    extractedAt: "2026-02-01T00:00:00Z",
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    ...over,
  };
};

const fx: FxTable = { base: "GBP", rates: [{ currency: "USD", perBase: 1.27, asOf: "2026-02-25T00:00:00Z" }] };

describe("priceCurve", () => {
  it("does not flag a supplier's own earlier, cheaper quote as 'a cheaper supplier available'", () => {
    // The single-supplier edge case: same supplier quotes £10, then re-quotes
    // £12 two months later. Historically this rendered "Supplier A is at £10
    // against Supplier A at £12" — nonsensical, since it's just price drift.
    const records = [
      offer({ supplierId: "s1", supplierName: "Supplier A", unitPrice: 10, extractedAt: "2026-01-01T00:00:00Z" }),
      offer({ supplierId: "s1", supplierName: "Supplier A", unitPrice: 12, extractedAt: "2026-02-25T00:00:00Z" }),
    ];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", now: NOW });
    expect(curve.latest?.unitPrice).toBe(12);
    // best is the supplier's own current standing quote (£12), not their stale £10 history.
    expect(curve.best?.unitPrice).toBe(12);
    expect(curve.betterSupplierAvailable).toBe(false);
  });

  it("flags a genuinely different, cheaper, live supplier as available", () => {
    const records = [
      offer({ supplierId: "s2", supplierName: "Supplier B", unitPrice: 9, extractedAt: "2026-02-10T00:00:00Z" }),
      offer({ supplierId: "s1", supplierName: "Supplier A", unitPrice: 12, extractedAt: "2026-02-25T00:00:00Z" }),
    ];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", now: NOW });
    expect(curve.latest?.supplierName).toBe("Supplier A");
    expect(curve.betterSupplierAvailable).toBe(true);
    expect(curve.best?.supplierName).toBe("Supplier B");
    expect(curve.best?.unitPrice).toBe(9);
  });

  it("never points 'best' at an approved-but-expired offer", () => {
    const records = [
      offer({
        supplierId: "s1",
        supplierName: "Supplier A",
        unitPrice: 8,
        extractedAt: "2026-01-05T00:00:00Z",
        validUntil: "2026-01-31T00:00:00Z", // expired before NOW
      }),
      offer({ supplierId: "s2", supplierName: "Supplier B", unitPrice: 11, extractedAt: "2026-02-15T00:00:00Z" }),
    ];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", now: NOW });
    // Supplier A's £8 is cheapest ever seen but expired — must not win "best".
    expect(curve.best?.supplierName).toBe("Supplier B");
    expect(curve.best?.unitPrice).toBe(11);
  });

  it("returns best: null when every standing offer has expired", () => {
    const records = [
      offer({
        supplierId: "s1",
        supplierName: "Supplier A",
        unitPrice: 8,
        extractedAt: "2026-01-05T00:00:00Z",
        validUntil: "2026-01-31T00:00:00Z",
      }),
    ];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", now: NOW });
    expect(curve.latest).not.toBeNull();
    expect(curve.best).toBeNull();
    expect(curve.betterSupplierAvailable).toBe(false);
  });

  it("degrades gracefully with no price history at all", () => {
    const curve = priceCurve(product(), [], fx, { currency: "GBP", now: NOW });
    expect(curve.observations).toHaveLength(0);
    expect(curve.latest).toBeNull();
    expect(curve.best).toBeNull();
    expect(curve.mean).toBeNull();
    expect(curve.volatilityPct).toBeNull();
    expect(curve.direction).toBe("unknown");
    expect(curve.betterSupplierAvailable).toBe(false);
  });

  it("degrades gracefully with a single observation (single supplier, no history)", () => {
    const records = [offer({ unitPrice: 15, extractedAt: "2026-02-20T00:00:00Z" })];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", now: NOW });
    expect(curve.observations).toHaveLength(1);
    expect(curve.latest?.unitPrice).toBe(15);
    expect(curve.best?.unitPrice).toBe(15);
    expect(curve.direction).toBe("unknown"); // one point is a price, not a trend
    expect(curve.volatilityPct).toBeNull();
    expect(curve.betterSupplierAvailable).toBe(false);
  });

  it("excludes observations with no FX rate rather than assuming parity", () => {
    const records = [
      offer({ unitPrice: 100, currency: "EUR", extractedAt: "2026-02-10T00:00:00Z" }), // no EUR rate in fx
      offer({ unitPrice: 100, currency: "GBP", extractedAt: "2026-02-20T00:00:00Z" }),
    ];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", now: NOW });
    expect(curve.excluded).toBe(1);
    expect(curve.observations).toHaveLength(1);
  });

  it("only includes observations inside the requested window", () => {
    const records = [
      offer({ unitPrice: 20, extractedAt: "2025-06-01T00:00:00Z" }), // outside a 90-day window from NOW
      offer({ unitPrice: 22, extractedAt: "2026-02-20T00:00:00Z" }),
    ];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", windowDays: 90, now: NOW });
    expect(curve.observations).toHaveLength(1);
    expect(curve.observations[0].unitPrice).toBe(22);
  });

  it("only draws a direction once the move clears the flat band", () => {
    const records = [
      offer({ unitPrice: 100, extractedAt: "2026-01-01T00:00:00Z" }),
      offer({ unitPrice: 100 * (1 + (FLAT_BAND_PCT - 0.5) / 100), extractedAt: "2026-02-20T00:00:00Z" }),
    ];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", now: NOW });
    expect(curve.direction).toBe("flat");
  });
});

describe("priceCurves", () => {
  it("sorts products by how many observations they have", () => {
    const productA = product({ id: "pA", name: "A" });
    const productB = product({ id: "pB", name: "B" });
    const records = [
      offer({ productId: "pA", productName: "A", extractedAt: "2026-02-01T00:00:00Z" }),
      offer({ productId: "pB", productName: "B", extractedAt: "2026-02-01T00:00:00Z" }),
      offer({ productId: "pB", productName: "B", extractedAt: "2026-02-10T00:00:00Z" }),
    ];
    const curves = priceCurves([productA, productB], records, fx, { currency: "GBP", now: NOW });
    expect(curves[0].productId).toBe("pB");
  });
});

describe("priceMoves", () => {
  it("only surfaces an alternative when a cheaper live supplier genuinely exists", () => {
    const records = [
      offer({ supplierId: "s1", supplierName: "Supplier A", unitPrice: 100, extractedAt: "2026-01-01T00:00:00Z" }),
      offer({ supplierId: "s1", supplierName: "Supplier A", unitPrice: 120, extractedAt: "2026-02-20T00:00:00Z" }),
    ];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", now: NOW });
    const [move] = priceMoves([curve], 5);
    expect(move.direction).toBe("rising");
    // Same supplier both ends — no alternative should be surfaced.
    expect(move.alternative).toBeUndefined();
  });
});

describe("supplierSpread", () => {
  it("marks an expired standing quote as no longer live and does not use it as the cheapest baseline", () => {
    const records = [
      offer({
        supplierId: "s1",
        supplierName: "Supplier A",
        unitPrice: 8,
        extractedAt: "2026-01-05T00:00:00Z",
        validUntil: "2026-01-31T00:00:00Z",
      }),
      offer({ supplierId: "s2", supplierName: "Supplier B", unitPrice: 11, extractedAt: "2026-02-15T00:00:00Z" }),
    ];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", now: NOW });
    const spread = supplierSpread(curve);
    const a = spread.find((r) => r.supplierName === "Supplier A")!;
    const b = spread.find((r) => r.supplierName === "Supplier B")!;
    expect(a.live).toBe(false);
    expect(b.live).toBe(true);
    // Live Supplier B (£11) is the baseline, not expired Supplier A (£8).
    expect(b.vsBestPct).toBe(0);
    expect(a.vsBestPct).toBeLessThan(0);
  });

  it("degrades gracefully with a single supplier", () => {
    const records = [offer({ unitPrice: 15, extractedAt: "2026-02-20T00:00:00Z" })];
    const curve = priceCurve(product(), records, fx, { currency: "GBP", now: NOW });
    const spread = supplierSpread(curve);
    expect(spread).toHaveLength(1);
    expect(spread[0].vsBestPct).toBe(0);
    expect(spread[0].live).toBe(true);
  });
});
