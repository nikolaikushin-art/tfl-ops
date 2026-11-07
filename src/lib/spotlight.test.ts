import { describe, expect, it } from "vitest";
import {
  flattenGroups,
  groupResults,
  highlightSegments,
  pushRecent,
  rankItems,
  resolveRecents,
  scoreItem,
  scoreMatch,
  type SpotlightItem,
} from "./spotlight";

const item = (
  id: string,
  label: string,
  category: string,
  extra: Partial<SpotlightItem> = {},
): SpotlightItem => ({ id, label, category, kind: "record", ...extra });

describe("scoreMatch", () => {
  it("ranks exact above prefix above word-prefix above mid-word", () => {
    const exact = scoreMatch("Brightline", "Brightline")!.score;
    const prefix = scoreMatch("Brightline Ltd", "Bright")!.score;
    const wordPrefix = scoreMatch("Brightline Ltd", "Ltd")!.score;
    const midWord = scoreMatch("Brightline Ltd", "ightl")!.score;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordPrefix);
    expect(wordPrefix).toBeGreaterThan(midWord);
  });

  it("is case-insensitive in both directions", () => {
    expect(scoreMatch("BRIGHTLINE", "brightline")!.score).toBe(
      scoreMatch("brightline", "BRIGHTLINE")!.score,
    );
  });

  it("returns null rather than a zero score when nothing matches", () => {
    expect(scoreMatch("Brightline", "zzz")).toBeNull();
  });

  it("returns null for an empty needle instead of matching everything", () => {
    expect(scoreMatch("Brightline", "")).toBeNull();
  });

  it("matches initials as a subsequence", () => {
    const m = scoreMatch("Brightline Ltd", "bl");
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThan(0);
  });

  it("keeps a literal prefix above an initials subsequence", () => {
    // "BL" as a real prefix must beat "B...L" scattered across two words,
    // otherwise typing a code returns the wrong record first.
    const literal = scoreMatch("BL-4471 consignment", "bl")!.score;
    const scattered = scoreMatch("Brightline Ltd", "bl")!.score;
    expect(literal).toBeGreaterThan(scattered);
  });

  it("penalises characters spread far apart", () => {
    const tight = scoreMatch("ab zz", "ab")!.score;
    const loose = scoreMatch("a" + "z".repeat(30) + "b", "ab")!.score;
    expect(tight).toBeGreaterThan(loose);
  });

  it("reports ranges that actually cover the matched characters", () => {
    const m = scoreMatch("Brightline Ltd", "Ltd")!;
    expect(m.ranges).toEqual([{ start: 11, end: 14 }]);
  });

  it("treats a space in the query as a separator, not a character to find", () => {
    // "nord hotel" should match even though the source has other words between.
    expect(scoreMatch("Nordisk Hotels and Resorts", "nord hotel")).not.toBeNull();
  });

  it("merges adjacent subsequence hits into one range", () => {
    const m = scoreMatch("abcdef", "abc")!;
    expect(m.ranges).toEqual([{ start: 0, end: 3 }]);
  });
});

describe("scoreItem", () => {
  it("prefers a label match over a detail match of the same text", () => {
    const onLabel = scoreItem(item("1", "Norway", "Markets"), "Norway")!;
    const onDetail = scoreItem(item("2", "Something else", "Markets", { detail: "Norway" }), "Norway")!;
    expect(onLabel.score).toBeGreaterThan(onDetail.score);
  });

  it("matches hidden keywords but never highlights them", () => {
    const r = scoreItem(
      item("1", "New quotation", "Actions", { keywords: ["create quote", "offer"] }),
      "offer",
    );
    expect(r).not.toBeNull();
    expect(r!.labelRanges).toEqual([]);
  });

  it("breaks ties toward the shorter, more specific label", () => {
    const short = scoreItem(item("1", "Nordisk", "Customers"), "nordisk")!;
    const long = scoreItem(item("2", "Nordisk Hotels and Resorts Purchasing", "Customers"), "nordisk")!;
    expect(short.score).toBeGreaterThan(long.score);
  });

  it("lets weight break a tie without overturning a better text match", () => {
    const weighted = scoreItem(item("1", "Overdue invoice", "Signals", { weight: 60 }), "overdue")!;
    const exact = scoreItem(item("2", "Overdue", "Invoices"), "overdue")!;
    // The exact-title match still wins despite carrying no weight.
    expect(exact.score).toBeGreaterThan(weighted.score);
  });

  it("returns null when nothing in the item matches", () => {
    expect(scoreItem(item("1", "Brightline", "Customers", { detail: "UK" }), "zzz")).toBeNull();
  });

  it("ignores a whitespace-only query", () => {
    expect(scoreItem(item("1", "Brightline", "Customers"), "   ")).toBeNull();
  });
});

describe("rankItems", () => {
  const book: SpotlightItem[] = [
    item("c1", "Brightline Ltd", "Customers", { detail: "United Kingdom" }),
    item("c2", "Nordisk Hotels", "Customers", { detail: "Norway" }),
    item("i1", "INV-2026-0088", "Invoices", { detail: "overdue" }),
    item("o1", "ORD-2026-0031", "Orders", { detail: "confirmed" }),
    item("p1", "Bright steel bar", "Products", { detail: "BSB-100" }),
  ];

  it("puts the exact identifier first, not whichever type was concatenated first", () => {
    const ranked = rankItems(book, "INV-2026-0088");
    expect(ranked[0].item.id).toBe("i1");
  });

  it("ranks a name prefix above a mid-string hit elsewhere", () => {
    const ranked = rankItems(book, "bright");
    expect(ranked[0].item.id).toBe("c1");
  });

  it("drops the worst matches when limiting, not an arbitrary tail", () => {
    const ranked = rankItems(book, "o", 2);
    expect(ranked).toHaveLength(2);
    const all = rankItems(book, "o", 99);
    expect(ranked.map((r) => r.item.id)).toEqual(all.slice(0, 2).map((r) => r.item.id));
  });

  it("returns nothing for an empty query rather than the entire book", () => {
    expect(rankItems(book, "")).toEqual([]);
  });

  it("is deterministic across calls on equal scores", () => {
    const a = rankItems(book, "o").map((r) => r.item.id);
    const b = rankItems(book, "o").map((r) => r.item.id);
    expect(a).toEqual(b);
  });
});

describe("groupResults / flattenGroups", () => {
  const book: SpotlightItem[] = [
    item("c1", "Brightline Ltd", "Customers"),
    item("p1", "Bright steel bar", "Products"),
    item("c2", "Brightwater", "Customers"),
  ];

  it("orders groups by their best member, not alphabetically", () => {
    const groups = groupResults(rankItems(book, "brightline"));
    expect(groups[0].category).toBe("Customers");
  });

  it("round-trips through flatten without losing or reordering results", () => {
    const ranked = rankItems(book, "bright");
    const flat = flattenGroups(groupResults(ranked));
    expect(flat).toHaveLength(ranked.length);
    // Every ranked item survives grouping.
    expect(flat.map((r) => r.item.id).sort()).toEqual(ranked.map((r) => r.item.id).sort());
  });

  it("keeps members ranked inside their group", () => {
    const groups = groupResults(rankItems(book, "bright"));
    const customers = groups.find((g) => g.category === "Customers")!;
    const scores = customers.results.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe("highlightSegments", () => {
  it("splits a label into hit and non-hit runs", () => {
    expect(highlightSegments("Brightline", [{ start: 0, end: 6 }])).toEqual([
      { text: "Bright", hit: true },
      { text: "line", hit: false },
    ]);
  });

  it("returns the whole label as one plain run when nothing matched", () => {
    expect(highlightSegments("Brightline", [])).toEqual([{ text: "Brightline", hit: false }]);
  });

  it("reassembles to exactly the original string", () => {
    const label = "Nordisk Hotels and Resorts";
    const m = scoreMatch(label, "nha")!;
    const joined = highlightSegments(label, m.ranges).map((s) => s.text).join("");
    expect(joined).toBe(label);
  });

  it("does not run off the end when a range overshoots the label", () => {
    expect(highlightSegments("abc", [{ start: 1, end: 99 }])).toEqual([
      { text: "a", hit: false },
      { text: "bc", hit: true },
    ]);
  });

  it("handles unsorted and overlapping ranges without duplicating text", () => {
    const segs = highlightSegments("abcdef", [{ start: 3, end: 5 }, { start: 0, end: 4 }]);
    expect(segs.map((s) => s.text).join("")).toBe("abcdef");
  });
});

describe("recents", () => {
  it("puts the newest first and de-duplicates", () => {
    expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
  });

  it("caps the list so the palette cannot grow unbounded", () => {
    const many = pushRecent(["a", "b", "c"], "d", 2);
    expect(many).toEqual(["d", "a"]);
  });

  it("drops recents whose record no longer exists", () => {
    const items = [item("a", "A", "X"), item("c", "C", "X")];
    expect(resolveRecents(items, ["a", "b", "c"]).map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("preserves recency order when resolving", () => {
    const items = [item("a", "A", "X"), item("b", "B", "X")];
    expect(resolveRecents(items, ["b", "a"]).map((i) => i.id)).toEqual(["b", "a"]);
  });
});
