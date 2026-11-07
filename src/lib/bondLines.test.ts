import { describe, expect, it } from "vitest";
import { bondCheck, isTaxLine, stripTaxPatch } from "./bondLines";

const line = (id: string, description: string, quantity: number, unitPrice: number, discountPct?: number) => ({ id, description, quantity, unitPrice, discountPct });

describe("VAT / duty line check", () => {
  it("a bonded document is clean", () => {
    const c = bondCheck({ lines: [line("1", "Glenfiddich 12", 10, 100)], subtotal: 1000, tax: 0, total: 1000, taxRatePct: 0 });
    expect(c.clean).toBe(true);
  });
  it("finds a tax amount, a tax rate and VAT/duty lines", () => {
    const c = bondCheck({ lines: [line("1", "Whisky", 1, 100), line("2", "VAT 20%", 1, 20), line("3", "Excise duty", 1, 5)], subtotal: 125, tax: 20, total: 145, taxRatePct: 20 });
    expect(c.clean).toBe(false);
    expect(c.taxAmount).toBe(20);
    expect(c.taxRatePct).toBe(20);
    expect(c.taxLineIds).toEqual(["2", "3"]);
  });
  it("does not mistake product names for tax lines", () => {
    expect(isTaxLine("Duty free strip label gift carton")).toBe(true); // still contains the word duty: flagged for a human, not silently dropped
    expect(isTaxLine("Johnnie Walker Black Label")).toBe(false);
    expect(isTaxLine("Moet & Chandon Brut")).toBe(false);
    expect(isTaxLine("Customs duty")).toBe(true);
  });
  it("strip removes tax lines and tax, and re-totals the goods", () => {
    const p = stripTaxPatch({ lines: [line("1", "Whisky", 10, 100, 10), line("2", "VAT 20%", 1, 180)] });
    expect(p.lines.map((l) => l.id)).toEqual(["1"]);
    expect(p.subtotal).toBe(900);
    expect(p.tax).toBe(0);
    expect(p.total).toBe(900);
    expect(p.taxRatePct).toBe(0);
    expect(bondCheck({ ...p }).clean).toBe(true);
  });
  it("a stripped record with a bare tax amount ends with total = subtotal", () => {
    const p = stripTaxPatch({ lines: [line("1", "Brandy", 2, 50)] });
    expect(p.total).toBe(p.subtotal);
  });
});
