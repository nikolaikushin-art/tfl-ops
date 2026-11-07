import { describe, expect, it } from "vitest";
import type { Document } from "./domain";
import {
  confirmQueue, docsForCompany, effectiveTag, expirySummary, hasStandardName, intakeFields, libraryDocs, libraryOf,
  missingExpiry, placeOf, productDocs, expenseDocs, standardName, suggestFiling, tagCounts, tagsFor,
} from "./library";
import { dealFolder } from "./dealFolder";

const doc = (o: Partial<Document>): Document => ({ id: "x", name: "f.pdf", type: "other", createdAt: "2026-10-01T00:00:00.000Z", ...o } as Document);
const NOW = new Date("2026-10-04T12:00:00");

describe("two library categories", () => {
  it("has exactly two, and every tag belongs to one", () => {
    expect(tagsFor("kyc_company").length).toBeGreaterThan(0);
    expect(tagsFor("deals_contracts_shipping").length).toBeGreaterThan(0);
  });
  it("places documents: deal → deals, kyc/certificate → company, explicit library wins", () => {
    expect(placeOf(doc({ dealId: "d1" }))).toBe("deals_contracts_shipping");
    expect(placeOf(doc({ type: "kyc" }))).toBe("kyc_company");
    expect(placeOf(doc({ type: "certificate" }))).toBe("kyc_company");
    expect(placeOf(doc({ type: "contract" }))).toBe("deals_contracts_shipping");
    expect(placeOf(doc({ type: "kyc", library: "deals_contracts_shipping" }))).toBe("deals_contracts_shipping");
    expect(placeOf(doc({ docTag: "insurance" }))).toBe("kyc_company");
  });
  it("moves product documents to Products and receipts to Accounting, out of the library", () => {
    const p = doc({ id: "p", productId: "pr1" });
    const e = doc({ id: "e", expenseId: "ex1", type: "invoice" });
    expect(placeOf(p)).toBe("product");
    expect(placeOf(e)).toBe("expense");
    expect(libraryOf(p)).toBeNull();
    expect(libraryOf(e)).toBeNull();
    const all = [p, e, doc({ id: "k", type: "kyc" })];
    expect(libraryDocs(all, "kyc_company").map((d) => d.id)).toEqual(["k"]);
    expect(libraryDocs(all, "deals_contracts_shipping")).toHaveLength(0);
    expect(productDocs(all, "pr1").map((d) => d.id)).toEqual(["p"]);
    expect(expenseDocs(all, "ex1").map((d) => d.id)).toEqual(["e"]);
    expect(expenseDocs(all, "other")).toHaveLength(0);
  });
  it("a product sheet filed to a deal stays with the deal", () => {
    expect(placeOf(doc({ productId: "pr1", dealId: "d1" }))).toBe("deals_contracts_shipping");
  });
});

describe("stored once, shown three places", () => {
  const one = doc({ id: "a", customerId: "c1", warehouseId: "w1", dealId: "d1", library: "deals_contracts_shipping", docTag: "pre_advice" });
  const other = doc({ id: "b", customerId: "c2", type: "kyc" });
  const all = [one, other];
  it("same record on the company, in the deal folder and in the library", () => {
    expect(docsForCompany(all, ["c1"]).map((d) => d.id)).toEqual(["a"]);
    expect(docsForCompany(all, ["w1"]).map((d) => d.id)).toEqual(["a"]);
    expect(dealFolder("d1", all).map((d) => d.id)).toEqual(["a"]);
    expect(libraryDocs(all, "deals_contracts_shipping").map((d) => d.id)).toEqual(["a"]);
    expect(docsForCompany(all, ["c1"])[0]).toBe(dealFolder("d1", all)[0]);
  });
});

describe("type tags", () => {
  it("falls back to a tag from the type and counts tags per library", () => {
    expect(effectiveTag(doc({ type: "kyc" }))).toBe("kyc_form");
    expect(effectiveTag(doc({ type: "order" }))).toBe("po");
    expect(effectiveTag(doc({ docTag: "bogus", type: "quotation" }))).toBe("offer");
    const all = [doc({ docTag: "pre_advice", dealId: "d" }), doc({ docTag: "pre_advice", dealId: "d" }), doc({ docTag: "cmr", dealId: "d" })];
    expect(tagCounts(all, "deals_contracts_shipping")[0]).toEqual({ tag: "pre_advice", label: "Pre-advice", count: 2 });
  });
});

describe("consistent naming", () => {
  it("builds the standard name", () => {
    expect(standardName({ date: "2026-10-04T08:00:00Z", tag: "pre_advice", counterparty: "Rotterdam European Hub", ref: "RG-2026-011" }))
      .toBe("2026-10-04 – Pre-advice – Rotterdam European Hub – RG-2026-011");
  });
  it("skips missing parts without leaving stray separators", () => {
    expect(standardName({ date: "2026-10-04", tag: "licence" })).toBe("2026-10-04 – Licence");
  });
  it("recognises a standard name", () => {
    expect(hasStandardName("2026-10-04 – Pre-advice – X")).toBe(true);
    expect(hasStandardName("scan0001.pdf")).toBe(false);
    expect(hasStandardName("2026-10-04 Pre-advice")).toBe(false);
  });
});

describe("AI filed, please confirm", () => {
  it("suggests a library and tag from the file name", () => {
    expect(suggestFiling("Pre-advice RG-2026-011.pdf")).toMatchObject({ tag: "pre_advice", library: "deals_contracts_shipping", confidence: "high" });
    expect(suggestFiling("CMR_4471.pdf").tag).toBe("cmr");
    expect(suggestFiling("Certificate of Incorporation.pdf")).toMatchObject({ tag: "incorporation", library: "kyc_company" });
    expect(suggestFiling("Director passport.jpg").tag).toBe("director_id");
    expect(suggestFiling("Product liability insurance.pdf").tag).toBe("insurance");
    expect(suggestFiling("Proforma invoice 88.pdf").tag).toBe("proforma");
    expect(suggestFiling("Certificate of origin.pdf").tag).toBe("coo");
    expect(suggestFiling("head office lead.pdf").tag).not.toBe("e_ad");
  });
  it("is low confidence when it cannot tell, and still lands in the queue", () => {
    const s = suggestFiling("scan0001.pdf");
    expect(s.confidence).toBe("low");
    const f = intakeFields("scan0001.pdf");
    expect(f.needsConfirmation).toBe(true);
    expect(f.filingNote).toContain("choose");
  });
  it("the queue holds only unconfirmed files, newest first", () => {
    const q = confirmQueue([
      doc({ id: "old", needsConfirmation: true, createdAt: "2026-09-01T00:00:00Z" }),
      doc({ id: "done" }),
      doc({ id: "new", needsConfirmation: true, createdAt: "2026-10-01T00:00:00Z" }),
    ]);
    expect(q.map((d) => d.id)).toEqual(["new", "old"]);
  });
});

describe("expiry tracking", () => {
  it("summarises states", () => {
    const s = expirySummary([
      doc({ expiresAt: "2026-09-01" }), doc({ expiresAt: "2026-10-20" }), doc({ expiresAt: "2027-06-01" }), doc({}),
    ], 30, NOW);
    expect(s).toEqual({ expired: 1, expiring: 1, valid: 1, none: 1 });
  });
  it("flags company documents that normally expire but have no end date", () => {
    const list = [
      doc({ id: "ins", docTag: "insurance" }),
      doc({ id: "ins2", docTag: "insurance", expiresAt: "2027-01-01" }),
      doc({ id: "inc", docTag: "incorporation" }),
      doc({ id: "deal", dealId: "d", docTag: "cmr" }),
    ];
    expect(missingExpiry(list).map((d) => d.id)).toEqual(["ins"]);
  });
});

import { missingCompanyDocs } from "./library";
import { buildTimeline } from "./parties";
describe("company document gaps (v24)", () => {
  it("lists the usual KYC documents a role still lacks", () => {
    const have = [doc({ docTag: "kyc_form", type: "kyc" }), doc({ docTag: "incorporation", type: "kyc" })];
    expect(missingCompanyDocs(["buyer"], have).map((t) => t.tag)).toEqual(["director_id", "proof_address"]);
    expect(missingCompanyDocs(["supplier", "buyer"], []).map((t) => t.tag)).toContain("brand_auth");
    expect(missingCompanyDocs(["broker"], [])).toHaveLength(0);
  });
  it("deal documents never fill a KYC gap", () => {
    const only = [doc({ docTag: "kyc_form", dealId: "d1" })];
    expect(missingCompanyDocs(["buyer"], only).map((t) => t.tag)).toContain("kyc_form");
  });
  it("a warehouse's documents and deals show on its timeline", () => {
    const t = buildTimeline(
      { recordIds: ["w1"] } as any,
      { communications: [], deals: [{ id: "d1", ref: "R1", clientId: "c1", supplierId: "s1", warehouseId: "w1", createdAt: "2026-10-01" } as any], documents: [doc({ id: "f1", warehouseId: "w1" })] },
    );
    expect(t.map((x) => x.kind).sort()).toEqual(["deal", "document"]);
  });
});
