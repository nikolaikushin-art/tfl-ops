/**
 * The Film Location CRM — requests and matching (v18).
 *
 * Requirements and Opportunities used to be two lists describing the same
 * thing. There is now one Request that moves through
 *   New → Matched → Quoted → Won / Lost.
 * Matching is deterministic and explainable: every match says *why* it matched
 * (alias, product link or name overlap) so Roni can trust or reject it.
 */
import type {
  CustomerRequirement,
  InventoryItem,
  PricingRecord,
  Product,
  Quotation,
  RequirementStatus,
} from "./domain";

export type RequestStage = "new" | "matched" | "quoted" | "won" | "lost";

export const REQUEST_STAGES: RequestStage[] = ["new", "matched", "quoted", "won", "lost"];
export const REQUEST_STAGE_LABELS: Record<RequestStage, string> = {
  new: "New",
  matched: "Matched",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

/** Legacy statuses (open / matching / cancelled) map onto the new lifecycle. */
export function normaliseRequestStatus(s: RequirementStatus): RequestStage {
  switch (s) {
    case "open":
    case "new":
      return "new";
    case "matching":
    case "matched":
      return "matched";
    case "quoted":
      return "quoted";
    case "won":
      return "won";
    case "lost":
    case "cancelled":
      return "lost";
    default:
      return "new";
  }
}

/* -------------------------------------------------------------------------- */
/* Name matching                                                              */
/* -------------------------------------------------------------------------- */

const STOP = new Set([
  "the", "of", "and", "a", "single", "malt", "scotch", "whisky", "whiskey", "vodka",
  "gin", "rum", "tequila", "cognac", "champagne", "wine", "brut", "nv", "bottle",
  "bottles", "case", "cases", "x", "pcs", "yo", "year", "old", "years",
]);

/** "70cl", "0.7l", "0,7 l", "700ml", "1l", "1ltr", "1 litre" -> size in cl. */
export function extractSizeCl(text: string): number | undefined {
  const t = text.toLowerCase().replace(",", ".");
  const cl = t.match(/(\d+(?:\.\d+)?)\s*cl\b/);
  if (cl) return Number(cl[1]);
  const ml = t.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (ml) return Number(ml[1]) / 10;
  const l = t.match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)\s*(?:l|ltr|lt|litre|liter|litres|liters)\b/);
  if (l) return Number(l[1]) * 100;
  return undefined;
}

/** Lowercase, strip accents/punctuation. Sizes are removed (compared separately). */
export function normaliseName(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(cl|ml|l|ltr|lt|litre|liter|litres|liters)\b/g, " ")
    .replace(/\b\d+\s*x\b/g, " ")
    .replace(/\bx\s*\d+\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const bs = new Set(b);
  const hit = a.filter((t) => bs.has(t)).length;
  return hit / Math.max(a.length, b.length);
}

export type MatchReason = "linked" | "alias" | "name";

export interface NameMatch {
  score: number;
  reason: MatchReason;
}

/** Does `query` plausibly name the same product as `candidate` (+ aliases)? */
export function matchProductName(
  query: string,
  candidate: string,
  aliases: string[] = [],
): NameMatch | null {
  const qTokens = normaliseName(query);
  const qSize = extractSizeCl(query);
  const names = [candidate, ...aliases];
  let best: NameMatch | null = null;
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    const nSize = extractSizeCl(n);
    // Sizes that are both stated and different are different products (70cl vs 1L).
    if (qSize != null && nSize != null && Math.abs(qSize - nSize) > 0.5) continue;
    const nTokens = normaliseName(n);
    const exact = qTokens.length > 0 && qTokens.join(" ") === nTokens.join(" ");
    const o = exact ? 1 : overlap(qTokens, nTokens);
    // A short alias such as "JWB" has to match as a whole token to count.
    const aliasHit = i > 0 && nTokens.length > 0 && nTokens.every((t) => qTokens.includes(t));
    const score = aliasHit ? Math.max(o, 0.9) : o;
    if (score >= 0.6 && (!best || score > best.score)) {
      best = { score, reason: i > 0 && aliasHit ? "alias" : "name" };
    }
  }
  return best;
}

/** Find the catalogue product a free-text name refers to. */
export function findProduct(text: string, products: Product[]): { product: Product; match: NameMatch } | null {
  let best: { product: Product; match: NameMatch } | null = null;
  for (const p of products) {
    const m = matchProductName(text, p.name, p.aliases);
    if (m && (!best || m.score > best.match.score)) best = { product: p, match: m };
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Matching a request                                                         */
/* -------------------------------------------------------------------------- */

const isLive = (o: PricingRecord, now: number) =>
  o.status === "approved" && (!o.validUntil || new Date(o.validUntil).getTime() >= now);

export interface OfferMatch {
  offer: PricingRecord;
  reason: MatchReason;
  score: number;
}
export interface StockMatch {
  item: InventoryItem;
  available: number;
}
export interface RequestMatches {
  /** Approved offers still valid today, cheapest first. */
  live: OfferMatch[];
  /** Approved offers that have expired, or rejected/old ones, newest first. */
  past: OfferMatch[];
  /** TFL's own stock under its own name. */
  stock: StockMatch[];
  best?: OfferMatch;
  total: number;
}

export function matchRequest(
  req: Pick<CustomerRequirement, "productName" | "productId">,
  data: { products: Product[]; pricingRecords: PricingRecord[]; inventoryItems?: InventoryItem[] },
  now: number = Date.now(),
): RequestMatches {
  const product =
    (req.productId && data.products.find((p) => p.id === req.productId)) ||
    findProduct(req.productName, data.products)?.product;

  const live: OfferMatch[] = [];
  const past: OfferMatch[] = [];
  for (const o of data.pricingRecords) {
    if (o.status === "rejected" || o.status === "draft") continue;
    let m: NameMatch | null = null;
    if (product && o.productId === product.id) m = { score: 1, reason: "linked" };
    else m = matchProductName(req.productName, o.productName, product?.aliases ?? []);
    if (!m && product) m = matchProductName(product.name, o.productName, product.aliases);
    if (!m) continue;
    (isLive(o, now) ? live : past).push({ offer: o, reason: m.reason, score: m.score });
  }
  live.sort((a, b) => a.offer.unitPrice - b.offer.unitPrice);
  past.sort((a, b) => b.offer.extractedAt.localeCompare(a.offer.extractedAt));

  const stock: StockMatch[] = [];
  if (product) {
    for (const it of data.inventoryItems ?? []) {
      if (it.productId !== product.id) continue;
      const available = it.quantityOnHand - it.quantityReserved - it.quantityDamaged;
      if (available > 0) stock.push({ item: it, available });
    }
  }
  return { live, past, stock, best: live[0], total: live.length + stock.length };
}

/** The stage a request *should* be in given its matches and quotes. Won / lost
 *  are decisions made by a person, so they are never derived. */
export function deriveStage(
  req: CustomerRequirement,
  matches: RequestMatches,
  quotations: Quotation[],
): RequestStage {
  const current = normaliseRequestStatus(req.status);
  if (current === "won" || current === "lost") return current;
  const quoted = quotations.some(
    (q) => q.requirementId === req.id && q.status !== "draft" && q.status !== "rejected",
  );
  if (quoted || current === "quoted") return "quoted";
  return matches.total > 0 ? "matched" : "new";
}

/* -------------------------------------------------------------------------- */
/* Proactive flags                                                            */
/* -------------------------------------------------------------------------- */

export interface OfferOpportunity {
  offer: PricingRecord;
  requests: CustomerRequirement[];
}

/** "This new offer matches three buyers who have asked for this brand." */
export function opportunitiesForOffers(
  offers: PricingRecord[],
  requests: CustomerRequirement[],
  products: Product[],
): OfferOpportunity[] {
  const out: OfferOpportunity[] = [];
  for (const offer of offers) {
    if (offer.status !== "pending_review" && offer.status !== "approved") continue;
    const matched = requests.filter((r) => {
      const stage = normaliseRequestStatus(r.status);
      if (stage === "won" || stage === "lost") return false;
      if (offer.productId && r.productId === offer.productId) return true;
      const prod = offer.productId ? products.find((p) => p.id === offer.productId) : undefined;
      return !!matchProductName(r.productName, offer.productName, prod?.aliases ?? []);
    });
    if (matched.length) out.push({ offer, requests: matched });
  }
  return out;
}
