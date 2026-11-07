/**
 * One calculation of a company's trading figures (deals, volume, net margin).
 *
 * Every screen that shows a customer's or supplier's numbers (the Contacts
 * directory, the old customer / supplier detail screen, anything added later)
 * must call this, so the same company can never show two different figures.
 *
 * Rules, written once here:
 *  - Only real deals count: cancelled deals and deals still waiting for
 *    approval (auto-captured from email or documents) are left out.
 *  - Money is kept per currency. Nothing here ever adds EUR to USD.
 *  - Volume is the gross trading value of the deal, i.e. the sale price the
 *    client pays. "Sold to" is what a company bought from TFL, "bought from"
 *    is what TFL paid it as supplier. A company that is both sees both.
 *  - Net margin is the margin actually received (actualMargin), never a forecast.
 *  - A company can hold several underlying records (a customer record and a
 *    supplier record), so figures are taken over all of its record ids.
 */
import type { Deal } from "./domain";
import { money } from "./format";

export type MoneyByCurrency = Record<string, number>;

export interface PartyFigures {
  deals: number;
  /** Gross trading value (sale price) of every live deal the company is in. */
  volume: MoneyByCurrency;
  /** Sale price of deals where the company is the client. */
  soldTo: MoneyByCurrency;
  /** Purchase price of deals where the company is the supplier. */
  boughtFrom: MoneyByCurrency;
  /** Net margin received on those deals. */
  netMargin: MoneyByCurrency;
  lastDeal?: string;
}

/** A deal that counts in any figure: not cancelled and not awaiting approval. */
export const isRealDeal = (d: Deal): boolean => d.stage !== "cancelled" && !d.pendingApproval;

const add = (m: MoneyByCurrency, currency: string, amount: number) => {
  if (!amount) return;
  m[currency] = (m[currency] ?? 0) + amount;
};

export function figuresFor(recordIds: string[], deals: Deal[]): PartyFigures {
  const ids = new Set(recordIds);
  const out: PartyFigures = { deals: 0, volume: {}, soldTo: {}, boughtFrom: {}, netMargin: {} };
  const dates: string[] = [];
  for (const d of deals) {
    const asClient = ids.has(d.clientId);
    const asSupplier = ids.has(d.supplierId);
    if (!asClient && !asSupplier) continue;
    if (!isRealDeal(d)) continue;
    out.deals += 1;
    add(out.volume, d.currency, d.salePrice);
    if (asClient) add(out.soldTo, d.currency, d.salePrice);
    if (asSupplier) add(out.boughtFrom, d.currency, d.purchasePrice);
    add(out.netMargin, d.currency, d.actualMargin ?? 0);
    dates.push(d.createdAt);
  }
  out.lastDeal = dates.sort().reverse()[0];
  return out;
}

/** "€120,000 · US$40,000", one entry per currency in currency-code order (amounts in different currencies are never compared). "—" when empty. */
export function formatByCurrency(m: MoneyByCurrency): string {
  const parts = Object.entries(m)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([c, v]) => money(v, c));
  return parts.length ? parts.join(" · ") : "—";
}

/** Sum amounts into per-currency buckets (for things like unpaid invoices). */
export function sumByCurrency<T>(rows: T[], currencyOf: (r: T) => string, amountOf: (r: T) => number): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  for (const r of rows) add(out, currencyOf(r), amountOf(r));
  return out;
}
