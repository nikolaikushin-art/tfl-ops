/**
 * The Film Location CRM — reading price lists and request lists (v18).
 *
 * Turns spreadsheet rows (Excel / CSV) or plain text (PDF text layer, pasted
 * email) into structured lines: product, quantity, price, currency, T1/T2,
 * Incoterm + named place, goods location, validity, payment terms, lead time.
 *
 * This is a deterministic, rule-based reader. It is the front-end half of the
 * "AI extraction" feature: it works offline, is fully testable, and every line
 * it produces goes to the review queue — nothing is committed silently. The
 * hosted product swaps `readTextWithModel` in for the model call (see
 * backend/README.md); the review queue and everything downstream stays as is.
 */
import type { DutyStatus, PricingRecord, Product } from "./domain";
import { findProduct } from "./requests";

export type Cell = string | number | boolean | Date | null | undefined;

export type FieldKey =
  | "product"
  | "brand"
  | "size"
  | "pack"
  | "ean"
  | "qty"
  | "price"
  | "currency"
  | "incoterm"
  | "place"
  | "duty"
  | "location"
  | "validUntil"
  | "payment"
  | "leadTime"
  | "minQty"
  | "supplier"
  | "customer"
  | "notes";

/** What one price is for. Never assumed: left undefined when the file does not say. */
export type PriceUnit = "case" | "bottle" | "pallet";

export interface ParsedLine {
  /** 1-based row / line number in the source, for traceability. */
  sourceRow: number;
  raw: string;
  product: string;
  supplierName?: string;
  customerName?: string;
  quantity?: number;
  unitPrice?: number;
  /** Whether unitPrice is per case, bottle or pallet, when the file says. */
  priceUnit?: PriceUnit;
  currency?: string;
  dutyStatus?: DutyStatus;
  incoterm?: string;
  incotermPlace?: string;
  goodsLocation?: string;
  validUntil?: string;
  paymentTerms?: string;
  leadTimeDays?: number;
  minQuantity?: number;
  ean?: string;
  /** Packaging facts read from the line, kept apart from the product name. */
  bottlesPerCase?: number;
  bottleSizeCl?: number;
  abv?: number;
  notes?: string;
  /** 0–1. Below 0.6 the review queue highlights the row. */
  confidence: number;
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* Primitive parsers                                                          */
/* -------------------------------------------------------------------------- */

export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

const CURRENCY_WORDS: Record<string, string> = {
  "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR",
  "$": "USD", usd: "USD", dollar: "USD", dollars: "USD",
  "£": "GBP", gbp: "GBP", pound: "GBP", pounds: "GBP",
  aed: "AED", chf: "CHF", sek: "SEK", nok: "NOK", dkk: "DKK", pln: "PLN",
};

export function detectCurrency(text: string): string | undefined {
  const t = text.toLowerCase();
  const sym = t.match(/[€$£]/);
  if (sym) return CURRENCY_WORDS[sym[0]];
  const word = t.match(/\b(eur|usd|gbp|aed|chf|sek|nok|dkk|pln|euros?|dollars?|pounds?)\b/);
  return word ? CURRENCY_WORDS[word[1]] : undefined;
}

/** Every distinct currency named in the text, in order of first appearance. */
export function detectCurrencies(text: string): string[] {
  const out: string[] = [];
  const re = /[€$£]|\b(?:eur|usd|gbp|aed|chf|sek|nok|dkk|pln|euros?|dollars?|pounds?)\b/gi;
  for (const m of text.matchAll(re)) {
    const c = CURRENCY_WORDS[m[0].toLowerCase()];
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** "1.234,50", "1,234.50", "12,5", "€ 12.50", 12.5 -> number. */
export function parseNumber(v: Cell): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  let s = v.replace(/[^\d.,\-]/g, "");
  if (!/\d/.test(s)) return undefined;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // The later separator is the decimal point.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function parseDutyStatus(text: string): DutyStatus | undefined {
  const found = new Set<string>();
  for (const m of text.toUpperCase().matchAll(/\bT\s?([12])\b/g)) found.add(m[1]);
  // "T1/T2" or "T1 or T2" is a column heading or an open question, not an answer.
  return found.size === 1 ? (`T${[...found][0]}` as DutyStatus) : undefined;
}

/** Words that follow an Incoterm in running text but are never a named place. */
const NOT_A_PLACE = new Set([
  "valid", "validity", "until", "prices", "price", "payment", "terms", "stock", "bonded", "duty", "t1", "t2",
  "eur", "usd", "gbp", "aed", "chf", "euro", "all", "per", "offer", "and", "or", "the", "for", "with", "from", "subject", "excl", "incl", "only",
]);

export function parseIncoterm(text: string): { incoterm?: string; place?: string } {
  const m = new RegExp(`\\b(${INCOTERMS.join("|")})\\b`, "i").exec(text);
  if (!m) return {};
  const incoterm = m[1].toUpperCase();
  // The named place must be capitalised ("FCA Rotterdam"), so "EXW prices valid" gives no place.
  const rest = text.slice(m.index + m[0].length);
  const pm = rest.match(/^[\s,:\-]*([A-Z\u00C0-\u00DE][A-Za-z\u00C0-\u017F]+(?:[ \-][A-Z\u00C0-\u00DE][A-Za-z\u00C0-\u017F]+)*)/);
  const words = (pm?.[1] ?? "").split(/[ \-]/).filter(Boolean);
  // Keep leading words up to the first filler word, at most two ("Rotterdam Bonded" -> "Rotterdam").
  const kept: string[] = [];
  for (const w of words) {
    if (NOT_A_PLACE.has(w.toLowerCase()) || INCOTERMS.includes(w.toUpperCase())) break;
    kept.push(w);
    if (kept.length === 2) break;
  }
  return { incoterm, place: kept.length ? kept.join(" ") : undefined };
}

/** Per case / bottle / pallet, from a header ("EUR / case") or a line ("per bottle"). */
export function unitFromText(text: string): PriceUnit | undefined {
  if (/(?:\bper\s*|\/\s*)(?:bottle|btl|bt|fles|flasche|botella|bouteille|bottiglia)s?\b|\bbottle\s*price\b/i.test(text)) return "bottle";
  if (/(?:\bper\s*|\/\s*)(?:case|cs|ctn|carton|box|doos|karton|ktn|caja|colis|cartone|scatola)\b|\bcase\s*price\b/i.test(text)) return "case";
  if (/(?:\bper\s*|\/\s*)(?:pallet|plt|pal)\b|\bpallet\s*price\b/i.test(text)) return "pallet";
  return undefined;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Understands 2026-11-30, 30/11/2026, 30.11.26, "30 Nov 2026", Excel dates. */
export function parseDate(v: Cell): string | undefined {
  if (v == null || v === "") return undefined;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{2,4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi >= 0) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], mi + 1, +m[1]);
  }
  return undefined;
}
function iso(y: number, mo: number, d: number): string | undefined {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseLeadTimeDays(text: string): number | undefined {
  const m = text.toLowerCase().match(/(\d+)\s*(?:-\s*\d+\s*)?(day|days|week|weeks|wk|wks|month|months)/);
  if (!m) return undefined;
  const n = +m[1];
  const unit = m[2];
  return unit.startsWith("day") ? n : unit.startsWith("w") ? n * 7 : n * 30;
}

/* -------------------------------------------------------------------------- */
/* Spreadsheets                                                               */
/* -------------------------------------------------------------------------- */

const HEADER_RULES: [FieldKey, RegExp][] = [
  ["ean", /\b(ean|gtin|barcode|upc)\b/i],
  ["minQty", /min(imum)?\.?\s*(order|qty|quantity|moq)|\bmoq\b/i],
  ["leadTime", /lead\s*time|delivery\s*time|availability/i],
  ["validUntil", /valid(ity)?|expir|good\s*until|offer\s*until|price\s*until/i],
  ["payment", /payment|terms\s*of\s*pay/i],
  ["incoterm", /incoterm|delivery\s*terms|\bterms\b/i],
  ["place", /named\s*place|incoterm\s*place|delivery\s*place|\b(?:port|city)\b/i],
  ["duty", /\bt1\b|\bt2\b|duty|bond|zoll|customs\s*status/i],
  ["location", /location|lieferort|lagerort|lieu|ubicaci[oó]n|warehouse|stock\s*(at|in)|ex[\s-]*warehouse|where/i],
  ["currency", /^(cur(rency)?|ccy|curr\.?)$/i],
  ["price", /price|preis|prix|prezzo|precio|prijs|pre[cç]o|tarif|cost|\bprc\b|per\s*(case|bottle|btl|unit)|fob|exw|ex[\s-]*works|€|\$|£|eur|usd|gbp/i],
  ["qty", /qty|quantity|menge|anzahl|quantit[eé]|quantit[aà]|cantidad|voorraad|aantal|bestand|verf[uü]gbar|disponib|available|stock|volume|cases|amount|units|pcs|pallet/i],
  ["size", /size|inhoud|inhalt|contenance|contenido|contenuto|formato|volumen|volume\s*cl|\bcl\b|\bml\b|bottle\s*size|capacity/i],
  ["pack", /pack(ing|\s*size)?|verpakking|colisage|embalaje|confezione|doos|karton|caja|bottles?\s*(per|\/)\s*case|btl\/cs|pcs\/ctn|\bcase\s*size/i],
  ["brand", /brand|producer|marque/i],
  ["supplier", /supplier|seller|vendor|\bfrom\b/i],
  ["customer", /customer|buyer|client|company|requested\s*by/i],
  ["notes", /note|remark|comment|info/i],
  ["product", /product|produkt|produit|prodotto|producto|artikel|article|bezeichnung|d[eé]signation|item|description|name|sku|reference|label|designation/i],
];

function headerField(label: string): FieldKey | undefined {
  const t = label.trim();
  if (!t) return undefined;
  for (const [key, re] of HEADER_RULES) if (re.test(t)) return key;
  return undefined;
}

/** A further price column, for sheets that quote in two currencies ("Price EUR" | "Price USD"). */
export interface ExtraPriceColumn {
  col: number;
  currency: string;
  priceUnit?: PriceUnit;
}

export interface SheetMapping {
  headerRow: number;
  /** column index -> field */
  columns: Record<number, FieldKey>;
  /** Currency named in a header such as "Price EUR". */
  headerCurrency?: string;
  /** Unit named in the price header, such as "EUR / case". */
  priceUnit?: PriceUnit;
  extraPrice?: ExtraPriceColumn[];
}

/** Headers that look like a price column but are not an offer price. */
const NOT_THE_OFFER_PRICE = /\b(old|previous|prev|was|rrp|retail|msrp|list|duty|vat)\b/i;

/** Looks in the first 25 rows for the one that looks most like a header. */
export function detectMapping(rows: Cell[][]): SheetMapping | null {
  let best: SheetMapping | null = null;
  let bestScore = 0;
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r] ?? [];
    const columns: Record<number, FieldKey> = {};
    const used = new Set<FieldKey>();
    const extraPrice: ExtraPriceColumn[] = [];
    let headerCurrency: string | undefined;
    let priceUnit: PriceUnit | undefined;
    row.forEach((cell, c) => {
      if (typeof cell !== "string") return;
      const f = headerField(cell);
      if (!f) return;
      if (f === "price" && used.has("price")) {
        const currency = detectCurrency(cell);
        if (currency && !NOT_THE_OFFER_PRICE.test(cell)) extraPrice.push({ col: c, currency, priceUnit: unitFromText(cell) });
        return;
      }
      if (used.has(f)) return;
      columns[c] = f;
      used.add(f);
      if (f === "price") {
        headerCurrency = headerCurrency ?? detectCurrency(cell);
        priceUnit = unitFromText(cell);
      }
    });
    const hasCore = used.has("product");
    const score = Object.keys(columns).length + (hasCore ? 3 : 0) + (used.has("price") ? 2 : 0);
    if (hasCore && score > bestScore) {
      bestScore = score;
      best = { headerRow: r, columns, headerCurrency, priceUnit, extraPrice: extraPrice.length ? extraPrice : undefined };
    }
  }
  return best;
}

const str = (v: Cell): string => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

export interface SheetOptions {
  /** Terms stated once at the top of the file or by the user. */
  defaults?: Partial<Pick<ParsedLine, "currency" | "dutyStatus" | "incoterm" | "incotermPlace" | "goodsLocation" | "validUntil" | "paymentTerms" | "supplierName" | "customerName">>;
  mapping?: SheetMapping;
}

type Terms = NonNullable<SheetOptions["defaults"]>;
const hasTerms = (t: Terms) => !!(t.dutyStatus || t.incoterm || t.goodsLocation || t.currency || t.validUntil || t.paymentTerms);

/** Terms printed in a note row ("STOCK IN DUNDEE - T1") apply to the rows below it. */
const SECTION_FIELDS: (keyof Terms)[] = ["dutyStatus", "incoterm", "incotermPlace", "goodsLocation", "currency", "validUntil", "paymentTerms"];


/** When headers are missing or non-English, infer product + price columns from cell shapes. */
export function inferMappingByContent(rows: Cell[][]): SheetMapping | null {
  if (rows.length < 2) return null;
  const sample = rows.slice(0, Math.min(rows.length, 30));
  const colCount = Math.max(0, ...sample.map((r) => r.length));
  if (colCount < 2) return null;

  type ColStat = { c: number; textish: number; numeric: number; avgAbs: number };
  const stats: ColStat[] = [];
  for (let c = 0; c < colCount; c++) {
    let textish = 0;
    let numeric = 0;
    let sum = 0;
    let nSum = 0;
    for (const row of sample) {
      const v = row[c];
      if (v == null || v === "") continue;
      const num = typeof v === "number" ? v : typeof v === "string" && /^-?[\d.,]+$/.test(v.trim()) ? parseNumber(v) : undefined;
      if (num != null && Number.isFinite(num)) {
        numeric++;
        sum += Math.abs(num);
        nSum++;
      } else if (typeof v === "string" && /[A-Za-z]{3}/.test(v)) textish++;
    }
    stats.push({ c, textish, numeric, avgAbs: nSum ? sum / nSum : 0 });
  }

  const productCols = stats.filter((s) => s.textish >= 2 && s.textish >= s.numeric).sort((a, b) => b.textish - a.textish);
  // Prefer unit-price columns: numeric, not the left-most qty (often integers 50–5000),
  // prefer decimals / moderate averages, and prefer rightmost when tied.
  const priceCols = stats
    .filter((s) => s.numeric >= 2 && s.numeric > s.textish)
    .sort((a, b) => {
      const aDec = a.avgAbs > 0 && a.avgAbs < 500 ? 1 : 0;
      const bDec = b.avgAbs > 0 && b.avgAbs < 500 ? 1 : 0;
      if (bDec !== aDec) return bDec - aDec;
      if (b.numeric !== a.numeric) return b.numeric - a.numeric;
      return b.c - a.c; // rightmost wins (price often last)
    });

  const bestProduct = productCols[0]?.c ?? -1;
  const bestPrice = priceCols.find((s) => s.c !== bestProduct)?.c ?? -1;
  if (bestProduct < 0 || bestPrice < 0) return null;
  return {
    headerRow: -1,
    columns: { [bestProduct]: "product", [bestPrice]: "price" },
  };
}

export function parseSheetRows(rows: Cell[][], opts: SheetOptions = {}): { lines: ParsedLine[]; mapping: SheetMapping | null } {
  const mapping = opts.mapping ?? detectMapping(rows) ?? inferMappingByContent(rows);
  if (!mapping) return { lines: [], mapping: null };

  const colOf = (f: FieldKey): number | undefined => {
    const e = Object.entries(mapping.columns).find(([, k]) => k === f)?.[0];
    return e == null ? undefined : +e;
  };
  const priceCol = colOf("price");
  const nonEmpty = (row: Cell[]) => row.filter((c) => str(c)).length;
  // A repeated header (new page, new section) reads the same as the real header row. A product row
  // can also contain header words ("Black Label 12yo", "€ 1.245,00"), so a text match alone is not
  // enough: either the cells equal the real header's text, or three columns match and none has a digit.
  const headerRow = rows[mapping.headerRow] ?? [];
  const isRepeatedHeader = (row: Cell[]) => {
    const same = headerRow.filter((h, c) => str(h) && str(row[c]).toLowerCase() === str(h).toLowerCase()).length;
    if (same >= 2) return true;
    const looks = Object.entries(mapping.columns).filter(
      ([c, f]) => typeof row[+c] === "string" && !/\d/.test(String(row[+c])) && headerField(String(row[+c])) === f,
    ).length;
    return looks >= 3;
  };
  const isTotalRow = (name: string) => /^\s*(grand\s+)?(sub\s*)?totals?\b|^\s*page\s+\d/i.test(name);

  // Pass 1: which rows are product rows, and which are notes (section headings, footers)?
  type Kind = "data" | "note" | "skip";
  const kinds: Kind[] = rows.map((row0, r) => {
    if (r <= mapping.headerRow) return "skip";
    const row = row0 ?? [];
    if (!nonEmpty(row)) return "skip";
    if (isRepeatedHeader(row)) return "skip";
    const get = (f: FieldKey) => { const c = colOf(f); return c == null ? undefined : row[c]; };
    if (isTotalRow(str(get("product")) || str(get("brand")))) return "skip";
    const hasName = !!(str(get("product")) || str(get("brand")));
    const noNumbers = parseNumber(get("price")) == null && parseNumber(get("qty")) == null;
    if (hasName && !(noNumbers && nonEmpty(row) <= 2)) return "data";
    return "note";
  });
  const lastData = kinds.lastIndexOf("data");

  // Terms above the table, and terms in a footer below the last product row.
  const preamble = mapping.headerRow >= 0
    ? rows.slice(0, mapping.headerRow).flat().map(str).filter(Boolean).join(" · ")
    : "";
  const footer = rows.filter((_, r) => kinds[r] === "note" && r > lastData).flat().map(str).filter(Boolean).join(" · ");
  const fromFooter = detectGlobalTerms(footer);
  const fromPreamble = detectGlobalTerms(preamble);
  const doc: Terms = { ...fromFooter, ...fromPreamble, ...opts.defaults };
  // The header and the footer name different Incoterms: use the header, but say so on every line.
  const conflict =
    fromFooter.incoterm && fromPreamble.incoterm && fromFooter.incoterm !== fromPreamble.incoterm
      ? `The file names both ${fromPreamble.incoterm} ${fromPreamble.incotermPlace ?? ""} (top) and ${fromFooter.incoterm} ${fromFooter.incotermPlace ?? ""} (bottom). Check which applies`.replace(/\s+/g, " ")
      : undefined;

  const priceColumns: { col: number | undefined; header?: string; unit?: PriceUnit; primary: boolean }[] = [
    { col: priceCol, header: mapping.headerCurrency, unit: mapping.priceUnit, primary: true },
    ...(mapping.extraPrice ?? []).map((e) => ({ col: e.col, header: e.currency, unit: e.priceUnit, primary: false })),
  ];

  const lines: ParsedLine[] = [];
  let section: Terms = {};
  for (let r = mapping.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (kinds[r] === "note") {
      if (r < lastData) {
        const t = detectGlobalTerms(row.map(str).filter(Boolean).join(" · "));
        // A heading that states a term starts a fresh section; a plain category heading ("WHISKY") changes nothing.
        if (hasTerms(t)) section = Object.fromEntries(SECTION_FIELDS.filter((k) => t[k] != null).map((k) => [k, t[k]])) as Terms;
      }
      continue;
    }
    if (kinds[r] !== "data") continue;

    const get = (f: FieldKey): Cell => {
      const c = colOf(f);
      return c == null ? undefined : row[c];
    };
    const product = str(get("product"));
    const brand = str(get("brand"));
    const size = str(get("size"));
    const name = [brand && !product.toLowerCase().includes(brand.toLowerCase()) ? brand : "", product, size && !/\d\s*(cl|ml|l)\b/i.test(product) ? size : ""]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!name) continue;
    const qty = parseNumber(get("qty"));
    const fromTerm = parseIncoterm(str(get("incoterm")));
    const placeCell = str(get("place"));
    const dutyRaw = str(get("duty"));
    // A remark such as "EXW Dundee" or "T1" on the row itself beats the document-wide term.
    const noteText = str(get("notes"));
    const fromNote = parseIncoterm(noteText);
    const raw = row.map(str).filter(Boolean).join(" | ");

    for (const pc of priceColumns) {
      const priceCell = pc.col == null ? undefined : row[pc.col];
      const price = parseNumber(priceCell);
      if (!pc.primary && price == null) continue; // an empty second-currency cell is not a line
      const warnings: string[] = [];
      const currency =
        (pc.primary ? detectCurrency(str(get("currency"))) : undefined) ??
        (typeof priceCell === "string" ? detectCurrency(priceCell) : undefined) ??
        pc.header ??
        section.currency ??
        doc.currency;
      if (!currency) {
        const seen = detectCurrencies([preamble, footer].join(" "));
        warnings.push(seen.length > 1 ? `No currency found (the file mentions ${seen.join(" and ")})` : "No currency found");
      }
      if (price == null) warnings.push("No price found");
      if (conflict && !fromTerm.incoterm && !fromNote.incoterm && !section.incoterm && !opts.defaults?.incoterm) warnings.push(conflict);

      const line: ParsedLine = {
        sourceRow: r + 1,
        raw: pc.primary ? raw : `${raw} [${pc.header} column]`,
        product: name,
        supplierName: str(get("supplier")) || doc.supplierName,
        customerName: str(get("customer")) || doc.customerName,
        quantity: qty,
        unitPrice: price,
        priceUnit: unitFromText(typeof priceCell === "string" ? priceCell : "") ?? pc.unit,
        currency,
        dutyStatus: parseDutyStatus(dutyRaw) ?? parseDutyStatus(str(get("incoterm"))) ?? parseDutyStatus(noteText) ?? section.dutyStatus ?? doc.dutyStatus,
        incoterm: fromTerm.incoterm ?? fromNote.incoterm ?? section.incoterm ?? doc.incoterm,
        incotermPlace: placeCell || fromTerm.place || (fromNote.incoterm && !fromTerm.incoterm ? fromNote.place : undefined) || section.incotermPlace || doc.incotermPlace,
        goodsLocation: str(get("location")) || section.goodsLocation || doc.goodsLocation,
        validUntil: parseDate(get("validUntil")) ?? section.validUntil ?? doc.validUntil,
        paymentTerms: str(get("payment")) || section.paymentTerms || doc.paymentTerms,
        leadTimeDays: parseLeadTimeDays(str(get("leadTime"))),
        minQuantity: parseNumber(get("minQty")),
        ean: str(get("ean")) || undefined,
        ...sheetPackaging(name, str(get("pack")), size),
        notes: str(get("notes")) || undefined,
        confidence: 0,
        warnings,
      };
      line.confidence = scoreLine(line);
      lines.push(line);
    }
  }
  return { lines, mapping };
}

function sheetPackaging(name: string, packCell: string, sizeCell: string) {
  const out: { bottlesPerCase?: number; bottleSizeCl?: number; abv?: number } = { ...extractPackaging(name), ...extractPackaging(sizeCell) };
  const n = parseNumber(packCell);
  if (n != null && Number.isInteger(n) && n >= 1 && n <= 100) out.bottlesPerCase = n;
  return out;
}

function scoreLine(l: ParsedLine): number {
  let s = 0.3;
  if (l.unitPrice != null) s += 0.3;
  if (l.currency) s += 0.15;
  if (l.quantity != null) s += 0.1;
  if (l.dutyStatus) s += 0.05;
  if (l.incoterm) s += 0.05;
  if (l.validUntil) s += 0.05;
  return Math.min(1, s - l.warnings.length * 0.1);
}

/* -------------------------------------------------------------------------- */
/* Free text / PDF text                                                       */
/* -------------------------------------------------------------------------- */

/** Terms that apply to the whole document: "T2 · FCA Rotterdam · valid to …". */
export function detectGlobalTerms(text: string): NonNullable<SheetOptions["defaults"]> {
  const out: NonNullable<SheetOptions["defaults"]> = {};
  const duty = parseDutyStatus(text);
  if (duty) out.dutyStatus = duty;
  const { incoterm, place } = parseIncoterm(text);
  if (incoterm) out.incoterm = incoterm;
  if (place) out.incotermPlace = place;
  const valid = text.match(/(?:valid(?:ity)?|until|expires?|good\s*until|offer\s*valid)[^0-9A-Za-z]{0,12}((?:\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})|(?:\d{4}-\d{2}-\d{2})|(?:\d{1,2}\s+[A-Za-z]{3}[a-z]*\.?\s+\d{2,4}))/i);
  if (valid) out.validUntil = parseDate(valid[1]);
  const pay = text.match(/payment(?:\s*terms)?\s*[:\-]\s*([^\n.;|]{3,60})/i);
  if (pay) out.paymentTerms = pay[1].split(/\s·\s|\s{2,}/)[0].trim();
  const loc = text.match(/(?:stock\s*(?:location|at|in)|goods\s*(?:location|at|in)|ex[\s-]*warehouse|located\s*(?:at|in))\s*[:\-]?\s*([A-Z][^\n.;|]{2,50})/i);
  if (loc) {
    // Cut at the next separator or term: "ROTTERDAM - T2" is the place Rotterdam.
    const place2 = loc[1].split(/\s[-–—]\s|\s·\s|,|\(|\bT\s?[12]\b|\b(?:valid|prices?|payment|eur|usd|gbp)\b/i)[0].trim();
    if (place2.length >= 3) out.goodsLocation = place2;
  }
  // A document that names two currencies has no single default: say nothing rather than guess.
  const currencies = detectCurrencies(text);
  if (currencies.length === 1) out.currency = currencies[0];
  return out;
}

const QTY_RE = /(\d[\d.,]*)\s*(cs|cases?|ctns?|cartons?|btls?|bottles?|pcs|pallets?|plts?|pal)\b/i;
const PRICE_RE = /(?:([€$£])\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(€|\$|£|eur|usd|gbp)\b|\b(eur|usd|gbp)\s*(\d[\d.,]*))/i;
/** A number with two decimals that is not a percentage, a size or part of "12x70cl". */
const BARE_PRICE_RE = /(?<![\d.,x×/%])(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?![\d.,%]|\s*(?:%|cl\b|ml\b|l\b|x\b))/gi;
/** Lines that carry numbers but are never products. */
const NOT_A_PRODUCT_LINE = /^\s*(?:sub\s*)?total\b|^\s*page\b|^\s*(?:tel|fax|iban|swift|bic|vat|reg|bank|account)\b/i;


/** "12x1L", "6 x 70cl", "12 × 0,7 l" -> bottles per case + size; "40%" / "43.5% vol" -> ABV. */
export function extractPackaging(text: string): { bottlesPerCase?: number; bottleSizeCl?: number; abv?: number } {
  const out: { bottlesPerCase?: number; bottleSizeCl?: number; abv?: number } = {};
  const t = text.replace(/(\d),(\d)/g, "$1.$2");
  const toCl = (v: number, u: string) => (u === "cl" ? v : u === "ml" ? v / 10 : v * 100);
  const m = t.match(/(\d{1,3})\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cl|ml|ltr|lt|l)\b/i);
  if (m) {
    out.bottlesPerCase = +m[1];
    out.bottleSizeCl = toCl(+m[2], m[3].toLowerCase());
  } else {
    const sz = t.match(/(\d+(?:\.\d+)?)\s*(cl|ml|ltr|lt|l)\b/i);
    if (sz) out.bottleSizeCl = toCl(+sz[1], sz[2].toLowerCase());
  }
  const a = t.match(/(\d{1,2}(?:\.\d)?)\s*%/);
  if (a && +a[1] >= 0.5 && +a[1] <= 96) out.abv = +a[1];
  return out;
}

/** Removes terms that belong in their own fields from a product name read out of running text. */
export function cleanProductName(name: string): string {
  let n = name;
  n = n.replace(/\b(?:valid(?:ity)?|until|expires?|good\s*until)\b.*$/i, " ");
  n = n.replace(new RegExp("\\b(?:" + INCOTERMS.join("|") + ")\\b(?:\\s+[A-Z\\u00C0-\\u00DE][\\w\\u00C0-\\u017F-]+){0,2}", "g"), " ");
  n = n.replace(/\bT\s?[12]\b/gi, " ");
  n = n.replace(/\b\d{1,2}(?:[.,]\d)?\s*%(?:\s*vol\.?)?/gi, " ");
  n = n.replace(/\b(?:bonded|duty\s*suspended|in\s*bond)\b/gi, " ");
  n = n.replace(/\s{2,}/g, " ").replace(/[\s@|;:\-–,]+$/, "").trim();
  return n.length >= 3 ? n : name.trim();
}

/** Line-by-line reader for PDF text or a pasted email body. */
export function parseTextLines(text: string, opts: SheetOptions = {}): ParsedLine[] {
  // Terms for the whole document come from the lines that are NOT priced products (greeting, headings,
  // footer). A product line saying "T1" must not change every other line, and a document whose lines
  // quote different currencies has no single default currency.
  const isPricedLine = (l: string) => PRICE_RE.test(l) || (!NOT_A_PRODUCT_LINE.test(l) && QTY_RE.test(l) && [...l.matchAll(BARE_PRICE_RE)].length === 1);
  const rawLines = text.split(/\r?\n/);
  const productLineCount = rawLines.filter((l) => isPricedLine(l.replace(/\s+/g, " ").trim())).length;
  const termsText = productLineCount >= 2 ? rawLines.filter((l) => !isPricedLine(l.replace(/\s+/g, " ").trim())).join("\n") : text;
  const globals = { ...detectGlobalTerms(termsText), ...opts.defaults };
  const seen = detectCurrencies(text);
  const lines: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 6) return;
    const pm = line.match(PRICE_RE);
    let price: number | undefined;
    let cur: string | undefined;
    let priceAt = 0;
    let priceLen = 0;
    let bare = false;
    if (pm) {
      price = parseNumber(pm[2] ?? pm[3] ?? pm[6]);
      cur = CURRENCY_WORDS[(pm[1] ?? pm[4] ?? pm[5] ?? "").toLowerCase()] ?? globals.currency;
      priceAt = pm.index ?? 0;
      priceLen = pm[0].length;
    } else if (!NOT_A_PRODUCT_LINE.test(line) && QTY_RE.test(line)) {
      // "Johnnie Walker Black 12x1L  24,50  500 cs": a price with no currency beside it. Accepted
      // only when exactly one candidate number is present, and always sent to review at low confidence.
      const found = [...line.matchAll(BARE_PRICE_RE)];
      if (found.length !== 1) return;
      price = parseNumber(found[0][1]);
      cur = globals.currency;
      priceAt = found[0].index ?? 0;
      priceLen = found[0][0].length;
      bare = true;
    } else return;
    if (price == null || price <= 0) return;

    const before = line.slice(0, priceAt).trim();
    const after = line.slice(priceAt + priceLen).trim();
    const qm = line.match(QTY_RE);
    let name = before.replace(QTY_RE, " ").replace(/[|;:\-–]+\s*$/, "").replace(/^[\d.)\s\-•*]+/, "").trim();
    if (name.length < 3) name = after.replace(QTY_RE, "").trim();
    if (name.length < 3 || !/[A-Za-z]{3}/.test(name)) return;

    const term = parseIncoterm(line);
    const pack = extractPackaging(line);
    const lineValid = detectGlobalTerms(line).validUntil;
    name = cleanProductName(name);
    const warnings: string[] = [];
    if (!cur) warnings.push(seen.length > 1 ? `No currency found (the document mentions ${seen.join(" and ")})` : "No currency found");
    if (bare) warnings.push("Price had no currency beside it, so check it");
    const l: ParsedLine = {
      sourceRow: i + 1,
      raw: line,
      product: name,
      supplierName: globals.supplierName,
      quantity: qm ? parseNumber(qm[1]) : undefined,
      unitPrice: price,
      priceUnit: unitFromText(line),
      currency: cur,
      dutyStatus: parseDutyStatus(line) ?? globals.dutyStatus,
      incoterm: term.incoterm ?? globals.incoterm,
      incotermPlace: term.place ?? globals.incotermPlace,
      goodsLocation: globals.goodsLocation,
      validUntil: lineValid ?? globals.validUntil,
      paymentTerms: globals.paymentTerms,
      leadTimeDays: parseLeadTimeDays(line),
      ...pack,
      confidence: 0,
      warnings,
    };
    // Text lines are less structured than a table, so cap confidence (lower again for a bare price).
    l.confidence = Math.min(bare ? 0.55 : 0.85, scoreLine(l) - 0.1);
    lines.push(l);
  });
  return lines;
}

/* -------------------------------------------------------------------------- */
/* PDF text                                                                   */
/* -------------------------------------------------------------------------- */

/** One text run from the PDF text layer. x and y are page coordinates; y grows upward. */
export interface PdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Rebuilds printed rows from text runs. Runs whose baselines are within a small
 * tolerance form one row (a superscript or a slightly shifted cell no longer
 * splits a row). Within a row, a small gap joins words with one space and a
 * wide gap, a column break, uses two spaces so the table reader can split on it.
 */
export function rowsFromPdfItems(items: PdfItem[]): string[] {
  const real = items.filter((it) => it.str.trim());
  const sorted = [...real].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfItem[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    // Compare with the row's first run so a long row cannot drift.
    if (row && Math.abs(row[0].y - it.y) <= 2.5) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let out = "";
    row.forEach((it, i) => {
      if (i === 0) { out = it.str.trim(); return; }
      const prev = row[i - 1];
      const charW = prev.width > 0 ? prev.width / Math.max(1, prev.str.length) : 5;
      const gap = it.x - (prev.x + prev.width);
      out += (gap > charW * 2.2 ? "  " : gap > charW * 0.15 ? " " : "") + it.str.trim();
    });
    return out;
  });
}

/**
 * Reads the text of a price-list PDF. Many are tables, some are running lines,
 * and many mix the two. Both readers are tried and the one that finds more
 * priced products wins (a tie goes to the table, which keeps column meaning).
 */
export function parsePdfText(text: string, opts: SheetOptions = {}): ParsedLine[] {
  const asText = parseTextLines(text, opts);
  const rows = text.split(/\r?\n/).map((l) => l.split(/\s{2,}|\t/).map((c) => c.trim()));
  const asTable = parseSheetRows(rows, opts).lines;
  const priced = (ls: ParsedLine[]) => ls.filter((l) => l.unitPrice != null).length;
  return priced(asTable) >= priced(asText) ? asTable : asText;
}

/** Minimal CSV reader (quotes, commas, semicolons, tabs). */
export function parseCsv(text: string): Cell[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/* -------------------------------------------------------------------------- */
/* Lines -> review-queue records                                              */
/* -------------------------------------------------------------------------- */

export interface ImportContext {
  supplierId?: string;
  supplierName: string;
  source: "pdf" | "excel" | "email" | "manual";
  sourceRef: string;
  batchId: string;
  products: Product[];
  existing: PricingRecord[];
  nowIso: string;
}

export interface OfferDraft extends Omit<PricingRecord, "id" | "createdAt" | "updatedAt"> {
  duplicateOf?: string;
  matchedProductName?: string;
}

/** A line becomes a pending offer, linked to the catalogue where the name
 *  (or an alias) matches, and flagged when we already hold the same offer. */
export function linesToOfferDrafts(lines: ParsedLine[], ctx: ImportContext): OfferDraft[] {
  return lines
    .filter((l) => l.unitPrice != null)
    .map((l) => {
      const found = findProduct(l.product, ctx.products);
      const supplierName = l.supplierName || ctx.supplierName;
      const dupe = ctx.existing.find(
        (o) =>
          o.supplierName.toLowerCase() === supplierName.toLowerCase() &&
          o.currency === (l.currency ?? o.currency) &&
          Math.abs(o.unitPrice - (l.unitPrice ?? 0)) < 0.005 &&
          (found ? o.productId === found.product.id : o.productName.toLowerCase() === l.product.toLowerCase()),
      );
      const draft: OfferDraft = {
        productId: found?.product.id,
        productName: found?.product.name ?? l.product,
        supplierId: ctx.supplierId,
        supplierName,
        quantity: l.quantity,
        unitPrice: l.unitPrice as number,
        priceUnit: l.priceUnit,
        // No guessing: a line with no currency keeps a blank one and a warning for the reviewer.
        currency: l.currency ?? "",
        validUntil: l.validUntil,
        source: ctx.source,
        sourceRef: ctx.sourceRef,
        status: "pending_review",
        extractedAt: ctx.nowIso,
        originalText: l.raw,
        dutyStatus: l.dutyStatus,
        incoterm: l.incoterm,
        incotermPlace: l.incotermPlace,
        goodsLocation: l.goodsLocation,
        paymentTerms: l.paymentTerms,
        leadTimeDays: l.leadTimeDays,
        minQuantity: l.minQuantity,
        importBatchId: ctx.batchId,
        confidence: Math.max(0, l.confidence - (found ? 0 : 0.1)),
        duplicateOf: dupe?.id,
        matchedProductName: found ? found.product.name : undefined,
      };
      return draft;
    });
}
