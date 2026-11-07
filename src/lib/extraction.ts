/**
 * The Film Location CRM — deterministic text extraction.
 *
 * These four helpers are pure string work: they take text in and give values
 * back, touching no React and no store. They lived inside `store.tsx` until
 * this pass, which had one concrete consequence — `extraction.test.ts` could
 * not be loaded by any runner that doesn't compile JSX, so the parsing rules
 * the pricing queue depends on were the one part of the logic layer with tests
 * written but never actually executed.
 *
 * Nothing about the behaviour changed in the move. `store.tsx` re-exports all
 * of it, so every existing import path still resolves.
 */

import type { Document } from "./domain";

/** Maps a filename onto a document category so filed attachments land in the
 *  right bucket instead of everything becoming "other". */
export function inferDocumentType(name: string): Document["type"] {
  const n = name.toLowerCase();
  if (/(^|[^a-z])inv|invoice/.test(n)) return "invoice";
  if (/(^|[^a-z])qt|quotation|quote/.test(n)) return "quotation";
  if (/(^|[^a-z])so|order/.test(n)) return "order";
  if (/kyc|onboarding|incorporation/.test(n)) return "kyc";
  if (/cert|iso|insurance/.test(n)) return "certificate";
  if (/contract|agreement/.test(n)) return "contract";
  return "correspondence";
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD",
  "£": "GBP",
  "€": "EUR",
};

export interface ParsedTerms {
  quantity?: number;
  unitPrice?: number;
  currency?: string;
  deliveryInfo?: string;
  commercialTerms?: string;
  productName?: string;
}

/**
 * Pulls commercial terms out of free-text supplier correspondence.
 *
 * This is the deterministic pass that stands in for the LLM call in the hosted
 * product. It is deliberately conservative: if it cannot find a unit price it
 * returns nothing rather than guessing, because a wrong price banked silently
 * is far more damaging than an offer that needs typing in by hand.
 */
export function parseCommercialTerms(text: string): ParsedTerms {
  const out: ParsedTerms = {};
  const flat = text.replace(/\s+/g, " ");

  // Unit price: "at $1.98 each", "EUR 11.40/m", "GBP 3.25 per unit".
  const priceMatch =
    flat.match(/(?:at|@)\s*([$£€])\s*([\d,]+(?:\.\d+)?)/i) ||
    flat.match(/\b(USD|GBP|EUR|CNY)\s*([\d,]+(?:\.\d+)?)/i) ||
    flat.match(/([$£€])\s*([\d,]+(?:\.\d+)?)\s*(?:each|per|\/)/i);
  if (priceMatch) {
    const token = priceMatch[1];
    out.currency = CURRENCY_SYMBOLS[token] || token.toUpperCase();
    out.unitPrice = Number(priceMatch[2].replace(/,/g, ""));
  }

  // Quantity: "5,000 units", "500 pcs", "240 boxes".
  const qtyMatch = flat.match(/([\d,]+)\s*(?:units?|pcs|pieces|boxes|bags|tonnes?|m\b)/i);
  if (qtyMatch) out.quantity = Number(qtyMatch[1].replace(/,/g, ""));

  // Delivery: "delivery in 3 weeks", "lead time 12–15 working days".
  const deliveryMatch = flat.match(
    /(?:delivery|lead time)[^.]{0,60}?(\d+(?:\s*[–-]\s*\d+)?\s*(?:working\s*)?(?:days?|weeks?|months?))/i,
  );
  if (deliveryMatch) out.deliveryInfo = deliveryMatch[1].trim();

  // Incoterm and payment terms sit together as free-text commercial terms.
  const parts: string[] = [];
  const incoterm = flat.match(/\b(FOB|CIF|EXW|DDP|DAP|FCA|CFR)\s+[A-Z][A-Za-z]+/);
  if (incoterm) parts.push(incoterm[0]);
  const payment = flat.match(/(?:terms|payment)[^.]{0,80}/i);
  if (payment) parts.push(payment[0].trim());
  if (parts.length) out.commercialTerms = parts.join(" · ");

  return out;
}

/**
 * Fills the merge fields a campaign template can use. Unknown tokens are left
 * alone rather than blanked, so a typo shows up in the preview instead of
 * silently mailing a sentence with a hole in it.
 */
export function renderTemplate(body: string, recipientName: string, senderName: string) {
  const first = recipientName.split(/\s+/)[0] || recipientName;
  return body
    .replace(/\{\{\s*first_name\s*\}\}/g, first)
    .replace(/\{\{\s*name\s*\}\}/g, recipientName)
    .replace(/\{\{\s*company\s*\}\}/g, recipientName)
    .replace(/\{\{\s*sender_name\s*\}\}/g, senderName);
}
