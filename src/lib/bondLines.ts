/**
 * The Film Location CRM — VAT / duty line check (v23). Pure helpers.
 *
 * TFL trades back-to-back under bond (T1/T2 only): no duty, no VAT. A
 * quotation, order or invoice therefore carries no tax line. This module
 * finds anything that looks like one on older records and builds the patch
 * that removes it.
 */
import type { QuotationLine } from "./domain";
import { round2 } from "./lines";

export interface TaxBearing {
  lines: Pick<QuotationLine, "id" | "description" | "quantity" | "unitPrice" | "discountPct">[];
  subtotal: number;
  tax: number;
  total: number;
  taxRatePct?: number;
}

/** A line whose description is itself a tax/duty charge ("VAT 20%", "Excise duty"). */
const TAX_LINE = /\b(vat|value added tax|duty|duties|excise|customs duty|import tax|sales tax|gst)\b/i;
export const isTaxLine = (description: string) => TAX_LINE.test(description ?? "");

export interface BondCheck {
  clean: boolean;
  /** Tax amount sitting in the total. */
  taxAmount: number;
  taxRatePct: number;
  /** Lines that are themselves a VAT/duty charge. */
  taxLineIds: string[];
}

export function bondCheck(doc: TaxBearing): BondCheck {
  const taxLineIds = doc.lines.filter((l) => isTaxLine(l.description)).map((l) => l.id);
  const taxAmount = round2(doc.tax || 0);
  const taxRatePct = doc.taxRatePct ?? 0;
  return { clean: taxAmount === 0 && taxRatePct === 0 && taxLineIds.length === 0, taxAmount, taxRatePct, taxLineIds };
}

/** Net of one line, same rule as lib/lines (discount applied, never negative). */
const net = (l: Pick<QuotationLine, "quantity" | "unitPrice" | "discountPct">) =>
  round2(Math.max(0, l.quantity || 0) * Math.max(0, l.unitPrice || 0) * (1 - Math.min(100, Math.max(0, l.discountPct ?? 0)) / 100));

/** What to write back so the record has no VAT/duty: tax-charge lines dropped,
 *  tax zero, total = subtotal of the goods lines. */
export function stripTaxPatch<L extends TaxBearing["lines"][number]>(doc: { lines: L[] }): {
  lines: L[];
  subtotal: number;
  tax: number;
  total: number;
  taxRatePct: number;
} {
  const lines = doc.lines.filter((l) => !isTaxLine(l.description));
  const subtotal = round2(lines.reduce((s, l) => s + net(l), 0));
  return { lines, subtotal, tax: 0, total: subtotal, taxRatePct: 0 };
}
