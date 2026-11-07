import { describe, expect, it } from "vitest";
import { PRIMARY_COMPANY_ID, addCompany, belongsTo, inCompany, paymentsFor, setFinancialYearStart, validateCompany, withPrimary } from "./companies";

describe("companies", () => {
  it("records without a company belong to the primary one", () => {
    expect(belongsTo({}, PRIMARY_COMPANY_ID)).toBe(true);
    expect(belongsTo({ companyId: "uae" }, PRIMARY_COMPANY_ID)).toBe(false);
    expect(inCompany([{ id: 1 }, { id: 2, companyId: "uae" }], "uae")).toEqual([{ id: 2, companyId: "uae" }]);
  });
  it("payments follow the invoice or expense they settle", () => {
    const p = [{ invoiceId: "i1" }, { expenseId: "e2" }, { invoiceId: "i9" }];
    expect(paymentsFor(p, [{ id: "i1" }], [{ id: "e2" }])).toHaveLength(2);
  });
  it("validates name, currency and month", () => {
    const base = withPrimary(null);
    expect(validateCompany({ name: "", baseCurrency: "AED" }, base)).toHaveLength(1);
    expect(validateCompany({ name: "the film location", baseCurrency: "AED" }, base).join()).toContain("already exists");
    expect(validateCompany({ name: "Acme Studios", baseCurrency: "DIRHAM" }, base).join()).toContain("3-letter");
    expect(validateCompany({ name: "Acme Studios", baseCurrency: "AED", financialYearStartMonth: 13 }, base)).toHaveLength(1);
    expect(validateCompany({ name: "Acme Studios", baseCurrency: "aed" }, base)).toEqual([]);
  });
  it("adds a company with its own currency and a separate, unconnected Xero", () => {
    const list = addCompany(withPrimary(null), { name: "Acme Studios", baseCurrency: "aed", country: "UAE" });
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ id: "acme-studios", baseCurrency: "AED", xero: { status: "not_connected" } });
    expect(addCompany(list, { name: "Acme Studios", baseCurrency: "AED" })).toHaveLength(2);
  });
  it("the primary is always present and first", () => {
    const list = withPrimary([{ id: "x", name: "X", baseCurrency: "EUR", financialYearStartMonth: 1, xero: { status: "not_connected" } }]);
    expect(list[0].id).toBe(PRIMARY_COMPANY_ID);
    expect(list).toHaveLength(2);
  });
});

describe("setFinancialYearStart", () => {
  const list = withPrimary([]);
  it("changes only the chosen company, and the primary is kept first", () => {
    const withUae = addCompany(list, { name: "Acme Studios", baseCurrency: "AED", financialYearStartMonth: 1 });
    const next = setFinancialYearStart(withUae, PRIMARY_COMPANY_ID, 10);
    expect(next[0].financialYearStartMonth).toBe(10);
    expect(next[1].financialYearStartMonth).toBe(1);
  });
  it("ignores an invalid month or unknown company", () => {
    expect(setFinancialYearStart(list, PRIMARY_COMPANY_ID, 13)).toBe(list);
    expect(setFinancialYearStart(list, PRIMARY_COMPANY_ID, 0)).toBe(list);
    expect(setFinancialYearStart(list, "nope", 5)).toBe(list);
  });
  it("a stored choice survives withPrimary (reload)", () => {
    const saved = setFinancialYearStart(list, PRIMARY_COMPANY_ID, 7);
    expect(withPrimary(saved)[0].financialYearStartMonth).toBe(7);
  });
});
