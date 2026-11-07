import { describe, expect, it } from "vitest";
import {
  EMPTY_RESIDENCY, fillRange, eachDay, taxYearOf, taxYearBounds, daysInCountry, totalsByCountry, limitStatus,
  gaps, suggestFromEmails, addSuggestion, confirmRange, exportForAdvisor, residencyNotifications, evidenceFor,
  daysWithoutEvidence, parseLooseDate, type ResidencyData,
} from "./residency";

const base = (over: Partial<ResidencyData> = {}): ResidencyData => ({ ...EMPTY_RESIDENCY, ...over });

describe("residency: counting", () => {
  it("lists every date in a range, inclusive, and nothing for a backwards range", () => {
    expect(eachDay("2026-02-27", "2026-03-02")).toHaveLength(4);
    expect(eachDay("2026-03-02", "2026-02-27")).toHaveLength(0);
  });
  it("tax years: calendar year, and a 6 April year", () => {
    expect(taxYearOf("2026-12-31")).toBe("2026");
    expect(taxYearOf("2026-04-05", "04-06")).toBe("2025/26");
    expect(taxYearOf("2026-04-06", "04-06")).toBe("2026/27");
    expect(taxYearBounds("2026/27", "04-06")).toEqual({ from: "2026-04-06", to: "2027-04-05" });
  });
  it("running totals per country per tax year", () => {
    let d = fillRange(base(), "2026-01-01", "2026-01-10", "United Kingdom");
    d = fillRange(d, "2026-01-11", "2026-01-15", "France");
    d = fillRange(d, "2027-01-01", "2027-01-03", "United Kingdom");
    expect(daysInCountry(d, "United Kingdom", "2026")).toBe(10);
    expect(daysInCountry(d, "United Kingdom", "2027")).toBe(3);
    const t = totalsByCountry(d);
    expect(t.find((x) => x.country === "France")?.days).toBe(5);
    expect(t).toHaveLength(3);
  });
  it("a later entry for the same date replaces the earlier one (no double counting)", () => {
    let d = fillRange(base(), "2026-05-01", "2026-05-05", "Spain");
    d = fillRange(d, "2026-05-03", "2026-05-03", "Portugal");
    expect(daysInCountry(d, "Spain", "2026")).toBe(4);
    expect(daysInCountry(d, "Portugal", "2026")).toBe(1);
  });
  it("counting rule: midnight vs any presence", () => {
    const d = base({
      days: [{ date: "2026-06-01", country: "France", alsoIn: ["United Kingdom"], confirmed: true, source: "manual" }],
      rules: [{ country: "United Kingdom", taxYearStart: "01-01", counting: "any_presence" }],
    });
    expect(daysInCountry(d, "United Kingdom", "2026")).toBe(1);
    const m = { ...d, rules: [{ country: "United Kingdom", taxYearStart: "01-01", counting: "midnight" as const }] };
    expect(daysInCountry(m, "United Kingdom", "2026")).toBe(0);
  });
  it("unconfirmed days are never counted", () => {
    const d = fillRange(base(), "2026-07-01", "2026-07-05", "Italy", { confirmed: false, source: "email" });
    expect(daysInCountry(d, "Italy", "2026")).toBe(0);
    expect(daysInCountry(confirmRange(d, "2026-07-01", "2026-07-02"), "Italy", "2026")).toBe(2);
  });
  it("shows gaps instead of counting them as zero", () => {
    const d = fillRange(base(), "2026-01-01", "2026-01-03", "France");
    expect(gaps(d, "2026-01-01", "2026-01-06")).toEqual(["2026-01-04", "2026-01-05", "2026-01-06"]);
  });
});

describe("residency: limits and warnings", () => {
  const rule = { country: "United Kingdom", taxYearStart: "01-01", counting: "midnight" as const, limitDays: 90 };
  it("ok, warning (default 90% of the limit), exceeded, no limit", () => {
    expect(limitStatus(50, rule)).toBe("ok");
    expect(limitStatus(81, rule)).toBe("warning");
    expect(limitStatus(90, rule)).toBe("warning");
    expect(limitStatus(91, rule)).toBe("exceeded");
    expect(limitStatus(500, { ...rule, limitDays: undefined })).toBe("no_limit");
  });
  it("a custom warning threshold wins", () => {
    expect(limitStatus(60, { ...rule, warnAtDays: 60 })).toBe("warning");
  });
  it("notifications only for the current tax year and only when near or over", () => {
    let d = base({ rules: [rule] });
    d = fillRange(d, "2026-01-01", "2026-03-31", "United Kingdom"); // 90 days
    d = fillRange(d, "2025-01-01", "2025-12-31", "United Kingdom"); // last year: over, but not current
    const n = residencyNotifications(d, "2026-10-04");
    expect(n).toHaveLength(1);
    expect(n[0].target).toBe("residency");
    expect(n[0].severity).toBe("high");
    d = fillRange(d, "2026-04-01", "2026-04-05", "United Kingdom");
    expect(residencyNotifications(d, "2026-10-04")[0].severity).toBe("critical");
    expect(residencyNotifications(base({ rules: [rule] }), "2026-10-04")).toHaveLength(0);
  });
  it("remaining days are reported", () => {
    const d = fillRange(base({ rules: [rule] }), "2026-01-01", "2026-01-30", "United Kingdom");
    const t = totalsByCountry(d)[0];
    expect(t.remaining).toBe(60);
    expect(t.status).toBe("ok");
  });
});

describe("residency: email suggestions", () => {
  const year = "2026-09-01T09:00:00Z";
  it("reads a flight email into one unconfirmed day in the destination country", () => {
    const s = suggestFromEmails([{ id: "e1", subject: "Your e-ticket", body: "Flight EK010 LHR to DXB on 12 Oct 2026. Boarding pass attached.", occurredAt: year }]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "flight", country: "United Arab Emirates", from: "2026-10-12" });
  });
  it("reads a hotel email into the nights stayed (check-out night excluded)", () => {
    const s = suggestFromEmails([{ id: "e2", subject: "Booking confirmation", body: "Hotel in Paris.\nCheck-in: 3 Nov 2026\nCheck-out: 6 Nov 2026", occurredAt: year }]);
    expect(s[0]).toMatchObject({ kind: "hotel", country: "France", from: "2026-11-03", to: "2026-11-05" });
  });
  it("ignores emails it cannot read rather than guessing", () => {
    expect(suggestFromEmails([{ id: "e3", subject: "Lunch", body: "See you at noon", occurredAt: year }])).toHaveLength(0);
    expect(suggestFromEmails([{ id: "e4", subject: "Flight", body: "Flight XYZ to QQQ on someday", occurredAt: year }])).toHaveLength(0);
  });
  it("a suggestion never overwrites a confirmed day and is not counted", () => {
    let d = fillRange(base(), "2026-10-12", "2026-10-12", "United Kingdom");
    d = addSuggestion(d, { id: "s", kind: "flight", country: "United Arab Emirates", from: "2026-10-12", to: "2026-10-13", source: "x", summary: "x" });
    expect(daysInCountry(d, "United Kingdom", "2026")).toBe(1);
    expect(daysInCountry(d, "United Arab Emirates", "2026")).toBe(0);
    expect(d.days.filter((x) => !x.confirmed)).toHaveLength(1);
  });
  it("parses loose dates", () => {
    expect(parseLooseDate("on 3rd Sept 2026", 2025)).toBe("2026-09-03");
    expect(parseLooseDate("12 Oct", 2026)).toBe("2026-10-12");
    expect(parseLooseDate("2026-02-09", 2020)).toBe("2026-02-09");
    expect(parseLooseDate("nothing", 2026)).toBeNull();
  });
});

describe("residency: evidence, decisions and export", () => {
  const data = (): ResidencyData => ({
    days: fillRange(base(), "2026-02-01", "2026-02-05", "Spain").days,
    rules: [{ country: "Spain", taxYearStart: "01-01", counting: "midnight", limitDays: 183 }],
    evidence: [{ id: "ev1", kind: "hotel", country: "Spain", from: "2026-02-01", to: "2026-02-03", description: "Hotel, \"Madrid\"" }],
    decisions: [{ id: "d1", date: "2026-02-02", decision: "Approved new supplier", country: "Spain" }],
  });
  it("finds evidence for a date and counts days with none", () => {
    expect(evidenceFor(data(), "2026-02-02")).toHaveLength(1);
    expect(evidenceFor(data(), "2026-02-04")).toHaveLength(0);
    expect(daysWithoutEvidence(data(), "Spain")).toBe(2);
  });
  it("exports totals, days, evidence and decisions, with CSV quoting", () => {
    const out = exportForAdvisor(data(), "2026-10-04");
    expect(out).toContain("Spain,2026,5,183,178,ok");
    expect(out).toContain("2026-02-03,Spain,,yes,manual");
    expect(out).toContain('"Hotel, ""Madrid"""');
    expect(out).toContain("Approved new supplier");
  });
});
