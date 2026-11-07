/**
 * Browser-side file reading for supplier price lists and request lists.
 * Excel (all sheets), CSV, text-layer PDF, plain text.
 * Every line goes to the review queue — nothing is auto-approved.
 */
import {
  parseCsv,
  parsePdfText,
  parseSheetRows,
  parseTextLines,
  rowsFromPdfItems,
  type PdfItem,
  type Cell,
  type ParsedLine,
  type SheetOptions,
} from "./offerImport";

export type FileKind = "excel" | "csv" | "pdf" | "text" | "unsupported";

export function fileKind(name: string): FileKind {
  const n = name.toLowerCase();
  if (/\.(xlsx|xlsm)$/.test(n)) return "excel";
  if (/\.(csv|tsv)$/.test(n)) return "csv";
  if (/\.pdf$/.test(n)) return "pdf";
  if (/\.(txt|eml|md)$/.test(n)) return "text";
  return "unsupported";
}

export interface ReadResult {
  kind: FileKind;
  lines: ParsedLine[];
  parts: number;
  problem?: string;
  /** Sheet / page names that produced rows (for the review summary). */
  partNames?: string[];
}

/** PDF text layer → lines rebuilt from glyph y-positions. */
export async function readPdfText(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const it of content.items as any[]) {
      if (!("str" in it) || !it.str.trim()) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width ?? 0 });
    }
    out.push(...rowsFromPdfItems(items));
  }
  return { text: out.join("\n"), pages: doc.numPages };
}

function asSheetRows(raw: unknown): Cell[][] {
  if (!Array.isArray(raw)) return [];
  // Already a matrix of cells
  if (raw.length === 0) return [];
  if (Array.isArray(raw[0])) return raw as Cell[][];
  return [];
}

/** Read every sheet of an .xlsx into ParsedLine[]. */
async function readExcelAllSheets(file: File, opts: SheetOptions): Promise<{ lines: ParsedLine[]; parts: number; names: string[] }> {
  const mod = await import("read-excel-file/browser");
  // v8+: default export returns all sheets [{ sheet, data }]
  const readAll = (mod as any).default as (input: File) => Promise<Array<{ sheet: string; data: unknown }>>;
  const readSheet = (mod as any).readSheet as ((input: File, options?: { sheet?: number | string }) => Promise<unknown>) | undefined;

  let sheets: Array<{ sheet: string; data: Cell[][] }> = [];
  try {
    const all = await readAll(file);
    if (Array.isArray(all) && all.length && all[0] && typeof all[0] === "object" && "data" in all[0]) {
      sheets = all.map((s) => ({ sheet: String(s.sheet ?? "Sheet"), data: asSheetRows(s.data) }));
    } else if (Array.isArray(all) && Array.isArray(all[0])) {
      // Single sheet returned as matrix
      sheets = [{ sheet: "Sheet1", data: asSheetRows(all) }];
    }
  } catch {
    // Fall through to readSheet
  }

  if (!sheets.length && readSheet) {
    try {
      const data = await readSheet(file);
      sheets = [{ sheet: "Sheet1", data: asSheetRows(data) }];
    } catch (e) {
      throw e;
    }
  }

  const lines: ParsedLine[] = [];
  const names: string[] = [];
  for (const s of sheets) {
    if (!s.data.length) continue;
    const { lines: sheetLines } = parseSheetRows(s.data, {
      ...opts,
      defaults: { ...(opts.defaults ?? {}), /* sheet name helps traceability */ },
    });
    if (sheetLines.length) {
      names.push(s.sheet);
      // Tag raw with sheet name for the reviewer
      for (const l of sheetLines) {
        lines.push({ ...l, raw: `[${s.sheet}] ${l.raw}` });
      }
    }
  }
  return { lines, parts: sheets.length || 1, names };
}

export async function readFileLines(file: File, opts: SheetOptions = {}): Promise<ReadResult> {
  const kind = fileKind(file.name);
  try {
    if (kind === "excel") {
      const { lines, parts, names } = await readExcelAllSheets(file, opts);
      return {
        kind,
        lines,
        parts,
        partNames: names,
        problem: lines.length
          ? undefined
          : "No product rows found. The sheet needs a header with a Product / Description column and a Price column, or clear product + price lines.",
      };
    }
    if (kind === "csv") {
      const rows = parseCsv(await file.text());
      const { lines } = parseSheetRows(rows, opts);
      return { kind, lines, parts: 1, problem: lines.length ? undefined : "No product rows found in the CSV." };
    }
    if (kind === "pdf") {
      const { text, pages } = await readPdfText(file);
      if (text.trim().length < 20) {
        return {
          kind,
          lines: [],
          parts: pages,
          problem: "This PDF has no readable text (it looks like a scan). Export a text PDF from Excel/Word, or use .xlsx / .csv for multi-product lists. Scanned PDFs need server OCR.",
        };
      }
      const lines = parsePdfText(text, opts);
      return { kind, lines, parts: pages, problem: lines.length ? undefined : "No priced product lines found in the PDF text. Try exporting the price list as .xlsx." };
    }
    if (kind === "text") {
      const lines = parseTextLines(await file.text(), opts);
      return { kind, lines, parts: 1, problem: lines.length ? undefined : "No priced lines found." };
    }
    if (/\.xls$/i.test(file.name)) {
      return { kind, lines: [], parts: 0, problem: "Old .xls cannot be read here. Open in Excel → Save As .xlsx and upload that." };
    }
    return { kind, lines: [], parts: 0, problem: "Unsupported type. Use .xlsx, .xlsm, .csv, .pdf (text layer) or .txt." };
  } catch (e) {
    return { kind, lines: [], parts: 0, problem: `Could not read this file: ${(e as Error).message}` };
  }
}

export interface ReadDocumentResult {
  text: string;
  problem?: string;
}

const MAX_DOC_TEXT = 20000;

/** Readable text inside a document for deal capture. Never throws. */
export async function readDocumentText(file: File): Promise<ReadDocumentResult> {
  const kind = fileKind(file.name);
  try {
    if (kind === "pdf") {
      const { text } = await readPdfText(file);
      return { text: text.slice(0, MAX_DOC_TEXT), problem: text.trim().length < 20 ? "Scanned PDF — no text layer." : undefined };
    }
    if (kind === "csv" || kind === "text") {
      return { text: (await file.text()).slice(0, MAX_DOC_TEXT) };
    }
    if (kind === "excel") {
      const { lines } = await readExcelAllSheets(file, {});
      return { text: lines.map((l) => l.raw).join("\n").slice(0, MAX_DOC_TEXT) };
    }
    return { text: "", problem: "Unsupported file type for text extraction." };
  } catch (e) {
    return { text: "", problem: (e as Error).message };
  }
}
