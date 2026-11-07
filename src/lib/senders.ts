/**
 * The Film Location CRM — inbound email triage (v25).
 *
 * Roni's rules (section 5, "Keeping spam out"):
 *  - ignore spam / junk folders completely;
 *  - only file mail from KNOWN contacts automatically; unknown senders wait in a
 *    "New senders" queue for him to accept or ignore;
 *  - leave out newsletters, no-reply addresses and other automated mail;
 *  - a "Not business" button that excludes a sender or a whole domain for good.
 *
 * Pure functions: the screen supplies the data and keeps the rules in storage.
 */
import type { Communication } from "@/lib/domain";

export type TriageAction = "file" | "new_sender" | "ignore";
export type TriageReason =
  | "sent_by_us"
  | "junk_folder"
  | "blocked_sender"
  | "blocked_domain"
  | "automated"
  | "known_contact"
  | "accepted_sender"
  | "unknown_sender";

export interface TriageResult {
  action: TriageAction;
  reason: TriageReason;
}

export interface SenderRules {
  /** Addresses Roni accepted from the New senders queue. */
  accepted: string[];
  /** Addresses ignored from the queue (not blocked for ever, just not filed). */
  ignored: string[];
  /** "Not business": excluded permanently. */
  blockedSenders: string[];
  blockedDomains: string[];
}

export const EMPTY_RULES: SenderRules = { accepted: [], ignored: [], blockedSenders: [], blockedDomains: [] };

/** Free-mail domains never count as "a known company" just because one person there is known. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "yahoo.co.uk",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com", "mail.com",
]);

const AUTOMATED_LOCAL = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|mailer[-_.]?daemon|postmaster|bounce[s]?|notifications?|newsletter[s]?|news|mailing|marketing|promo(tions)?|digest|updates?|alerts?|automated|system|auto[-_.]?(reply|mailer)?|info-noreply)$/i;
const AUTOMATED_SUBJECT = /\b(unsubscribe|newsletter|out of office|automatic reply|auto[- ]?reply|delivery status notification|undeliverable|your (weekly|monthly) (digest|summary))\b/i;

export function normaliseAddress(raw?: string): string {
  if (!raw) return "";
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

export function domainOf(raw?: string): string {
  const a = normaliseAddress(raw);
  const at = a.lastIndexOf("@");
  return at >= 0 ? a.slice(at + 1) : "";
}

export function isAutomatedSender(address?: string, subject?: string, body?: string): boolean {
  const a = normaliseAddress(address);
  const local = a.split("@")[0] ?? "";
  if (local && AUTOMATED_LOCAL.test(local)) return true;
  if (subject && AUTOMATED_SUBJECT.test(subject)) return true;
  // A visible unsubscribe footer is the classic mark of bulk mail.
  if (body && /unsubscribe|manage (your )?(email )?preferences/i.test(body) && !/\b(offer|quote|price|pro-?forma|invoice)\b/i.test(body.slice(0, 400))) return true;
  return false;
}

export interface TriageContext {
  /** Every email address TFL knows: companies and the people at them. */
  knownEmails: string[];
  rules: SenderRules;
}

export function knownDomains(knownEmails: string[]): Set<string> {
  const out = new Set<string>();
  for (const e of knownEmails) {
    const d = domainOf(e);
    if (d && !FREE_MAIL.has(d)) out.add(d);
  }
  return out;
}

/** Decide what happens to one message when it arrives. Messages we sent are never queued. */
export function triageMessage(
  m: Pick<Communication, "isReceived" | "from" | "subject" | "body" | "customerId" | "supplierId" | "contactId"> & { junk?: boolean },
  ctx: TriageContext,
): TriageResult {
  if (!m.isReceived) return { action: "file", reason: "sent_by_us" };
  const addr = normaliseAddress(m.from);
  const dom = domainOf(m.from);
  const { rules } = ctx;

  if (m.junk) return { action: "ignore", reason: "junk_folder" };
  if (addr && rules.blockedSenders.includes(addr)) return { action: "ignore", reason: "blocked_sender" };
  if (dom && rules.blockedDomains.includes(dom)) return { action: "ignore", reason: "blocked_domain" };

  const known = new Set(ctx.knownEmails.map(normaliseAddress));
  // A message already tied to a company or person is from a known contact.
  const linked = !!(m.customerId || m.supplierId || m.contactId);
  if (linked || (addr && known.has(addr))) return { action: "file", reason: "known_contact" };
  if (addr && rules.accepted.includes(addr)) return { action: "file", reason: "accepted_sender" };
  if (dom && knownDomains(ctx.knownEmails).has(dom)) return { action: "file", reason: "known_contact" };

  if (isAutomatedSender(m.from, m.subject, m.body)) return { action: "ignore", reason: "automated" };
  if (addr && rules.ignored.includes(addr)) return { action: "ignore", reason: "unknown_sender" };
  return { action: "new_sender", reason: "unknown_sender" };
}

export const REASON_LABEL: Record<TriageReason, string> = {
  sent_by_us: "Sent by us",
  junk_folder: "Came from the spam / junk folder",
  blocked_sender: "Marked Not business (sender)",
  blocked_domain: "Marked Not business (domain)",
  automated: "Newsletter / no-reply / automated mail",
  known_contact: "Known contact",
  accepted_sender: "Sender you accepted",
  unknown_sender: "Unknown sender",
};

const uniq = (xs: string[]) => [...new Set(xs)];
const without = (xs: string[], x: string) => xs.filter((y) => y !== x);

export function acceptSender(r: SenderRules, address: string): SenderRules {
  const a = normaliseAddress(address);
  return { ...r, accepted: uniq([...r.accepted, a]), ignored: without(r.ignored, a), blockedSenders: without(r.blockedSenders, a) };
}
export function ignoreSender(r: SenderRules, address: string): SenderRules {
  const a = normaliseAddress(address);
  return { ...r, ignored: uniq([...r.ignored, a]), accepted: without(r.accepted, a) };
}
/** "Not business": exclude one address, or the whole domain. */
export function blockNotBusiness(r: SenderRules, address: string, scope: "sender" | "domain"): SenderRules {
  const a = normaliseAddress(address);
  if (scope === "domain") {
    const d = domainOf(a);
    if (!d || FREE_MAIL.has(d)) return blockNotBusiness(r, a, "sender"); // never block gmail.com as a whole
    return { ...r, blockedDomains: uniq([...r.blockedDomains, d]), accepted: r.accepted.filter((x) => domainOf(x) !== d) };
  }
  return { ...r, blockedSenders: uniq([...r.blockedSenders, a]), accepted: without(r.accepted, a), ignored: without(r.ignored, a) };
}
/** Undo from the Ignored list. */
export function restoreSender(r: SenderRules, address: string): SenderRules {
  const a = normaliseAddress(address);
  const d = domainOf(a);
  return { ...r, ignored: without(r.ignored, a), blockedSenders: without(r.blockedSenders, a), blockedDomains: without(r.blockedDomains, d) };
}

/** Same message arriving through two mailboxes (or re-scanned history) is stored once. */
export function dedupeKey(m: Pick<Communication, "from" | "to" | "subject" | "occurredAt" | "body">): string {
  const minute = (m.occurredAt || "").slice(0, 16);
  return [normaliseAddress(m.from), (m.subject || "").trim().toLowerCase(), minute, (m.body || "").replace(/\s+/g, " ").trim().slice(0, 80).toLowerCase()].join("|");
}
export function dropDuplicates<T extends Pick<Communication, "from" | "to" | "subject" | "occurredAt" | "body">>(msgs: T[]): T[] {
  const seen = new Set<string>();
  return msgs.filter((m) => {
    const k = dedupeKey(m);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Which address a reply should go from: the mailbox the message arrived on, else the first configured. */
export function defaultSendFrom(source: { mailbox?: string; to?: string } | undefined, mailboxes: string[]): string {
  const boxes = mailboxes.map(normaliseAddress);
  const arrivedOn = normaliseAddress(source?.mailbox);
  if (arrivedOn && boxes.includes(arrivedOn)) return arrivedOn;
  const to = (source?.to ?? "").split(/[;,]/).map(normaliseAddress).find((t) => boxes.includes(t));
  return to || boxes[0] || "";
}
