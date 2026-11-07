/**
 * The Film Location CRM — Residency Tracker logic (v25). PRIVATE: Roni only.
 *
 * Day-by-day calendar of where he is, running totals per country per tax year,
 * limits he configures per country with warnings, evidence against each period,
 * a log of where key company decisions were made, and an export for his advisor.
 * Suggestions from flight / hotel emails are never counted until he confirms.
 */
import type { Signal } from "@/lib/signals";

export type DayCounting = "midnight" | "any_presence";

export interface ResidencyDay {
  /** YYYY-MM-DD */
  date: string;
  /** Where he was at midnight. */
  country: string;
  /** Other countries touched that day (transit, same-day trips). */
  alsoIn?: string[];
  /** Suggested from an email and not yet confirmed: not counted. */
  confirmed: boolean;
  source: "manual" | "email" | "import";
  note?: string;
}

export interface CountryRule {
  country: string;
  /** Day limit per tax year; 0 / undefined = tracked, no limit. */
  limitDays?: number;
  /** Tax year starts on this month-day, e.g. "04-06" (UK) or "01-01". */
  taxYearStart: string;
  /** Warn when this many days (or more) have been used. Defaults to 90% of the limit. */
  warnAtDays?: number;
  counting: DayCounting;
}

export type EvidenceKind = "flight" | "boarding_pass" | "hotel" | "rental" | "utility" | "other";
export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  flight: "Flight", boarding_pass: "Boarding pass", hotel: "Hotel bill",
  rental: "Rental contract", utility: "Utility bill", other: "Other",
};
export interface ResidencyEvidence {
  id: string;
  kind: EvidenceKind;
  country: string;
  from: string;
  to: string;
  description: string;
  /** File name in Documents, if filed. */
  documentName?: string;
}

export interface DecisionLogEntry {
  id: string;
  date: string;
  decision: string;
  country: string;
}

export interface ResidencyData {
  days: ResidencyDay[];
  rules: CountryRule[];
  evidence: ResidencyEvidence[];
  decisions: DecisionLogEntry[];
}
export const EMPTY_RESIDENCY: ResidencyData = { days: [], rules: [], evidence: [], decisions: [] };

const DAY = 86400000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Every date from..to inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to || ts(to) < ts(from)) return out;
  for (let t = ts(from); t <= ts(to); t += DAY) out.push(isoDay(t));
  return out;
}

/** "2026" for a 1 Jan year, "2026/27" for a year that starts mid-year. */
export function taxYearOf(date: string, taxYearStart = "01-01"): string {
  const y = Number(date.slice(0, 4));
  if (taxYearStart === "01-01") return String(y);
  const startThisYear = `${y}-${taxYearStart}`;
  const first = date >= startThisYear ? y : y - 1;
  return `${first}/${String((first + 1) % 100).padStart(2, "0")}`;
}

export function taxYearBounds(label: string, taxYearStart = "01-01"): { from: string; to: string } {
  const first = Number(label.slice(0, 4));
  if (taxYearStart === "01-01") return { from: `${first}-01-01`, to: `${first}-12-31` };
  const from = `${first}-${taxYearStart}`;
  const next = ts(`${first + 1}-${taxYearStart}`) - DAY;
  return { from, to: isoDay(next) };
}

export function ruleFor(rules: CountryRule[], country: string): CountryRule {
  return rules.find((r) => r.country === country) ?? { country, taxYearStart: "01-01", counting: "midnight" };
}

/** Confirmed days only, one entry per date (a later entry for the same date replaces an earlier one). */
export function confirmedDays(days: ResidencyDay[]): ResidencyDay[] {
  const byDate = new Map<string, ResidencyDay>();
  for (const d of days) {
    if (!d.confirmed) continue;
    byDate.set(d.date, d);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Days counted for a country in one of ITS tax years. */
export function daysInCountry(data: ResidencyData, country: string, taxYear: string): number {
  const rule = ruleFor(data.rules, country);
  let n = 0;
  for (const d of confirmedDays(data.days)) {
    if (taxYearOf(d.date, rule.taxYearStart) !== taxYear) continue;
    const present = d.country === country || (rule.counting === "any_presence" && (d.alsoIn ?? []).includes(country));
    if (present) n++;
  }
  return n;
}

export interface CountryTotal {
  country: string;
  taxYear: string;
  days: number;
  limit?: number;
  remaining?: number;
  status: "ok" | "warning" | "exceeded" | "no_limit";
}

export function limitStatus(days: number, rule: CountryRule): CountryTotal["status"] {
  if (!rule.limitDays) return "no_limit";
  if (days > rule.limitDays) return "exceeded";
  const warnAt = rule.warnAtDays ?? Math.ceil(rule.limitDays * 0.9);
  return days >= warnAt ? "warning" : "ok";
}

/** Running totals: every country seen (or ruled) for every tax year it has days in. */
export function totalsByCountry(data: ResidencyData): CountryTotal[] {
  const countries = new Set<string>(data.rules.map((r) => r.country));
  for (const d of confirmedDays(data.days)) {
    countries.add(d.country);
    for (const c of d.alsoIn ?? []) countries.add(c);
  }
  const out: CountryTotal[] = [];
  for (const country of countries) {
    const rule = ruleFor(data.rules, country);
    const years = new Set<string>();
    for (const d of confirmedDays(data.days)) {
      const here = d.country === country || (rule.counting === "any_presence" && (d.alsoIn ?? []).includes(country));
      if (here) years.add(taxYearOf(d.date, rule.taxYearStart));
    }
    for (const y of years) {
      const days = daysInCountry(data, country, y);
      out.push({
        country, taxYear: y, days, limit: rule.limitDays || undefined,
        remaining: rule.limitDays ? rule.limitDays - days : undefined,
        status: limitStatus(days, rule),
      });
    }
  }
  return out.sort((a, b) => b.taxYear.localeCompare(a.taxYear) || b.days - a.days);
}

/** Set one country for a date range; confirmed unless told otherwise. Replaces what was there. */
export function fillRange(
  data: ResidencyData, from: string, to: string, country: string,
  opts: { confirmed?: boolean; source?: ResidencyDay["source"]; note?: string } = {},
): ResidencyData {
  const dates = new Set(eachDay(from, to));
  if (!dates.size || !country.trim()) return data;
  const kept = data.days.filter((d) => !dates.has(d.date));
  const added: ResidencyDay[] = [...dates].map((date) => ({
    date, country: country.trim(), confirmed: opts.confirmed ?? true, source: opts.source ?? "manual", note: opts.note,
  }));
  return { ...data, days: [...kept, ...added].sort((a, b) => a.date.localeCompare(b.date)) };
}

/** Dates in a range that have no entry (so gaps are visible, not silently zero). */
export function gaps(data: ResidencyData, from: string, to: string): string[] {
  const have = new Set(confirmedDays(data.days).map((d) => d.date));
  return eachDay(from, to).filter((d) => !have.has(d));
}

/** Projected: if he stays, when does he reach the limit? */
export function daysUntilLimit(total: CountryTotal): number | null {
  return total.remaining === undefined ? null : Math.max(0, total.remaining);
}

/* ---------------------------- email suggestions --------------------------- */

const AIRPORT_COUNTRY: Record<string, string> = {
  LHR: "United Kingdom", LGW: "United Kingdom", STN: "United Kingdom", LTN: "United Kingdom", MAN: "United Kingdom",
  DXB: "United Arab Emirates", AUH: "United Arab Emirates", DWC: "United Arab Emirates",
  CDG: "France", ORY: "France", NCE: "France", AMS: "Netherlands", FRA: "Germany", MUC: "Germany",
  MAD: "Spain", BCN: "Spain", FCO: "Italy", MXP: "Italy", ZRH: "Switzerland", GVA: "Switzerland",
  LIS: "Portugal", ATH: "Greece", IST: "Turkey", JFK: "United States", EWR: "United States", MIA: "United States",
  SIN: "Singapore", HKG: "Hong Kong", DOH: "Qatar", RIY: "Saudi Arabia", JNB: "South Africa", CPT: "South Africa",
  DUB: "Ireland", BRU: "Belgium", VIE: "Austria", CPH: "Denmark", ARN: "Sweden", OSL: "Norway", WAW: "Poland",
};
const CITY_COUNTRY: Record<string, string> = {
  london: "United Kingdom", dubai: "United Arab Emirates", "abu dhabi": "United Arab Emirates", paris: "France",
  amsterdam: "Netherlands", frankfurt: "Germany", madrid: "Spain", barcelona: "Spain", rome: "Italy", milan: "Italy",
  zurich: "Switzerland", geneva: "Switzerland", lisbon: "Portugal", athens: "Greece", istanbul: "Turkey",
  "new york": "United States", miami: "United States", singapore: "Singapore", "hong kong": "Hong Kong",
  doha: "Qatar", riyadh: "Saudi Arabia", johannesburg: "South Africa", "cape town": "South Africa", dublin: "Ireland",
};
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

export function parseLooseDate(s: string, fallbackYear: number): string | null {
  const iso = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dm = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s*(20\d{2})?\b/);
  if (dm) {
    const mo = MONTHS[dm[2].slice(0, dm[2].toLowerCase().startsWith("sept") ? 4 : 3).toLowerCase()];
    if (mo) return `${dm[3] ?? fallbackYear}-${String(mo).padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  }
  return null;
}

export interface TravelSuggestion {
  id: string;
  kind: "flight" | "hotel";
  country: string;
  from: string;
  to: string;
  source: string;
  summary: string;
}

/** Read flight / hotel confirmation emails into suggestions. Nothing is counted until confirmed. */
export function suggestFromEmails(
  emails: { id: string; subject?: string; body: string; occurredAt: string }[],
): TravelSuggestion[] {
  const out: TravelSuggestion[] = [];
  for (const e of emails) {
    const text = `${e.subject ?? ""}\n${e.body}`;
    const year = Number(e.occurredAt.slice(0, 4)) || new Date().getFullYear();
    const isFlight = /\b(flight|boarding pass|e-?ticket|itinerary)\b/i.test(text) && /\b[A-Z]{3}\b\s*(?:to|→|-|–)\s*\b[A-Z]{3}\b/.test(text);
    const isHotel = /\b(hotel|reservation|booking confirmation|check-?in|check-?out)\b/i.test(text);
    if (isFlight) {
      const route = text.match(/\b([A-Z]{3})\b\s*(?:to|→|-|–)\s*\b([A-Z]{3})\b/);
      const dest = route ? AIRPORT_COUNTRY[route[2]] : undefined;
      const date = parseLooseDate(text, year);
      if (route && dest && date) {
        out.push({ id: `${e.id}:flight`, kind: "flight", country: dest, from: date, to: date, source: e.subject || "Flight email", summary: `${route[1]} → ${route[2]} on ${date}` });
        continue;
      }
    }
    if (isHotel) {
      const inM = text.match(/check-?in[:\s]+([^\n,;]+(?:,?\s*20\d{2})?)/i);
      const outM = text.match(/check-?out[:\s]+([^\n,;]+(?:,?\s*20\d{2})?)/i);
      const city = Object.keys(CITY_COUNTRY).find((c) => text.toLowerCase().includes(c));
      const a = inM ? parseLooseDate(inM[1], year) : null;
      const b = outM ? parseLooseDate(outM[1], year) : null;
      if (city && a && b && ts(b) >= ts(a)) {
        // He sleeps there the nights from check-in to the night before check-out.
        const lastNight = isoDay(ts(b) - DAY);
        out.push({ id: `${e.id}:hotel`, kind: "hotel", country: CITY_COUNTRY[city], from: a, to: ts(lastNight) >= ts(a) ? lastNight : a, source: e.subject || "Hotel email", summary: `${city} ${a} to ${b}` });
      }
    }
  }
  return out;
}

/** Add a suggestion to the calendar as UNCONFIRMED days (not counted). Never overwrites confirmed days. */
export function addSuggestion(data: ResidencyData, s: TravelSuggestion): ResidencyData {
  const confirmedDates = new Set(confirmedDays(data.days).map((d) => d.date));
  const dates = eachDay(s.from, s.to).filter((d) => !confirmedDates.has(d));
  const kept = data.days.filter((d) => !(dates.includes(d.date) && !d.confirmed));
  const added: ResidencyDay[] = dates.map((date) => ({ date, country: s.country, confirmed: false, source: "email", note: s.summary }));
  return { ...data, days: [...kept, ...added].sort((a, b) => a.date.localeCompare(b.date)) };
}

export function confirmRange(data: ResidencyData, from: string, to: string): ResidencyData {
  const dates = new Set(eachDay(from, to));
  return { ...data, days: data.days.map((d) => (dates.has(d.date) ? { ...d, confirmed: true } : d)) };
}

/* -------------------------------- export ---------------------------------- */

const csv = (v: string | number | undefined) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One CSV for the advisor: totals, then day-by-day, then evidence, then decisions. */
export function exportForAdvisor(data: ResidencyData, generatedOn: string): string {
  const lines: string[] = [];
  lines.push(`Residency report,generated ${generatedOn}`);
  lines.push("", "TOTALS (confirmed days only)", "Country,Tax year,Days,Limit,Remaining,Status");
  for (const t of totalsByCountry(data)) lines.push([t.country, t.taxYear, t.days, t.limit ?? "", t.remaining ?? "", t.status].map(csv).join(","));
  lines.push("", "DAY BY DAY", "Date,Country,Also in,Confirmed,Source,Note");
  for (const d of [...data.days].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push([d.date, d.country, (d.alsoIn ?? []).join("; "), d.confirmed ? "yes" : "no", d.source, d.note].map(csv).join(","));
  }
  lines.push("", "EVIDENCE", "Type,Country,From,To,Description,Document");
  for (const e of data.evidence) lines.push([EVIDENCE_LABEL[e.kind], e.country, e.from, e.to, e.description, e.documentName].map(csv).join(","));
  if (data.decisions.length) {
    lines.push("", "WHERE KEY COMPANY DECISIONS WERE MADE", "Date,Country,Decision");
    for (const d of data.decisions) lines.push([d.date, d.country, d.decision].map(csv).join(","));
  }
  return lines.join("\n");
}

/** Evidence covering a given date, for the calendar view. */
export function evidenceFor(data: ResidencyData, date: string): ResidencyEvidence[] {
  return data.evidence.filter((e) => e.from <= date && date <= e.to);
}

/** Confirmed days with no evidence at all, per country (so he knows what to collect). */
export function daysWithoutEvidence(data: ResidencyData, country: string): number {
  return confirmedDays(data.days).filter((d) => d.country === country && evidenceFor(data, d.date).length === 0).length;
}

/* ----------------------------- notifications ------------------------------ */

export function residencyNotifications(data: ResidencyData, now: string): Signal[] {
  const out: Signal[] = [];
  const currentYear = (c: string) => taxYearOf(now, ruleFor(data.rules, c).taxYearStart);
  for (const t of totalsByCountry(data)) {
    if (t.taxYear !== currentYear(t.country)) continue;
    if (t.status !== "warning" && t.status !== "exceeded") continue;
    out.push({
      id: `residency:${t.country}:${t.taxYear}`,
      kind: "compliance",
      severity: t.status === "exceeded" ? "critical" : "high",
      title: t.status === "exceeded" ? `Residency: over the ${t.country} day limit` : `Residency: approaching the ${t.country} day limit`,
      detail: `${t.days} of ${t.limit} days used in ${t.taxYear}${t.remaining !== undefined && t.remaining >= 0 ? ` · ${t.remaining} left` : ""}`,
      action: "Open Residency",
      target: "residency",
      weight: t.status === "exceeded" ? 95 : 75,
    });
  }
  return out;
}
