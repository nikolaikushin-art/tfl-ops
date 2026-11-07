import { describe, it, expect } from "vitest";
import {
  detectMapping, parseSheetRows, parseTextLines, parseNumber, parseDate, parseCsv,
  detectGlobalTerms, linesToOfferDrafts, parseIncoterm,
  parsePdfText, rowsFromPdfItems, unitFromText, detectCurrencies,
} from "./offerImport";
import { matchProductName, matchRequest, extractSizeCl, normaliseRequestStatus, opportunitiesForOffers } from "./requests";
import type { Product, PricingRecord, CustomerRequirement } from "./domain";

const jwb = { id: "p-jwb", name: "Johnnie Walker Black Label 12 Year Old 1L", sku: "JWB", unit: "case", currency: "EUR",
  supplierIds: [], tags: [], isActive: true, createdAt: "", updatedAt: "", aliases: ["JWB 12x1L", "Johnnie Walker Black 12x1L"] } as Product;
const moet = { id: "p-moet", name: "Moët & Chandon Impérial Brut 75cl", sku: "MOET", unit: "case", currency: "EUR",
  supplierIds: [], tags: [], isActive: true, createdAt: "", updatedAt: "" } as Product;

describe("number / date / term parsing", () => {
  it("reads European and English numbers", () => {
    expect(parseNumber("1.234,50")).toBe(1234.5);
    expect(parseNumber("1,234.50")).toBe(1234.5);
    expect(parseNumber("€ 12,5")).toBe(12.5);
    expect(parseNumber("12.500")).toBe(12500);
    expect(parseNumber("abc")).toBeUndefined();
  });
  it("reads dates", () => {
    expect(parseDate("30/11/2026")).toBe("2026-11-30");
    expect(parseDate("30 Nov 2026")).toBe("2026-11-30");
    expect(parseDate("2026-11-30")).toBe("2026-11-30");
  });
  it("separates Incoterm from named place", () => {
    expect(parseIncoterm("FCA Rotterdam")).toEqual({ incoterm: "FCA", place: "Rotterdam" });
    expect(parseIncoterm("EXW")).toEqual({ incoterm: "EXW", place: undefined });
  });
  it("finds document-wide terms", () => {
    const t = detectGlobalTerms("Price list - all T2, FCA Rotterdam. Valid until 30/11/2026. Payment: 100% prepayment");
    expect(t.dutyStatus).toBe("T2");
    expect(t.incoterm).toBe("FCA");
    expect(t.incotermPlace).toBe("Rotterdam");
    expect(t.validUntil).toBe("2026-11-30");
    expect(t.paymentTerms).toBe("100% prepayment");
  });
});

describe("spreadsheet price lists", () => {
  const rows = [
    ["ACME Spirits BV - price list", null, null, null, null],
    ["All prices T2, FCA Rotterdam. Valid until 30/11/2026", null, null, null, null],
    [null],
    ["Product", "Size", "Qty (cases)", "Price EUR / case", "Location"],
    ["WHISKY", null, null, null, null],
    ["Johnnie Walker Black Label 12yo", "1L", 200, 312.5, "Rotterdam"],
    ["Moet & Chandon Imperial Brut", "75cl", "1.200", "€ 285,00", "Epernay"],
    ["Mystery Gin", "70cl", 50, null, null],
  ];
  it("detects the header row and columns", () => {
    const m = detectMapping(rows)!;
    expect(m.headerRow).toBe(3);
    expect(Object.values(m.columns)).toEqual(expect.arrayContaining(["product", "size", "qty", "price", "location"]));
    expect(m.headerCurrency).toBe("EUR");
  });
  it("extracts lines with file-level terms and skips section rows", () => {
    const { lines } = parseSheetRows(rows);
    expect(lines.map((l) => l.product)).toEqual([
      "Johnnie Walker Black Label 12yo 1L", "Moet & Chandon Imperial Brut 75cl", "Mystery Gin 70cl",
    ]);
    expect(lines[0]).toMatchObject({ unitPrice: 312.5, currency: "EUR", dutyStatus: "T2", incoterm: "FCA", incotermPlace: "Rotterdam", validUntil: "2026-11-30", quantity: 200 });
    expect(lines[1].quantity).toBe(1200);
    expect(lines[1].unitPrice).toBe(285);
    expect(lines[2].warnings).toContain("No price found");
  });
  it("turns lines into pending drafts linked to the catalogue via aliases", () => {
    const { lines } = parseSheetRows(rows);
    const drafts = linesToOfferDrafts(lines, {
      supplierName: "ACME Spirits BV", source: "excel", sourceRef: "acme.xlsx", batchId: "b1",
      products: [jwb, moet], existing: [], nowIso: "2026-10-04T00:00:00Z",
    });
    expect(drafts).toHaveLength(2); // the priceless row is not a draft
    expect(drafts.every((d) => d.status === "pending_review")).toBe(true);
    expect(drafts[0].productId).toBe("p-jwb");
    expect(drafts[1].productId).toBe("p-moet");
  });
  it("flags a repeat of an offer we already hold", () => {
    const { lines } = parseSheetRows(rows);
    const existing = [{ id: "o1", productId: "p-jwb", productName: jwb.name, supplierName: "ACME Spirits BV", unitPrice: 312.5, currency: "EUR" }] as PricingRecord[];
    const drafts = linesToOfferDrafts(lines, { supplierName: "ACME Spirits BV", source: "excel", sourceRef: "x", batchId: "b", products: [jwb, moet], existing, nowIso: "" });
    expect(drafts[0].duplicateOf).toBe("o1");
    expect(drafts[1].duplicateOf).toBeUndefined();
  });
});

describe("PDF / email text", () => {
  const text = `Offer from Bonded Wines Ltd
Valid until 15/12/2026 - T1 - EXW Antwerp - payment: advance payment
JWB 12x1L  100 cs  EUR 305.00
Moet Imperial 75cl 60 cases €280,50
Thank you for your enquiry`;
  it("reads product, qty, price and shared terms", () => {
    const lines = parseTextLines(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ quantity: 100, unitPrice: 305, currency: "EUR", dutyStatus: "T1", incoterm: "EXW", incotermPlace: "Antwerp", validUntil: "2026-12-15" });
    expect(lines[1]).toMatchObject({ quantity: 60, unitPrice: 280.5 });
    expect(lines[0].confidence).toBeLessThanOrEqual(0.85);
  });
});

describe("csv", () => {
  it("handles quotes and semicolons", () => {
    expect(parseCsv('a;b;c\n"x;y";2;3')).toEqual([["a", "b", "c"], ["x;y", "2", "3"]]);
  });
});

describe("request matching", () => {
  it("sizes stated on both sides must agree", () => {
    expect(extractSizeCl("Glenfiddich 12 0,7L")).toBe(70);
    expect(extractSizeCl("Glenfiddich 12 1L")).toBe(100);
    expect(matchProductName("Johnnie Walker Black 1L", "Johnnie Walker Black Label 70cl")).toBeNull();
  });
  it("alias recognises shorthand", () => {
    expect(matchProductName("JWB 12x1L", jwb.name, jwb.aliases)?.reason).toBe("alias");
  });
  const offers = [
    { id: "o1", productId: "p-jwb", productName: jwb.name, supplierName: "A", unitPrice: 320, currency: "EUR", status: "approved", extractedAt: "2026-10-01", validUntil: "2027-01-01" },
    { id: "o2", productId: "p-jwb", productName: jwb.name, supplierName: "B", unitPrice: 305, currency: "EUR", status: "approved", extractedAt: "2026-10-02", validUntil: "2027-01-01" },
    { id: "o3", productId: "p-jwb", productName: jwb.name, supplierName: "C", unitPrice: 290, currency: "EUR", status: "approved", extractedAt: "2026-01-02", validUntil: "2026-02-01" },
    { id: "o4", productId: "p-jwb", productName: jwb.name, supplierName: "D", unitPrice: 200, currency: "EUR", status: "rejected", extractedAt: "2026-10-02" },
  ] as PricingRecord[];
  it("live offers cheapest first, expired go to past, rejected ignored", () => {
    const m = matchRequest({ productName: "Johnnie Walker Black 12x1L" }, { products: [jwb], pricingRecords: offers }, new Date("2026-10-04").getTime());
    expect(m.live.map((x) => x.offer.id)).toEqual(["o2", "o1"]);
    expect(m.past.map((x) => x.offer.id)).toEqual(["o3"]);
    expect(m.best?.offer.id).toBe("o2");
  });
  it("legacy statuses map to the new lifecycle", () => {
    expect(normaliseRequestStatus("open")).toBe("new");
    expect(normaliseRequestStatus("matching")).toBe("matched");
    expect(normaliseRequestStatus("cancelled")).toBe("lost");
  });
  it("a new offer flags the buyers who asked for it", () => {
    const reqs = [
      { id: "r1", productName: "JWB 12x1L", status: "new" },
      { id: "r2", productName: "Johnnie Walker Black 1L", status: "quoted" },
      { id: "r3", productName: "Johnnie Walker Black 1L", status: "won" },
      { id: "r4", productName: "Moet Imperial 75cl", status: "new" },
    ] as CustomerRequirement[];
    const pending = [{ ...offers[0], status: "pending_review" }] as PricingRecord[];
    const opp = opportunitiesForOffers(pending, reqs, [jwb, moet]);
    expect(opp).toHaveLength(1);
    expect(opp[0].requests.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});


describe("messy price lists (v32)", () => {
  it("does not take filler words as the Incoterm place", () => {
    expect(parseIncoterm("EXW prices valid until Friday")).toEqual({ incoterm: "EXW", place: undefined });
    expect(parseIncoterm("Delivery: FCA Rotterdam Bonded")).toEqual({ incoterm: "FCA", place: "Rotterdam" });
  });
  it("T1/T2 together is not an answer", () => {
    expect(detectGlobalTerms("Status T1/T2").dutyStatus).toBeUndefined();
  });
  it("reads terms from a footer", () => {
    const { lines } = parseSheetRows([["Product", "Qty", "Price"], ["JWB Black 12x1L", 100, "24.50"], [], ["All prices in USD, T1, EXW Antwerp, valid until 15/12/2026"]]);
    expect(lines[0]).toMatchObject({ currency: "USD", dutyStatus: "T1", incoterm: "EXW", incotermPlace: "Antwerp", validUntil: "2026-12-15" });
  });
  it("makes one line per currency column", () => {
    const { lines } = parseSheetRows([["Product", "Price EUR", "Price USD", "Qty"], ["JWB Black", 24.5, 27.1, 100]]);
    expect(lines.map((l) => [l.currency, l.unitPrice])).toEqual([["EUR", 24.5], ["USD", 27.1]]);
  });
  it("section headings carry T1/T2 and location to the rows below", () => {
    const { lines } = parseSheetRows([["Product", "Qty", "Price EUR"], ["STOCK IN ROTTERDAM - T2"], ["JWB", 100, 24.5], ["STOCK IN DUNDEE - T1"], ["Glenfiddich", 80, 22]]);
    expect(lines.map((l) => [l.dutyStatus, l.goodsLocation])).toEqual([["T2", "ROTTERDAM"], ["T1", "DUNDEE"]]);
  });
  it("skips repeated headers and page footers", () => {
    const { lines } = parseSheetRows([["Product", "Qty", "Price EUR"], ["JWB", 1, 2], ["Product", "Qty", "Price EUR"], ["Page 2 of 3"], ["Moet", 5, 6]]);
    expect(lines.map((l) => l.product)).toEqual(["JWB", "Moet"]);
  });
  it("a column called Export price is not mistaken for another field", () => {
    expect(Object.values(detectMapping([["Item description", "Importer", "Export price"], ["JWB", "x", 10]])!.columns)).toEqual(["product", "price"]);
  });
  it("leaves currency blank with a warning when a file names two currencies and none applies", () => {
    expect(detectCurrencies("USD 26 and EUR 24")).toEqual(["USD", "EUR"]);
    expect(detectGlobalTerms("USD 26 and EUR 24").currency).toBeUndefined();
  });
  it("reads price unit from a header", () => {
    expect(unitFromText("Price EUR / case")).toBe("case");
    expect(unitFromText("Price per bottle")).toBe("bottle");
    expect(unitFromText("Price")).toBeUndefined();
  });
  it("text lines: symbol price, bare price (low confidence) and totals ignored", () => {
    const l = parseTextLines("Glenfiddich 12 12x70cl USD 26.00 200 cs\nJohnnie Walker Black 12x1L  24,50  500 cs\nTotal 1.234,50");
    // USD is named on one product line only. That is not a document-wide statement, so the bare price
    // on the other line gets no currency (blank plus a warning), never a borrowed one.
    expect(l.map((x) => x.unitPrice)).toEqual([26, 24.5]);
    expect(l[0].currency).toBe("USD");
    expect(l[1].currency).toBeUndefined();
    expect(l[1].confidence).toBeLessThanOrEqual(0.55);
    expect(l[1].warnings.join()).toMatch(/no currency/i);
  });
  it("text lines: a currency stated once in a heading applies to a bare price, still at low confidence", () => {
    const l = parseTextLines("All prices in USD, T2 bonded\nGlenfiddich 12 12x70cl 26.00 200 cs\nJohnnie Walker Black 12x1L  24,50  500 cs");
    expect(l.map((x) => [x.unitPrice, x.currency, x.dutyStatus])).toEqual([[26, "USD", "T2"], [24.5, "USD", "T2"]]);
    expect(l[1].confidence).toBeLessThanOrEqual(0.55);
    expect(l[1].warnings.join()).toMatch(/check it/i);
  });
  it("PDF rows rebuild from glyph runs, and a wide gap splits columns", () => {
    const rows = rowsFromPdfItems([
      { str: "JWB Black", x: 10, y: 700, width: 45 }, { str: "24.50", x: 300, y: 701, width: 25 },
      { str: "Product", x: 10, y: 720, width: 35 }, { str: "Price EUR", x: 300, y: 720, width: 45 },
    ]);
    expect(rows).toEqual(["Product  Price EUR", "JWB Black  24.50"]);
    expect(parsePdfText(rows.join("\n")).map((x) => [x.product, x.unitPrice, x.currency])).toEqual([["JWB Black", 24.5, "EUR"]]);
  });

  it("multi-product Excel-style table extracts every priced row", () => {
    const rows = [
      ["Product", "Qty", "Price EUR", "T1/T2", "Incoterm", "Location", "Valid until"],
      ["Johnnie Walker Black 12x1L", 500, 24.5, "T2", "EXW Rotterdam", "Rotterdam", "2026-12-31"],
      ["Macallan 12 Double Cask 6x70cl", 120, 185, "T1", "EXW", "Speyside", "2026-11-30"],
      ["Moët & Chandon Impérial 6x75cl", 200, 32.0, "T2", "FCA", "Epernay", ""],
      ["Glenfiddich 18 6x70cl", 80, 48.5, "T2", "EXW", "Dufftown", "2027-01-15"],
      ["Hennessy VS 12x70cl", 300, 29.9, "T1", "FOB", "Cognac", "2026-10-31"],
      ["Total", "", 320.0, "", "", "", ""],
    ];
    const { lines } = parseSheetRows(rows);
    expect(lines.map((l) => l.product)).toEqual([
      "Johnnie Walker Black 12x1L",
      "Macallan 12 Double Cask 6x70cl",
      "Moët & Chandon Impérial 6x75cl",
      "Glenfiddich 18 6x70cl",
      "Hennessy VS 12x70cl",
    ]);
    expect(lines.every((l) => l.unitPrice && l.unitPrice > 0)).toBe(true);
    expect(lines[0].currency).toBe("EUR");
    expect(lines[0].dutyStatus).toBe("T2");
    expect(lines[0].incoterm).toBe("EXW");
  });
  it("headerless sheet still extracts product + price columns", () => {
    const rows = [
      ["Glenfiddich 12 12x70cl", 200, 26],
      ["Johnnie Walker Black 12x1L", 500, 24.5],
      ["Macallan 12 6x70cl", 40, 190],
    ];
    const { lines } = parseSheetRows(rows);
    expect(lines.length).toBe(3);
    expect(lines.map((l) => l.unitPrice)).toEqual([26, 24.5, 190]);
  });
  it("linesToOfferDrafts keeps multi-product batch for review queue", () => {
    const rows = [
      ["Item description", "Price USD", "Qty cs"],
      ["JWB 12x1L", 28, 100],
      ["Moet Imperial 6x75cl", 36, 50],
      ["Hennessy VS 12x70cl", 32, 80],
    ];
    const { lines } = parseSheetRows(rows);
    const drafts = linesToOfferDrafts(lines, {
      supplierName: "ACME Spirits BV",
      source: "excel",
      sourceRef: "acme-oct.xlsx",
      batchId: "b1",
      products: [],
      existing: [],
      nowIso: "2026-10-06T00:00:00.000Z",
    });
    expect(drafts).toHaveLength(3);
    expect(drafts.every((d) => d.status === "pending_review")).toBe(true);
    expect(drafts.map((d) => d.productName)).toEqual(["JWB 12x1L", "Moet Imperial 6x75cl", "Hennessy VS 12x70cl"]);
  });

});

describe("v113 price-list reading: other languages, packaging, clean names", () => {
  it("reads a Dutch-headed sheet (Artikel / Inhoud / Doos / Prijs per doos / Voorraad)", () => {
    const { lines } = parseSheetRows([
      ["Artikel", "Inhoud", "Doos", "Prijs/doos", "Voorraad"],
      ["Jack Daniel's No.7", "1 L", 12, "USD 180", "1.200"],
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].unitPrice).toBe(180);
    expect(lines[0].currency).toBe("USD");
    expect(lines[0].quantity).toBe(1200);
    expect(lines[0].bottlesPerCase).toBe(12);
    expect(lines[0].bottleSizeCl).toBe(100);
  });
  it("keeps bottles per case and size as fields from sheet columns", () => {
    const { lines } = parseSheetRows([
      ["Product", "Size", "Pack", "Price EUR/case", "Qty"],
      ["Moet Brut Imperial", "75cl", 6, 289, 50],
    ]);
    expect(lines[0].bottlesPerCase).toBe(6);
    expect(lines[0].bottleSizeCl).toBe(75);
  });
  it("cleans terms out of the product name and reads per-line validity", () => {
    const [a, b] = parseTextLines(
      "JWB 12x1L 40% T1 EXW Rotterdam EUR 142.50/cs 500 cs valid until 15/10/2026\nGrey Goose 6x70cl @ 168 USD per case, 100 cases, T2, FCA Cognac",
    );
    expect(a.product).toBe("JWB 12x1L");
    expect(a.incotermPlace).toBe("Rotterdam");
    expect(a.validUntil).toBe("2026-10-15");
    expect(a.abv).toBe(40);
    expect(a.bottlesPerCase).toBe(12);
    expect(b.product).toBe("Grey Goose 6x70cl");
    expect(b.bottleSizeCl).toBe(70);
  });
  it("a different validity on each line stays on its own line", () => {
    const lines = parseTextLines("Hennessy VS 6x70cl EUR 198 per case 100 cs valid until 10/11/2026\nRemy VSOP 6x70cl EUR 240 per case 50 cs valid until 12/11/2026");
    expect(lines.map((l) => l.validUntil)).toEqual(["2026-11-10", "2026-11-12"]);
  });
});
