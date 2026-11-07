import { describe, it, expect } from "vitest";
import { parseSheetRows, parseCsv } from "./offerImport";
import { deriveStage, matchRequest, findProduct } from "./requests";
import type { CustomerRequirement, PricingRecord, Product, Quotation } from "./domain";

const jwb = { id: "p-jwb", name: "Johnnie Walker Black Label 12 Year Old 1L", sku: "JWB", unit: "case", currency: "EUR",
  supplierIds: [], tags: [], isActive: true, createdAt: "", updatedAt: "", aliases: ["JWB 12x1L"] } as Product;
const offer = { id: "o1", productId: "p-jwb", productName: jwb.name, supplierName: "A", unitPrice: 300, currency: "EUR",
  status: "approved", extractedAt: "2026-10-01", validUntil: "2027-01-01" } as PricingRecord;
const req = (o: Partial<CustomerRequirement> = {}) =>
  ({ id: "r1", customerId: "c1", productName: "JWB 12x1L", status: "open", matchedSupplierIds: [], ...o }) as CustomerRequirement;

describe("customer request lists (Excel / CSV)", () => {
  const rows = [
    ["Request list - Nordic Imports"],
    ["Product", "Qty (cases)", "Target price EUR"],
    ["JWB 12x1L", 500, 295],
    ["WHISKY", "", ""],
    ["Unknown Rare Cask 70cl", 20, ""],
  ];
  it("reads rows with a quantity but no price, skipping section headings", () => {
    const { lines } = parseSheetRows(rows);
    expect(lines.map((l) => l.product)).toEqual(["JWB 12x1L", "Unknown Rare Cask 70cl"]);
    expect(lines[0].quantity).toBe(500);
    expect(lines[0].unitPrice).toBe(295);
    expect(lines[0].currency).toBe("EUR");
    expect(lines[1].unitPrice).toBeUndefined();
  });
  it("reads a semicolon CSV the same way", () => {
    const csv = "Product;Quantity;Target price\nJWB 12x1L;500;295\n";
    const { lines } = parseSheetRows(parseCsv(csv));
    expect(lines[0].quantity).toBe(500);
  });
  it("matches a row to the catalogue by alias", () => {
    expect(findProduct("JWB 12x1L", [jwb])?.product.id).toBe("p-jwb");
    expect(findProduct("Unknown Rare Cask 70cl", [jwb])).toBeNull();
  });
});

describe("request lifecycle", () => {
  const data = { products: [jwb], pricingRecords: [offer] };
  const now = new Date("2026-10-04").getTime();
  it("is New with no match and Matched once an offer covers it", () => {
    const none = matchRequest(req({ productName: "Unknown Rare Cask 70cl" }), data, now);
    expect(deriveStage(req({ productName: "Unknown Rare Cask 70cl" }), none, [])).toBe("new");
    const hit = matchRequest(req(), data, now);
    expect(deriveStage(req(), hit, [])).toBe("matched");
  });
  it("is Quoted once a quote made from it is sent, but not while only a draft", () => {
    const hit = matchRequest(req(), data, now);
    const q = (status: Quotation["status"]) => [{ id: "q1", requirementId: "r1", status }] as Quotation[];
    expect(deriveStage(req(), hit, q("draft"))).toBe("matched");
    expect(deriveStage(req(), hit, q("sent"))).toBe("quoted");
  });
  it("won and lost are decisions and are never overridden", () => {
    const hit = matchRequest(req(), data, now);
    expect(deriveStage(req({ status: "won" }), hit, [])).toBe("won");
    expect(deriveStage(req({ status: "lost" }), hit, [])).toBe("lost");
  });
});
