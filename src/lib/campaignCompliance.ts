/**
 * The Film Location CRM — campaign compliance (v26).
 *
 * Roni's rules (section 5, "Campaigns"):
 *  - Zoho blocks mass mailing after about 50 emails, so campaigns go through a
 *    dedicated sending service (Brevo / Amazon SES / Mailchimp), from a
 *    subdomain such as news.example.com that protects the main addresses;
 *  - every campaign carries an unsubscribe link;
 *  - audiences are built from the Contacts filters.
 *
 * Pure functions. The screen keeps the suppression list and the sending set-up
 * in browser storage (demo); the server build moves both into the database and
 * the sending service enforces the suppression list a second time.
 */

export const ZOHO_BULK_LIMIT = 50;

export type SuppressionReason = "unsubscribed" | "bounced" | "complaint" | "manual";

export interface SuppressionEntry {
  email: string;
  reason: SuppressionReason;
  at: string;
  campaignId?: string;
  note?: string;
}

export type SendingProvider = "brevo" | "ses" | "mailchimp";

export interface SendingConfig {
  provider?: SendingProvider;
  /** e.g. news.example.com — never the main domain. */
  subdomain: string;
  fromName: string;
  /** Local part only, e.g. "hello" -> hello@news.example.com */
  fromLocal: string;
  replyTo: string;
  /** Postal address shown in the footer (required by most anti-spam laws). */
  postalAddress: string;
  /** Public page that processes unsubscribes (hosted by the server build). */
  unsubscribeBaseUrl: string;
  /** DNS records Roni's IT confirmed as published. */
  confirmed: { spf: boolean; dkim: boolean; dmarc: boolean; returnPath: boolean };
}

export const EMPTY_SENDING: SendingConfig = {
  subdomain: "news.example.com",
  fromName: "The Film Location",
  fromLocal: "hello",
  replyTo: "",
  postalAddress: "",
  unsubscribeBaseUrl: "https://news.example.com/unsubscribe",
  confirmed: { spf: false, dkim: false, dmarc: false, returnPath: false },
};

export const PROVIDERS: Record<SendingProvider, { label: string; note: string }> = {
  brevo: {
    label: "Brevo",
    note: "Simplest set-up and a built-in unsubscribe page. Good fit for lists of a few thousand.",
  },
  ses: {
    label: "Amazon SES",
    note: "Cheapest at volume and fully API-driven, but needs a little more technical set-up and warm-up.",
  },
  mailchimp: {
    label: "Mailchimp",
    note: "Familiar editor, but dearer per contact. Its own audience rules apply on top of ours.",
  },
};

export const normEmail = (e: string): string => {
  const m = e.match(/<([^>]+)>/);
  return (m ? m[1] : e).trim().toLowerCase();
};

/* ---------------------------- Suppression list --------------------------- */

export function isSuppressed(list: SuppressionEntry[], email: string): boolean {
  const n = normEmail(email);
  return list.some((s) => s.email === n);
}

export function addSuppression(
  list: SuppressionEntry[],
  email: string,
  reason: SuppressionReason,
  extra: { campaignId?: string; note?: string; at?: string } = {},
): SuppressionEntry[] {
  const n = normEmail(email);
  if (!n || !n.includes("@")) return list;
  if (list.some((s) => s.email === n)) return list; // first reason wins; never duplicate
  return [{ email: n, reason, at: extra.at ?? new Date().toISOString(), campaignId: extra.campaignId, note: extra.note }, ...list];
}

export function removeSuppression(list: SuppressionEntry[], email: string): SuppressionEntry[] {
  const n = normEmail(email);
  return list.filter((s) => s.email !== n);
}

/** Splits recipients into those we may mail and those held back, with the reason. */
export function applySuppression<T extends { email: string }>(
  recipients: T[],
  list: SuppressionEntry[],
): { allowed: T[]; held: { recipient: T; reason: SuppressionReason }[] } {
  const by = new Map(list.map((s) => [s.email, s.reason] as const));
  const seen = new Set<string>();
  const allowed: T[] = [];
  const held: { recipient: T; reason: SuppressionReason }[] = [];
  for (const r of recipients) {
    const n = normEmail(r.email);
    if (seen.has(n)) continue; // same address twice in one audience is mailed once
    seen.add(n);
    const reason = by.get(n);
    if (reason) held.push({ recipient: r, reason });
    else allowed.push(r);
  }
  return { allowed, held };
}

/** Parses a pasted list (one address per line, or comma separated) for bulk suppression. */
export function parseEmailList(text: string): string[] {
  const out = new Set<string>();
  for (const part of text.split(/[\s,;]+/)) {
    const n = normEmail(part);
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n)) out.add(n);
  }
  return [...out];
}

/* ------------------------------ Unsubscribe ------------------------------ */

const b64url = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64url = (t: string): string => {
  const pad = t.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((t.length + 3) % 4);
  const bin = atob(pad);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/**
 * Link placed in each message. The token carries the address and campaign.
 * NOTE: in the demo the token is only encoded; the server build must sign it
 * (HMAC) so that nobody can unsubscribe a third party by guessing an address.
 */
export function buildUnsubscribeUrl(baseUrl: string, email: string, campaignId: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}?t=${b64url(`${normEmail(email)}|${campaignId}`)}`;
}

export function parseUnsubscribeToken(url: string): { email: string; campaignId: string } | null {
  try {
    const t = new URL(url).searchParams.get("t");
    if (!t) return null;
    const [email, campaignId] = unb64url(t).split("|");
    if (!email || !email.includes("@")) return null;
    return { email, campaignId: campaignId ?? "" };
  } catch {
    return null;
  }
}

export const UNSUBSCRIBE_TOKEN = /\{\{\s*unsubscribe_url\s*\}\}/g;

/** Does the template already contain the unsubscribe merge field? */
export function hasUnsubscribeField(body: string): boolean {
  return /\{\{\s*unsubscribe_url\s*\}\}/.test(body);
}

/**
 * Guarantees an unsubscribe link in the rendered message. If the author used
 * {{unsubscribe_url}} it is filled in; otherwise a footer is appended. There is
 * no way to send a campaign without one.
 */
export function withUnsubscribe(body: string, url: string, postalAddress = ""): string {
  if (hasUnsubscribeField(body)) return body.replace(UNSUBSCRIBE_TOKEN, url);
  const lines = ["", "--", "You are receiving this because you are a business contact of The Film Location."];
  if (postalAddress.trim()) lines.push(postalAddress.trim());
  lines.push(`Unsubscribe: ${url}`);
  return body.replace(/\s+$/, "") + "\n" + lines.join("\n");
}

/** Headers the sending service must add (RFC 8058 one-click unsubscribe). */
export function listUnsubscribeHeaders(url: string, mailto?: string): Record<string, string> {
  const targets = [`<${url}>`];
  if (mailto) targets.push(`<mailto:${mailto}?subject=unsubscribe>`);
  return { "List-Unsubscribe": targets.join(", "), "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/* ------------------------------ Sending set-up --------------------------- */

export interface DnsRecord {
  key: keyof SendingConfig["confirmed"];
  type: "TXT" | "CNAME";
  host: string;
  purpose: string;
  value: string;
}

/** What Roni's IT must publish. Exact DKIM values come from the chosen provider. */
export function dnsChecklist(config: SendingConfig): DnsRecord[] {
  const sub = config.subdomain.trim().toLowerCase();
  const root = sub.split(".").slice(1).join(".") || sub;
  const provider = config.provider ? PROVIDERS[config.provider].label : "your sending service";
  return [
    { key: "spf", type: "TXT", host: sub, purpose: "SPF: who may send for this subdomain", value: `Copy from ${provider} (starts "v=spf1 include:…")` },
    { key: "dkim", type: "CNAME", host: `(selector)._domainkey.${sub}`, purpose: "DKIM: signs each message", value: `Copy from ${provider} (usually 2–3 records)` },
    { key: "dmarc", type: "TXT", host: `_dmarc.${root}`, purpose: "DMARC: tells inboxes what to do with failures", value: "v=DMARC1; p=none; rua=mailto:dmarc@" + root + " (tighten to quarantine after a few weeks)" },
    { key: "returnPath", type: "CNAME", host: `bounce.${sub}`, purpose: "Return path: lets bounces come back to the service", value: `Copy from ${provider}` },
  ];
}

export interface SendingIssue {
  field: string;
  message: string;
}

const isSubdomain = (d: string): boolean => /^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9.-]+$/i.test(d.trim());

export function validateSending(config: SendingConfig, mainDomain = "example.com"): SendingIssue[] {
  const out: SendingIssue[] = [];
  if (!config.provider) out.push({ field: "provider", message: "Choose a sending service." });
  if (!isSubdomain(config.subdomain)) {
    out.push({ field: "subdomain", message: "Use a subdomain such as news.example.com, not the main domain." });
  } else if (config.subdomain.trim().toLowerCase() === mainDomain) {
    out.push({ field: "subdomain", message: "Campaigns must not send from the main domain." });
  }
  if (!config.fromName.trim()) out.push({ field: "fromName", message: "Add a sender name." });
  if (!/^[a-z0-9._-]+$/i.test(config.fromLocal.trim())) out.push({ field: "fromLocal", message: "Sender address needs a simple name such as hello." });
  if (!config.postalAddress.trim()) out.push({ field: "postalAddress", message: "Add a postal address for the footer." });
  if (!/^https:\/\//i.test(config.unsubscribeBaseUrl.trim())) out.push({ field: "unsubscribeBaseUrl", message: "The unsubscribe page must be an https address." });
  return out;
}

export const dnsComplete = (c: SendingConfig): boolean => Object.values(c.confirmed).every(Boolean);

export const sendingReady = (c: SendingConfig): boolean => validateSending(c).length === 0 && dnsComplete(c);

export function fromAddress(c: SendingConfig): string {
  return `${c.fromName.trim()} <${c.fromLocal.trim()}@${c.subdomain.trim().toLowerCase()}>`;
}

/**
 * May this campaign go out? Up to the Zoho limit we allow a send from the normal
 * mailbox; above it the dedicated service must be fully set up.
 */
export function sendGate(recipientCount: number, config: SendingConfig): { ok: boolean; viaService: boolean; message: string } {
  if (recipientCount <= 0) return { ok: false, viaService: false, message: "No recipients to send to." };
  if (recipientCount <= ZOHO_BULK_LIMIT) {
    return sendingReady(config)
      ? { ok: true, viaService: true, message: `Sends through ${config.provider ? PROVIDERS[config.provider].label : "the sending service"}.` }
      : { ok: true, viaService: false, message: `Under ${ZOHO_BULK_LIMIT + 1} recipients: sends from your Zoho mailbox.` };
  }
  if (sendingReady(config)) return { ok: true, viaService: true, message: `Sends through ${PROVIDERS[config.provider!].label} from ${fromAddress(config)}.` };
  return {
    ok: false,
    viaService: false,
    message: `Zoho blocks bulk mail above about ${ZOHO_BULK_LIMIT} emails. Finish the sending set-up in Settings > Campaign sending first.`,
  };
}
