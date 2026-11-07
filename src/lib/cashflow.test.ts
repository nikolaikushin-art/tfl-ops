import { describe, expect, it } from "vitest";
import {
  occurrences, incomingItems, shortPayments, outgoingItems, forecast, currencyExposure, cashNotifications,
  EMPTY_CASH, type Commitment, type CashSettings,
} from "./cashflow";
import { blankDeal } from "./deals";
import type { Deal, Expense } from "./domain";

const NOW = "2026-10-05";
let n = 0;
const deal = (over: Partial<Deal> = {}): Deal => ({
  ...blankDeal(`RG-2026-${++n}`, { salePrice: 100000, purchasePrice: 97000, escrowFees: 400, bankCharges: 100, currency: "EUR", stage: "in_escrow" }),
  id: `d${n}`, createdAt: NOW, updatedAt: NOW, ...over,
} as Deal);
const expense = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", date: "2026-10-01", description: "Storage invoice", category: "other" as never, net: 500, vat: 0, currency: "EUR", isPaid: false, createdAt: NOW, ...over,
});
const settings = (over: Partial<CashSettings> = {}): CashSettings => ({ ...EMPTY_CASH, ...over });
const rent: Commitment = { id: "c1", label: "Office", kind: "regular", amount: 1000, currency: "GBP", frequency: "monthly", start: "2026-10-15" };

describe("cash flow: commitments", () => {
  it("monthly occurrences fall inside the window only, from-exclusive", () => {
    expect(occurrences(rent, "2026-10-05", "2026-12-31")).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
    expect(occurrences(rent, "2026-10-15", "2026-11-20")).toEqual(["2026-11-15"]);
  });
  it("month-end dates clamp (31 Jan then 28 Feb)", () => {
    const c = { ...rent, start: "2027-01-31" };
    expect(occurrences(c, "2027-01-01", "2027-03-31")).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });
  it("weekly, once and end date", () => {
    const w: Commitment = { ...rent, frequency: "weekly", start: "2026-10-06", end: "2026-10-20" };
    expect(occurrences(w, "2026-10-05", "2026-12-31")).toHaveLength(3);
    expect(occurrences({ ...rent, frequency: "once", start: "2026-11-01" }, "2026-10-05", "2026-10-31")).toHaveLength(0);
    expect(occurrences({ ...rent, frequency: "once", start: "2026-10-20" }, "2026-10-05", "2026-10-31")).toEqual(["2026-10-20"]);
  });
});

describe("cash flow: money coming in", () => {
  it("splits confirmed / likely / possible", () => {
    const items = incomingItems([
      deal({ checklist: { kycApproved: true, contractSigned: true, preAdviceReceived: true, depositConfirmed: true, releaseConfirmed: true } }),
      deal({ stage: "in_escrow" }),
      deal({ stage: "awaiting_deposit" }),
    ], NOW);
    expect(items.map((i) => i.confidence).sort()).toEqual(["confirmed", "likely", "possible"]);
    expect(items[0].amount).toBe(2500);
  });
  it("ignores deals that are finished or cancelled", () => {
    expect(incomingItems([deal({ stage: "margin_received" }), deal({ stage: "booked" }), deal({ stage: "cancelled" })], NOW)).toHaveLength(0);
  });
  it("flags funds stuck in escrow beyond the set number of days", () => {
    const [a] = incomingItems([deal({ depositDate: "2026-09-01" })], NOW, 14);
    expect(a.stuck).toBe(true);
    const [b] = incomingItems([deal({ depositDate: "2026-10-01" })], NOW, 14);
    expect(b.stuck).toBe(false);
  });
  it("flags a short payment", () => {
    const s = shortPayments([deal({ stage: "margin_received", actualMargin: 2000 }), deal({ stage: "margin_received", actualMargin: 2500 })]);
    expect(s).toHaveLength(1);
    expect(s[0].shortBy).toBe(500);
  });
});

describe("cash flow: money going out and the forecast", () => {
  it("includes unpaid expenses and commitments, skips paid expenses", () => {
    const out = outgoingItems([expense(), expense({ id: "e2", isPaid: true })], [rent], NOW, "2026-11-30");
    expect(out.filter((o) => o.kind === "expense")).toHaveLength(1);
    expect(out.filter((o) => o.kind === "regular")).toHaveLength(2);
  });
  it("keeps each currency separate and never adds EUR to GBP", () => {
    const f = forecast({ weeks: 8, now: NOW, deals: [deal()], expenses: [expense()], settings: settings({ commitments: [rent] }) });
    expect(f.map((x) => x.currency)).toEqual(["EUR", "GBP"]);
    expect(f.find((x) => x.currency === "EUR")!.inTotal).toBe(2500);
    expect(f.find((x) => x.currency === "EUR")!.out).toBe(500);
    expect(f.find((x) => x.currency === "GBP")!.out).toBe(2000);
  });
  it("the horizon matters: 4 weeks vs 12 weeks", () => {
    const f4 = forecast({ weeks: 4, now: NOW, deals: [], expenses: [], settings: settings({ commitments: [rent] }) });
    const f12 = forecast({ weeks: 12, now: NOW, deals: [], expenses: [], settings: settings({ commitments: [rent] }) });
    expect(f4[0].out).toBe(1000);
    expect(f12[0].out).toBe(3000);
  });
  it("opening cash gives a closing balance and a lowest point; unknown cash stays null", () => {
    const withCash = forecast({ weeks: 8, now: NOW, deals: [], expenses: [], settings: settings({ cashNow: { GBP: 1500 }, commitments: [rent] }) })[0];
    expect(withCash.closing).toBe(-500);
    expect(withCash.lowest?.balance).toBe(-500);
    const without = forecast({ weeks: 8, now: NOW, deals: [], expenses: [], settings: settings({ commitments: [rent] }) })[0];
    expect(without.closing).toBeNull();
    expect(without.lowest).toBeNull();
  });
  it("low-cash warning uses the threshold and only confirmed + likely income", () => {
    const poss = deal({ stage: "awaiting_deposit" });
    const s = settings({ cashNow: { EUR: 100 }, lowCash: { EUR: 50 }, commitments: [{ ...rent, currency: "EUR", amount: 400, frequency: "once", start: "2026-10-10" }] });
    // possible income would rescue the balance, but it must not be counted for the warning
    const notes = cashNotifications({ deals: [poss], expenses: [], settings: s, now: NOW });
    expect(notes.filter((x) => x.id === "cash-low:EUR")).toHaveLength(1);
    expect(notes[0].severity).toBe("critical");
    expect(cashNotifications({ deals: [], expenses: [], settings: settings({ cashNow: { EUR: 1000 }, lowCash: { EUR: 50 } }), now: NOW })).toHaveLength(0);
  });
  it("low-cash notification opens the Cash Flow page (route id \"cashflow\", not the old \"credit\")", () => {
    const s = settings({ cashNow: { EUR: 100 }, lowCash: { EUR: 50 }, commitments: [{ ...rent, currency: "EUR", amount: 400, frequency: "once", start: "2026-10-10" }] });
    const note = cashNotifications({ deals: [], expenses: [], settings: s, now: NOW }).find((x) => x.id === "cash-low:EUR");
    expect(note?.target).toBe("cashflow");
  });
  it("currency exposure is a share of nominal income per currency", () => {
    const items = incomingItems([deal({ currency: "EUR" }), deal({ currency: "USD" }), deal({ currency: "USD" })], NOW);
    const e = currencyExposure(items);
    expect(e.find((x) => x.currency === "USD")!.sharePct).toBe(67);
    expect(e.reduce((s, x) => s + x.sharePct, 0)).toBe(100);
  });
});
