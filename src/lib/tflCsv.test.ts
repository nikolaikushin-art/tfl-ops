import { describe, expect, it } from "vitest";
import { parseCsv, toCsv, csvTemplate, mapRows, toIsoDate } from "./tflCsv";

const none = () => null;

describe("tfl csv", () => {
  it("parses quotes, commas, newlines in cells, CRLF and BOM", () => {
    const rows = parseCsv('\uFEFFName,Notes\r\n"House, Palm","say ""hi""\nline2"\r\nB,\r\n');
    expect(rows).toEqual([["Name", "Notes"], ["House, Palm", 'say "hi"\nline2'], ["B", ""]]);
  });
  it("detects semicolon and tab separators", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("reads day-first and ISO dates, rejects impossible ones", () => {
    expect(toIsoDate("05/12/2026")).toBe("2026-12-05");
    expect(toIsoDate("2026-12-05")).toBe("2026-12-05");
    expect(toIsoDate("31/02/2026")).toBeNull();
    expect(toIsoDate("soon")).toBeNull();
  });
  it("exports labels as headers, link names, quoting and formula safety", () => {
    const csv = toCsv("locations", [{ id: "l1", name: '=HYPERLINK("x")', owner: "o1", dayRate: 100, area: "Dubai, UAE" }], (mod, id) => (id === "o1" ? "Palm Holdings" : ""));
    const [head, line] = csv.replace("\uFEFF", "").split("\r\n");
    expect(head.startsWith("Name,Type,Borough / county")).toBe(true);
    expect(line).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(line).toContain("\"Dubai, UAE\"");
    expect(line).toContain("Palm Holdings");
    expect(csvTemplate("owners").replace("\uFEFF", "").startsWith("Name / company,Kind")).toBe(true);
  });
  it("imports valid rows with defaults, links, numbers and dates", () => {
    const rows = parseCsv("Name,Type,Owner,Day rate,Status\nPalm House,house,Palm Holdings,\"AED 12,000\",\nOld Mill,Warehouse / industrial,Nobody,8000,Limited");
    const r = mapRows("locations", rows, (mod, name) => (name === "Palm Holdings" ? "o9" : null), []);
    expect(r.skipped).toEqual([]);
    expect(r.records[0]).toMatchObject({ name: "Palm House", type: "House", owner: "o9", dayRate: 12000, status: "Available", currency: "GBP" });
    expect(r.records[1].status).toBe("Limited");
    expect(r.records[1].owner).toBeUndefined();
    expect(r.warnings[0].message).toContain("Nobody");
  });
  it("skips bad rows with a reason instead of guessing", () => {
    const rows = parseCsv("Name,Type,Day rate,On-site phone\nA,Castle,5,\nB,House,abc,\nC,House,-4,\n,House,1,\nD,House,1,abc");
    const r = mapRows("locations", rows, none, []);
    expect(r.records).toHaveLength(0);
    expect(r.skipped.map((s) => s.line)).toEqual([2, 3, 4, 5, 6]);
    expect(r.skipped[0].reason).toContain("not one of");
    expect(r.skipped[1].reason).toContain("not a number");
  });
  it("skips duplicates of existing records and repeats in the file", () => {
    const rows = parseCsv("Name\nPalm Villa\npalm villa\nNew One");
    const r = mapRows("locations", rows, none, ["Palm Villa"]);
    expect(r.records.map((x) => x.name)).toEqual(["New One"]);
    expect(r.skipped).toHaveLength(2);
  });
  it("reports missing title column, empty files and unknown columns", () => {
    expect(mapRows("locations", parseCsv("Type\nVilla"), none, []).fatal).toMatch(/Name/);
    expect(mapRows("locations", parseCsv("Name"), none, []).fatal).toMatch(/no data/);
    expect(mapRows("locations", parseCsv("Name,Colour\nA,red"), none, []).unknownColumns).toEqual(["Colour"]);
  });
  it("catches date order problems from the file", () => {
    const r = mapRows("bookings", parseCsv("Location,From,To\nl1,10/12/2026,01/12/2026"), (m, n) => n, []);
    expect(r.skipped[0].reason).toMatch(/end date/);
  });
});
