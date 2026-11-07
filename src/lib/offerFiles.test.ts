/**
 * Real files, real readers. The fixtures in __fixtures__/offers are built by
 * tools/make-offer-fixtures.py: an .xlsx and PDFs with letterhead, terms in the
 * header and the footer, section headings, repeated headers, total rows, EUR and
 * USD columns and European number formats. They are read with the same libraries
 * the browser uses (read-excel-file, pdfjs-dist) and passed to the parsers.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readXlsxFile from "read-excel-file/node";
import {
  parseCsv, parsePdfText, parseSheetRows, rowsFromPdfItems, parseTextLines,
  type Cell, type ParsedLine, type PdfItem,
} from "./offerImport";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "__fixtures__/offers");

async function readXlsx(name: string): Promise<ParsedLine[]> {
  const sheets = (await readXlsxFile(resolve(dir, name))) as any[];
  return sheets.flatMap((s) => parseSheetRows((s.data ?? s.rows) as Cell[][]).lines);
}
async function readPdf(name: string): Promise<{ text: string; lines: ParsedLine[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(resolve(dir, name))), verbosity: 0 }).promise;
  const rows: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const items: PdfItem[] = [];
    for (const it of content.items as any[]) {
      if ("str" in it && it.str.trim()) items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width ?? 0 });
    }
    rows.push(...rowsFromPdfItems(items));
  }
  const text = rows.join("\n");
  return { text, lines: parsePdfText(text) };
}
const find = (ls: ParsedLine[], needle: string, currency?: string) =>
  ls.find((l) => l.product.toLowerCase().includes(needle.toLowerCase()) && (!currency || l.currency === currency));

describe("Excel stock list (letterhead, header and footer terms, sections, two currency columns)", () => {
  it("reads every priced product once per currency and never a total row", async () => {
    const ls = await readXlsx("highland-stock-list.xlsx");
    expect(ls.some((l) => /total/i.test(l.product))).toBe(false);
    expect(ls.filter((l) => l.unitPrice != null)).toHaveLength(7); // Moet x2, Veuve x2, JW, Glenfiddich x2
    const unpriced = ls.filter((l) => l.unitPrice == null).map((l) => l.product);
    expect(unpriced.length).toBe(1);
    expect(unpriced[0]).toContain("Macallan"); // "POA": a line with no price, kept for the reviewer
  });

  it("keeps a product row whose price cell looks like a header word ('€ 1.245,00')", async () => {
    const jw = find(await readXlsx("highland-stock-list.xlsx"), "Johnnie Walker")!;
    expect(jw).toBeDefined();
    expect(jw.unitPrice).toBe(1245);
    expect(jw.currency).toBe("EUR");
  });

  it("keeps EUR and USD apart and ignores the 'Old price' column", async () => {
    const ls = await readXlsx("highland-stock-list.xlsx");
    expect(find(ls, "Imperial Brut", "EUR")!.unitPrice).toBe(238.5);
    expect(find(ls, "Imperial Brut", "USD")!.unitPrice).toBe(262);
    expect(ls.some((l) => l.unitPrice === 251)).toBe(false);
  });

  it("section headings set T1/T2 and the goods location for the rows under them", async () => {
    const ls = await readXlsx("highland-stock-list.xlsx");
    expect(find(ls, "Imperial Brut", "EUR")).toMatchObject({ dutyStatus: "T1", goodsLocation: "REIMS" });
    expect(find(ls, "Glenfiddich", "EUR")).toMatchObject({ dutyStatus: "T2", goodsLocation: "DUNDEE" });
  });

  it("takes validity and payment terms from the header, with no stray separators", async () => {
    const l = find(await readXlsx("highland-stock-list.xlsx"), "Veuve", "EUR")!;
    expect(l.validUntil).toBe("2026-10-12");
    expect(l.paymentTerms).toBe("100% prepayment or escrow");
  });

  it("a remark on the row ('EXW Dundee', 'FCA Antwerp') beats the document-wide Incoterm", async () => {
    const ls = await readXlsx("highland-stock-list.xlsx");
    expect(find(ls, "Glenfiddich", "EUR")).toMatchObject({ incoterm: "EXW", incotermPlace: "Dundee" });
    expect(find(ls, "Johnnie Walker")).toMatchObject({ incoterm: "FCA", incotermPlace: "Antwerp" });
  });

  it("warns when the header and the footer name different Incoterms, instead of silently choosing", async () => {
    const ls = await readXlsx("highland-stock-list.xlsx");
    const champagne = find(ls, "Imperial Brut", "EUR")!;
    expect(champagne.incoterm).toBe("FCA");
    expect(champagne.warnings.join(" ")).toMatch(/FCA Rotterdam.*EXW Dundee/);
    // A row that states its own Incoterm has nothing to warn about.
    expect(find(ls, "Glenfiddich", "EUR")!.warnings).toEqual([]);
  });

  it("terms in a single line above the table, a price per bottle and a numeric EAN column", async () => {
    const ls = await readXlsx("offer-4471-bottle-price.xlsx");
    expect(ls).toHaveLength(3);
    expect(ls[0]).toMatchObject({ unitPrice: 21.9, currency: "EUR", priceUnit: "bottle", dutyStatus: "T1", incoterm: "DAP", incotermPlace: "Antwerp", validUntil: "2026-11-30", leadTimeDays: 5 });
    expect(ls[1].leadTimeDays).toBe(7);
  });
});

describe("PDF price lists read through pdf.js", () => {
  it("a table PDF: columns rebuilt, header terms, footer Incoterm, EUR and USD columns", async () => {
    const { lines } = await readPdf("nordic-price-list.pdf");
    expect(lines.filter((l) => l.unitPrice != null)).toHaveLength(8); // 4 products x 2 currencies
    expect(find(lines, "Absolut Vodka Blue 40% 1L", "EUR")).toMatchObject({ unitPrice: 78, quantity: 1000, dutyStatus: "T2", incoterm: "FCA", validUntil: "2026-10-09", paymentTerms: "prepayment" });
    expect(find(lines, "Absolut Vodka Blue 40% 1L", "USD")!.unitPrice).toBe(85.5);
    expect(lines.some((l) => /page|total/i.test(l.product))).toBe(false);
  });

  it("a row remark overrides the footer Incoterm in a PDF table too", async () => {
    const { lines } = await readPdf("nordic-price-list.pdf");
    expect(find(lines, "Bacardi", "EUR")).toMatchObject({ incoterm: "EXW", incotermPlace: "Gothenburg" });
    expect(find(lines, "Jameson", "EUR")).toMatchObject({ incoterm: "FCA" });
  });

  it("running text with mixed currencies: one T1 line does not wipe the document's T2", async () => {
    const { lines } = await readPdf("running-text-offer.pdf");
    expect(lines).toHaveLength(3);
    expect(find(lines, "Johnnie Walker")).toMatchObject({ unitPrice: 24.5, currency: "EUR", priceUnit: "bottle", dutyStatus: "T2", incoterm: "FCA", incotermPlace: "Antwerp", validUntil: "2026-10-15", paymentTerms: "escrow" });
    expect(find(lines, "Hennessy")).toMatchObject({ unitPrice: 198, currency: "USD", priceUnit: "case", dutyStatus: "T2" });
    expect(find(lines, "Chivas")).toMatchObject({ unitPrice: 19.8, currency: "EUR", dutyStatus: "T1" });
  });
});

describe("CSV", () => {
  it("German headers, semicolons, decimal commas and an undecided 'T1/T2' value", () => {
    const text = readFileSync(resolve(dir, "semicolon-list.csv"), "utf8").replace(/^\uFEFF/, "");
    const ls = parseSheetRows(parseCsv(text)).lines;
    expect(ls).toHaveLength(2);
    expect(ls[0]).toMatchObject({ unitPrice: 98.5, quantity: 800, currency: "EUR", goodsLocation: "Hamburg" });
    expect(ls[0].dutyStatus).toBeUndefined(); // "T1/T2" is a question, not an answer
    expect(ls[1].dutyStatus).toBe("T2");
  });
});

describe("text reader: document terms come from non-product lines", () => {
  it("a single priced line keeps working (whole text is used)", () => {
    const ls = parseTextLines("Whisky offer T2 FCA Rotterdam\nGlenfiddich 12 70cl EUR 312 per case 300 cs");
    expect(ls[0]).toMatchObject({ dutyStatus: "T2", incoterm: "FCA", currency: "EUR" });
  });
});
