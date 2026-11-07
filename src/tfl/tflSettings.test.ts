import { describe, it, expect } from "vitest";
import { addDays, nextRef, resolveSettings, SETTINGS_DEFAULTS } from "./settings";
import { attentionList, viewCounts, viewsFor, SMART_VIEWS } from "./views";
import { buildAgenda } from "./agenda";
import { MODULES, MODULE_ORDER, type TflKey, type TflRecord } from "./model";
import { newRecordDefaults } from "@/lib/tflRecords";

const S = SETTINGS_DEFAULTS;
const ctx = { today: "2026-11-10", s: S };
const rec = (o: Record<string, string | number>): TflRecord => ({ id: "x", ...o });

describe("settings", () => {
  it("fills gaps and clamps bad values", () => {
    expect(resolveSettings(undefined)).toEqual(S);
    expect(resolveSettings({ vatPct: 500, paymentTermsDays: -5, currency: "XXX", calendarDays: 5, quotePrefix: "  Q2-  " }))
      .toMatchObject({ vatPct: 100, paymentTermsDays: 0, currency: "GBP", calendarDays: 30, quotePrefix: "Q2-" });
    expect(resolveSettings({ vatPct: "abc" }).vatPct).toBe(20);
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("nonsense", 1)).toBe("");
  });
  it("numbers the next reference after the highest used", () => {
    expect(nextRef("INV-", [])).toBe("INV-0001");
    expect(nextRef("INV-", ["INV-0007", "INV-0003", "OTHER-9", "INV-x"])).toBe("INV-0008");
    expect(nextRef("Q.", ["Q.0002"])).toBe("Q.0003");
  });
  it("new records use the settings", () => {
    const s = { ...S, vatRegistered: false, currency: "EUR", paymentTermsDays: 14, invoicePrefix: "TFL-" };
    const inv = newRecordDefaults("invoices", { settings: s, data: { invoices: [{ ref: "TFL-0009" }] } });
    expect(inv).toMatchObject({ vatPct: 0, currency: "EUR", ref: "TFL-0010" });
    expect(String(inv.due)).toBe(addDays(String(inv.issued), 14));
    expect(newRecordDefaults("quotes", { settings: S }).ref).toBe("Q-0001");
    expect(newRecordDefaults("productions", { settings: s }).paymentTerms).toBe(14);
    expect(newRecordDefaults("quotes").ref).toBeUndefined();
  });
});

describe("smart views", () => {
  it("every view belongs to a real module and has a unique key", () => {
    for (const k of Object.keys(SMART_VIEWS)) {
      expect(MODULE_ORDER).toContain(k);
      const keys = viewsFor(k as never).map((v) => v.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    for (const k of MODULE_ORDER) expect(viewsFor(k).length).toBeGreaterThan(0);
  });
  it("finds overdue invoices and ignores paid ones", () => {
    const rows = [rec({ status: "Sent", due: "2026-11-01" }), rec({ status: "Paid", due: "2026-10-01" }), rec({ status: "Draft", due: "2026-10-01" }), rec({ status: "Sent", due: "2026-11-20" })];
    expect(viewCounts("invoices", rows, ctx).overdue).toBe(1);
  });
  it("flags confirmed bookings missing paperwork, following the settings", () => {
    const b = rec({ status: "Confirmed", insurance: "Requested", riskAssessment: "Received" });
    expect(viewCounts("bookings", [b], ctx).papers).toBe(1);
    expect(viewCounts("bookings", [b], { ...ctx, s: { ...S, requireInsurance: false } }).papers).toBe(0);
    expect(viewCounts("bookings", [{ ...b, insurance: "Received" }], ctx).papers).toBe(0);
  });
  it("flags expiring and low-cover insurance", () => {
    const ok = rec({ status: "Received", kind: "Public liability", currency: "GBP", cover: 10_000_000, expires: "2026-11-20" });
    const low = rec({ status: "Received", kind: "Public liability", currency: "GBP", cover: 1_000_000, expires: "2027-06-01" });
    const c = viewCounts("insurance", [ok, low], ctx);
    expect(c.expiring).toBe(1);
    expect(c.low).toBe(1);
    expect(viewCounts("insurance", [low], { ...ctx, s: { ...S, minCover: 0 } }).low).toBe(0);
  });
  it("tasks: overdue, today and priority", () => {
    const rows = [rec({ status: "Open", due: "2026-11-09", priority: "Urgent" }), rec({ status: "Open", due: "2026-11-10" }), rec({ status: "Done", due: "2026-11-01" })];
    expect(viewCounts("tasks", rows, ctx)).toMatchObject({ overdue: 1, today: 1, high: 1 });
  });
  it("attention list only counts warnings and sorts by size", () => {
    const list = attentionList({ tasks: [rec({ status: "Open", due: "2026-11-01" }), rec({ status: "Open", due: "2026-11-02" })], invoices: [rec({ status: "Sent", due: "2026-11-01" })] }, ctx);
    expect(list[0]).toMatchObject({ k: "tasks", count: 2 });
    expect(list.every((a) => a.view.warn)).toBe(true);
  });
});

describe("calendar agenda", () => {
  const title = (k: string, r: TflRecord) => String(r[MODULES[k as TflKey].titleKey] ?? "");
  it("splits overdue from upcoming, drops closed items and respects the range", () => {
    const data = {
      invoices: [rec({ ref: "I1", status: "Sent", due: "2026-11-05" }), rec({ ref: "I2", status: "Paid", due: "2026-11-05" })],
      permits: [rec({ title: "P1", status: "Approved", expires: "2026-11-15" }), rec({ title: "P2", status: "Approved", expires: "2027-03-01" })],
      bookings: [rec({ location: "L", status: "Confirmed", startDate: "2026-11-01", endDate: "2026-11-12" })],
    };
    const a = buildAgenda(data, "2026-11-10", 30, title);
    expect(a.overdue.map((i) => i.title)).toEqual(["I1"]);
    expect(a.upcoming.map((i) => i.what)).toEqual(["Shoot wraps", "Permit expires"]);
  });
  it("sorts by date", () => {
    const a = buildAgenda({ tasks: [rec({ title: "B", status: "Open", due: "2026-11-20" }), rec({ title: "A", status: "Open", due: "2026-11-12" })] }, "2026-11-10", 30, title);
    expect(a.upcoming.map((i) => i.title)).toEqual(["A", "B"]);
  });
});
