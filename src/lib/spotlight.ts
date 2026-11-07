/**
 * Spotlight — the ranking engine behind ⌘K.
 *
 * This file is deliberately free of React and of the store. It takes a flat
 * list of candidates and a query, and returns a ranked, grouped result set.
 * Keeping it pure is what lets the matching rules be unit-tested directly,
 * rather than being asserted through a rendered component.
 *
 * Three decisions drive everything here:
 *
 * 1. **Ranking is by match quality, not by source order.** The previous
 *    palette used `String.includes` and then `.slice(0, 24)`, so the winner
 *    was whichever entity type happened to be concatenated first. Typing an
 *    exact invoice number could return twelve customers above it.
 *
 * 2. **Subsequence matching, but only as a last resort.** "bl" should find
 *    "Brightline". It should not outrank a literal "BL" prefix if one exists,
 *    and it must never be allowed to match so loosely that every record in
 *    the book qualifies — so a subsequence match carries a low ceiling and
 *    is penalised by how far apart its characters are spread.
 *
 * 3. **The match positions travel with the result.** The UI highlights the
 *    characters that actually matched. Recomputing that in the renderer would
 *    let the highlight disagree with the ranking, which is the sort of detail
 *    that makes a search feel broken without anyone being able to say why.
 */

export type SpotlightKind = "record" | "command" | "signal";

export type SpotlightItem = {
  /** Stable identity. For records this is the record id; for commands, a verb key. */
  id: string;
  /** Primary line. This is what gets matched hardest. */
  label: string;
  /** Secondary line — matched, but scored lower than the label. */
  detail?: string;
  /** Group heading in the result list, e.g. "Customers", "Actions". */
  category: string;
  kind: SpotlightKind;
  /**
   * Extra words that should match but are not displayed — e.g. a customer's
   * country, or "new quote" as an alias for the create-quotation command.
   * Matching against keywords never contributes highlight ranges, because
   * there is nothing on screen to highlight.
   */
  keywords?: string[];
  /**
   * Nudges an item up or down the list independently of text quality.
   * Used so a critical signal outranks a dormant record at equal match
   * quality, and never so far that it outranks a better textual match.
   */
  weight?: number;
  /** Opaque payload the caller uses to act on the item. */
  payload?: unknown;
};

export type MatchRange = { start: number; end: number };

export type SpotlightResult = {
  item: SpotlightItem;
  score: number;
  /** Highlight ranges over `item.label`, in order, non-overlapping. */
  labelRanges: MatchRange[];
};

export type SpotlightGroup = {
  category: string;
  results: SpotlightResult[];
};

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

const SCORE_EXACT = 1000;
const SCORE_PREFIX = 700;
const SCORE_WORD_PREFIX = 500;
const SCORE_SUBSTRING = 320;
const SCORE_SUBSEQUENCE = 120;

/** Characters that separate words for the purpose of word-prefix matching. */
const WORD_BREAK = /[\s\-_/\\.,:;()[\]#]/;

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  return WORD_BREAK.test(text[index - 1]);
}

/**
 * Scores `needle` against `haystack` and reports where it matched.
 * Returns null when there is no match at all.
 *
 * `null` rather than a zero score, because "did not match" and "matched
 * badly" are different answers and the caller filters on the first.
 */
export function scoreMatch(
  haystack: string,
  needle: string,
): { score: number; ranges: MatchRange[] } | null {
  if (!needle) return null;
  const hay = haystack.toLowerCase();
  const nee = needle.toLowerCase();

  if (hay === nee) {
    return { score: SCORE_EXACT, ranges: [{ start: 0, end: haystack.length }] };
  }

  const idx = hay.indexOf(nee);
  if (idx === 0) {
    return { score: SCORE_PREFIX, ranges: [{ start: 0, end: nee.length }] };
  }
  if (idx > 0) {
    const ranges = [{ start: idx, end: idx + nee.length }];
    // A hit at the start of a word ("Ltd" in "Brightline Ltd") is a far
    // better result than one buried mid-word ("ight" in "Brightline"), so
    // the two are scored differently rather than both counting as
    // "contains".
    return { score: isWordStart(haystack, idx) ? SCORE_WORD_PREFIX : SCORE_SUBSTRING, ranges };
  }

  // Subsequence: every needle character appears in order, not necessarily
  // adjacent. Greedy left-to-right is right here — we want the earliest,
  // tightest run, and the spread penalty below handles the rest.
  const ranges: MatchRange[] = [];
  let h = 0;
  let firstHit = -1;
  let lastHit = -1;
  let wordStarts = 0;

  for (let n = 0; n < nee.length; n++) {
    const ch = nee[n];
    // Spaces in the query are separators, not characters to find.
    if (ch === " ") continue;
    let found = -1;
    while (h < hay.length) {
      if (hay[h] === ch) {
        found = h;
        h++;
        break;
      }
      h++;
    }
    if (found === -1) return null;
    if (firstHit === -1) firstHit = found;
    lastHit = found;
    if (isWordStart(haystack, found)) wordStarts++;
    const prev = ranges[ranges.length - 1];
    if (prev && prev.end === found) prev.end = found + 1;
    else ranges.push({ start: found, end: found + 1 });
  }

  if (firstHit === -1) return null;

  const compact = nee.replace(/ /g, "").length;
  const span = lastHit - firstHit + 1;
  // Spread penalty: characters scattered across a long string is a weak
  // match. Bounded so it can never push a real match below zero.
  const spread = Math.min(60, Math.max(0, span - compact) * 3);
  // Initials bonus: "bl" hitting B-rightline L-td is what the user meant.
  const initials = wordStarts * 18;
  const lead = firstHit === 0 ? 20 : 0;

  return { score: Math.max(1, SCORE_SUBSEQUENCE + initials + lead - spread), ranges };
}

/**
 * Scores a whole item. The label dominates; detail and keywords can only
 * ever promote an item within its band, never lift a detail-only match above
 * a label match.
 */
export function scoreItem(item: SpotlightItem, query: string): SpotlightResult | null {
  const q = query.trim();
  if (!q) return null;

  const label = scoreMatch(item.label, q);
  const detail = item.detail ? scoreMatch(item.detail, q) : null;
  let keyword: { score: number } | null = null;
  for (const k of item.keywords ?? []) {
    const m = scoreMatch(k, q);
    if (m && (!keyword || m.score > keyword.score)) keyword = m;
  }

  if (!label && !detail && !keyword) return null;

  // Secondary fields are scaled down rather than added, so an item matching
  // on three weak fields cannot beat an item matching strongly on its name.
  const best = Math.max(
    label?.score ?? 0,
    (detail?.score ?? 0) * 0.45,
    (keyword?.score ?? 0) * 0.4,
  );

  // Shorter labels win ties: "Nordisk" should beat "Nordisk Hotels & Resorts
  // Purchasing Group" when both merely contain the query.
  const brevity = Math.max(0, 40 - item.label.length) * 0.5;

  return {
    item,
    score: best + brevity + (item.weight ?? 0),
    labelRanges: label?.ranges ?? [],
  };
}

/**
 * Ranks every candidate. `limit` caps the returned list *after* ranking, so
 * the cap drops the worst matches rather than whatever sorted last by
 * accident.
 */
export function rankItems(
  items: SpotlightItem[],
  query: string,
  limit = 40,
): SpotlightResult[] {
  const out: SpotlightResult[] = [];
  for (const item of items) {
    const r = scoreItem(item, query);
    if (r) out.push(r);
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Deterministic tie-break, so the list cannot reshuffle between renders
    // on equal scores — a moving selection under the cursor is maddening.
    if (a.item.category !== b.item.category) return a.item.category < b.item.category ? -1 : 1;
    return a.item.label < b.item.label ? -1 : 1;
  });
  return out.slice(0, limit);
}

/**
 * Groups a ranked list for display while preserving rank order: groups appear
 * in the order of their best member, and members stay ranked inside a group.
 * Grouping alphabetically would bury the best result under "Accounting".
 */
export function groupResults(results: SpotlightResult[]): SpotlightGroup[] {
  const groups: SpotlightGroup[] = [];
  const byCategory = new Map<string, SpotlightGroup>();
  for (const r of results) {
    let g = byCategory.get(r.item.category);
    if (!g) {
      g = { category: r.item.category, results: [] };
      byCategory.set(r.item.category, g);
      groups.push(g);
    }
    g.results.push(r);
  }
  return groups;
}

/** Flattens groups back to the order the keyboard walks. */
export function flattenGroups(groups: SpotlightGroup[]): SpotlightResult[] {
  return groups.flatMap((g) => g.results);
}

/**
 * Splits a label into highlighted and plain segments for rendering.
 * Returns whole-string plain output when there are no ranges, so a caller
 * never has to special-case the empty query.
 */
export function highlightSegments(
  label: string,
  ranges: MatchRange[],
): { text: string; hit: boolean }[] {
  if (!ranges.length) return [{ text: label, hit: false }];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const r of sorted) {
    const start = Math.max(cursor, r.start);
    if (start >= label.length) break;
    if (start > cursor) out.push({ text: label.slice(cursor, start), hit: false });
    const end = Math.min(label.length, Math.max(start, r.end));
    if (end > start) out.push({ text: label.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < label.length) out.push({ text: label.slice(cursor), hit: false });
  return out;
}

/* ------------------------------------------------------------------ *
 * Recents
 * ------------------------------------------------------------------ */

/**
 * Most-recently-opened list, newest first, de-duplicated by id.
 *
 * Deliberately capped and held in memory by the caller: a palette that
 * remembers what you opened last week is a palette showing you records that
 * have since been closed, paid or deleted.
 */
export function pushRecent(recents: string[], id: string, cap = 8): string[] {
  const next = [id, ...recents.filter((r) => r !== id)];
  return next.slice(0, cap);
}

/** Resolves recent ids back to items, dropping any that no longer exist. */
export function resolveRecents(items: SpotlightItem[], recents: string[]): SpotlightItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: SpotlightItem[] = [];
  for (const id of recents) {
    const item = byId.get(id);
    if (item) out.push(item);
  }
  return out;
}
