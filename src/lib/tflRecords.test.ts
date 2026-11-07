import { describe, expect, it } from "vitest";
import { compareCells, currencyTile, formatMoney, formatUkDate, sumByCurrency, newRecordDefaults, validateRecord, vatOf, grossOf, balanceOf, isHttpUrl, toHttpUrl } from "./tflRecords";
import { MODULES, MODULE_ORDER } from "@/tfl/model";

describe("tfl module fields", () => {
  it("every select default is one of its options, and every ref points at a real module", () => {
    for (const k of MODULE_ORDER) for (const f of MODULES[k].fields) {
      if (f.type === "select" && f.default !== undefined) expect(f.options).toContain(f.default);
      if (f.type === "select") expect(f.options?.length).toBeGreaterThan(0);
      if (f.ref) expect(MODULES[f.ref]).toBeDefined();
    }
  });
  it("field keys are unique inside a module", () => {
    for (const k of MODULE_ORDER) {
      const keys = MODULES[k].fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
  it("new records start with currency, status and today's dates", () => {
    const q = newRecordDefaults("quotes");
    expect(q.currency).toBe("GBP");
    expect(q.status).toBe("Draft");
    expect(q.vatPct).toBe(20);
    expect(String(q.issued)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("requires the required fields", () => {
    expect(validateRecord("owners", {}).name).toMatch(/required/);
    expect(validateRecord("owners", { name: "A" })).toEqual({});
  });
  it("checks email, phone, url and negative numbers", () => {
    const e = validateRecord("owners", { name: "A", email: "nope", phone: "abc", website: "javascript:alert(1)" });
    expect(Object.keys(e).sort()).toEqual(["email", "phone", "website"]);
    expect(validateRecord("owners", { name: "A", email: "a@b.com", phone: "+971 50 123 4567", website: "example.com" })).toEqual({});
    expect(validateRecord("locations", { name: "L", dayRate: -5 }).dayRate).toMatch(/negative/);
  });
  it("keeps dates in order", () => {
    expect(validateRecord("bookings", { location: "l1", startDate: "2026-12-05", endDate: "2026-12-01" }).endDate).toMatch(/before/);
    expect(validateRecord("bookings", { location: "l1", startDate: "2026-12-01", endDate: "2026-12-01" })).toEqual({});
  });
  it("does not let an invoice be over-paid", () => {
    expect(validateRecord("invoices", { ref: "I1", amount: 100, vatPct: 20, paid: 121 }).paid).toMatch(/more than/);
    expect(validateRecord("invoices", { ref: "I1", amount: 100, vatPct: 20, paid: 120 })).toEqual({});
  });
  it("computes VAT, totals and balance; old records without VAT are unchanged", () => {
    expect(vatOf({ amount: 1000, vatPct: 5 })).toBe(50);
    expect(grossOf({ amount: 1000, vatPct: 5 })).toBe(1050);
    expect(grossOf({ amount: 18000 })).toBe(18000);
    expect(balanceOf({ amount: 1000, vatPct: 5, paid: 400 })).toBe(650);
    expect(balanceOf({ amount: 100, paid: 500 })).toBe(0);
  });
  it("accepts only http(s) links", () => {
    expect(isHttpUrl("https://maps.google.com/x")).toBe(true);
    expect(isHttpUrl("maps.app.goo.gl/abc")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,hi")).toBe(false);
    expect(toHttpUrl("example.com")).toBe("https://example.com");
  });
  it("sorts numbers by value and text naturally, with blanks always last", () => {
    expect(compareCells(9, 10, true, 1)).toBeLessThan(0);
    expect(compareCells(9, 10, true, -1)).toBeGreaterThan(0);
    expect(compareCells("Villa 2", "Villa 10", false, 1)).toBeLessThan(0);
    expect(compareCells("", "A", false, 1)).toBeGreaterThan(0);
    expect(compareCells("", "A", false, -1)).toBeGreaterThan(0);
    expect(compareCells(undefined, undefined, true, 1)).toBe(0);
  });
  it("formats money for the UK and dates day-first", () => {
    expect(formatMoney(12000, "GBP")).toBe("£12,000");
    expect(formatMoney(1250.5, "GBP")).toBe("£1,250.50");
    expect(formatMoney(undefined)).toBe("£0");
    expect(formatMoney(100, "EUR")).toBe("€100");
    expect(formatUkDate("2026-12-05")).toBe("05/12/2026");
    expect(formatUkDate("soon")).toBe("soon");
    expect(formatUkDate(undefined)).toBe("");
  });
  it("totals per currency and never mixes them", () => {
    const sums = sumByCurrency([{ currency: "GBP", a: 100 }, { a: 50 }, { currency: "EUR", a: 40 }], (r) => Number(r.a));
    expect(sums).toEqual({ GBP: 150, EUR: 40 });
    expect(currencyTile(sums)).toEqual({ value: "£150", sub: "+ €40" });
    expect(currencyTile({})).toEqual({ value: "£0", sub: undefined });
  });
});
