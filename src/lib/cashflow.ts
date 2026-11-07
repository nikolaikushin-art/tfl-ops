/**
 * The Film Location CRM — Cash Flow logic (v25). Pure, per currency, never converts.
 *
 * In:  margins awaiting release per deal, split confirmed / likely / possible.
 * Out: supplier prepayments, storage fees, unpaid expenses, regular commitments.
 * Plus: opening cash (from Xero bank feeds once live; typed in until then),
 * a 4 / 8 / 12-week forecast, a low-cash warning and stuck-funds / short-payment flags.
 */
import type { Deal, Expense } from "@/lib/domain";
import type { Signal } from "@/lib/signals";
import { expectedNet, isAwaitingRelease } from "@/lib/deals";

const DAY = 86400000;
export const STUCK_DAYS_DEFAULT = 14;

export type Confidence = "confirmed" | "likely" | "possible";
export type CommitmentKind = "supplier_prepayment" | "storage" | "regular" | "other";
export type Frequency = "once" | "weekly" | "monthly";

export const COMMITMENT_LABEL: Record<CommitmentKind, string> = {
  supplier_prepayment: "Supplier prepayment",
  storage: "Storage fees",
  regular: "Regular commitment",
  other: "Other",
};

export interface Commitment {
  id: string;
  label: string;
  kind: CommitmentKind;
  amount: number;
  currency: string;
  frequency: Frequency;
  /** First (or only) date, YYYY-MM-DD. */
  start: string;
  /** Last date it applies, if it stops. */
  end?: string;
}

export interface CashSettings {
  /** Current balance per currency (typed in until the Xero bank feed is live). */
  cashNow: Record<string, number>;
  /** Warn when a projected balance falls below this, per currency. */
  lowCash: Record<string, number>;
  stuckDays: number;
  commitments: Commitment[];
}
export const EMPTY_CASH: CashSettings = { cashNow: {}, lowCash: {}, stuckDays: STUCK_DAYS_DEFAULT, commitments: [] };

const ts = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return iso(target.getTime());
}

/** Dates a commitment falls due inside (from, to] — from exclusive so a period never double counts. */
export function occurrences(c: Commitment, from: string, to: string): string[] {
  const out: string[] = [];
  const end = c.end && ts(c.end) < ts(to) ? c.end : to;
  if (c.frequency === "once") {
    if (ts(c.start) > ts(from) && ts(c.start) <= ts(end)) out.push(c.start);
    return out;
  }
  if (c.frequency === "weekly") {
    for (let t = ts(c.start); t <= ts(end); t += 7 * DAY) if (t > ts(from)) out.push(iso(t));
    return out;
  }
  for (let i = 0; ; i++) {
    const d = addMonths(c.start, i);
    if (ts(d) > ts(end)) break;
    if (ts(d) > ts(from)) out.push(d);
    if (i > 600) break;
  }
  return out;
}

export interface IncomingItem {
  deal: Deal;
  amount: number;
  currency: string;
  expected: string;
  confidence: Confidence;
  daysInEscrow: number;
  stuck: boolean;
}

/** Margins still to land, per deal. Deposit not yet in => "possible"; deposit in => "likely"; release confirmed => "confirmed". */
export function incomingItems(deals: Deal[], now: string, stuckDays = STUCK_DAYS_DEFAULT): IncomingItem[] {
  const out: IncomingItem[] = [];
  for (const d of deals) {
    if (d.stage === "cancelled" || d.stage === "margin_received" || d.stage === "booked") continue;
    const awaiting = isAwaitingRelease(d);
    if (!awaiting && d.stage !== "awaiting_deposit" && d.stage !== "agreed") continue;
    const confidence: Confidence = d.checklist.releaseConfirmed ? "confirmed" : d.checklist.depositConfirmed || awaiting ? "likely" : "possible";
    const fallbackDays = confidence === "possible" ? 21 : 7;
    const expected = (d.releaseDate ?? iso(ts(now) + fallbackDays * DAY)).slice(0, 10);
    const days = d.depositDate ? Math.max(0, Math.floor((ts(now) - ts(d.depositDate)) / DAY)) : 0;
    out.push({ deal: d, amount: expectedNet(d), currency: d.currency, expected, confidence, daysInEscrow: days, stuck: awaiting && days > stuckDays });
  }
  return out.sort((a, b) => a.expected.localeCompare(b.expected));
}

/** Margin received is less than the deal expected: flag the shortfall (per deal, same currency). */
export function shortPayments(deals: Deal[]): { deal: Deal; expected: number; received: number; shortBy: number }[] {
  const out: { deal: Deal; expected: number; received: number; shortBy: number }[] = [];
  for (const d of deals) {
    if (d.actualMargin === undefined) continue;
    const exp = expectedNet(d);
    const short = Math.round((exp - d.actualMargin) * 100) / 100;
    if (short > 0.5) out.push({ deal: d, expected: exp, received: d.actualMargin, shortBy: short });
  }
  return out;
}

export interface OutgoingItem { label: string; kind: CommitmentKind | "expense"; amount: number; currency: string; date: string }

export function outgoingItems(expenses: Expense[], commitments: Commitment[], from: string, to: string): OutgoingItem[] {
  const out: OutgoingItem[] = [];
  for (const e of expenses) {
    if (e.isPaid) continue;
    // Unpaid expenses fall due now unless dated in the future.
    const date = ts(e.date) > ts(from) ? e.date.slice(0, 10) : iso(ts(from) + DAY);
    if (ts(date) <= ts(to)) out.push({ label: e.description, kind: "expense", amount: e.net + e.vat, currency: e.currency, date });
  }
  for (const c of commitments) for (const date of occurrences(c, from, to)) out.push({ label: c.label, kind: c.kind, amount: c.amount, currency: c.currency, date });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface CurrencyForecast {
  currency: string;
  opening: number | null;
  in: Record<Confidence, number>;
  inTotal: number;
  out: number;
  net: number;
  closing: number | null;
  /** Lowest projected balance at any week end, and when. null if opening cash unknown. */
  lowest: { balance: number; week: number } | null;
  breachesLowCash: boolean;
}

export function forecast(args: {
  weeks: number; now: string; deals: Deal[]; expenses: Expense[]; settings: CashSettings;
  /** Count only these confidence levels as income (default: all). */
  include?: Confidence[];
}): CurrencyForecast[] {
  const { weeks, now, deals, expenses, settings } = args;
  const include = args.include ?? ["confirmed", "likely", "possible"];
  const end = iso(ts(now) + weeks * 7 * DAY);
  const incoming = incomingItems(deals, now, settings.stuckDays).filter((i) => ts(i.expected) <= ts(end));
  const outgoing = outgoingItems(expenses, settings.commitments, now, end);
  const currencies = new Set<string>([...incoming.map((i) => i.currency), ...outgoing.map((o) => o.currency), ...Object.keys(settings.cashNow)]);
  const result: CurrencyForecast[] = [];
  for (const cur of currencies) {
    const inBy: Record<Confidence, number> = { confirmed: 0, likely: 0, possible: 0 };
    for (const i of incoming) if (i.currency === cur) inBy[i.confidence] += i.amount;
    const inTotal = include.reduce((s, c) => s + inBy[c], 0);
    const outTotal = outgoing.filter((o) => o.currency === cur).reduce((s, o) => s + o.amount, 0);
    const opening = settings.cashNow[cur] ?? null;
    let lowest: CurrencyForecast["lowest"] = null;
    if (opening !== null) {
      for (let w = 1; w <= weeks; w++) {
        const wEnd = ts(now) + w * 7 * DAY;
        const wIn = incoming.filter((i) => i.currency === cur && include.includes(i.confidence) && ts(i.expected) <= wEnd).reduce((s, i) => s + i.amount, 0);
        const wOut = outgoing.filter((o) => o.currency === cur && ts(o.date) <= wEnd).reduce((s, o) => s + o.amount, 0);
        const bal = opening + wIn - wOut;
        if (!lowest || bal < lowest.balance) lowest = { balance: Math.round(bal * 100) / 100, week: w };
      }
    }
    const threshold = settings.lowCash[cur];
    result.push({
      currency: cur, opening, in: inBy, inTotal, out: outTotal, net: inTotal - outTotal,
      closing: opening === null ? null : opening + inTotal - outTotal,
      lowest,
      breachesLowCash: !!lowest && threshold !== undefined && lowest.balance < threshold,
    });
  }
  return result.sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Share of expected income per currency (nominal, for exposure only, never summed across currencies). */
export function currencyExposure(items: IncomingItem[]): { currency: string; amount: number; sharePct: number }[] {
  const by: Record<string, number> = {};
  for (const i of items) by[i.currency] = (by[i.currency] ?? 0) + i.amount;
  const total = Object.values(by).reduce((a, b) => a + Math.abs(b), 0) || 1;
  return Object.entries(by).map(([currency, amount]) => ({ currency, amount, sharePct: Math.round((Math.abs(amount) / total) * 100) })).sort((a, b) => b.amount - a.amount);
}

/** Dashboard / bell items: stuck funds, short payments, low cash. */
export function cashNotifications(args: { deals: Deal[]; expenses: Expense[]; settings: CashSettings; now: string; weeks?: number }): Signal[] {
  const { deals, expenses, settings, now } = args;
  const out: Signal[] = [];
  for (const s of shortPayments(deals)) {
    out.push({
      id: `cash-short:${s.deal.id}`, kind: "data", severity: "high",
      title: `${s.deal.ref}: margin received is short`,
      detail: `Expected ${s.expected.toFixed(2)} ${s.deal.currency}, received ${s.received.toFixed(2)} (short by ${s.shortBy.toFixed(2)})`,
      action: "Open the deal", target: "dealdesk", recordId: s.deal.id, weight: 72,
    });
  }
  for (const f of forecast({ weeks: args.weeks ?? 8, now, deals, expenses, settings, include: ["confirmed", "likely"] })) {
    if (!f.breachesLowCash || !f.lowest) continue;
    out.push({
      id: `cash-low:${f.currency}`, kind: "pipeline", severity: f.lowest.balance < 0 ? "critical" : "high",
      title: `Low cash forecast in ${f.currency}`,
      detail: `Projected ${f.lowest.balance.toFixed(2)} ${f.currency} by week ${f.lowest.week} (confirmed + likely income only)`,
      action: "Open Cash Flow", target: "cashflow", weight: f.lowest.balance < 0 ? 90 : 68,
    });
  }
  return out;
}
