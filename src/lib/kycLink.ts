/**
 * The Film Location CRM — public onboarding & KYC form (v22). Pure helpers.
 *
 * Until the server build exists there is nowhere for a client's browser to post
 * to, so the link carries everything the form needs (who it is for, which
 * documents are asked for) and the finished form produces a *return code* the
 * client sends back by email. Pasting it into the KYC screen fills the record
 * and runs the duplicate check. The server build replaces the return code with
 * a normal POST; the form, the fields and the validation stay the same.
 *
 * Nothing in the link or the code is secret-grade: the token only ties a
 * returned form to the case TFL opened. Bank details are asked for on the
 * form but are NOT written onto the contact record (see store.submitKycForm).
 */
import { KYC_DOCS_BY_ROLE } from "./kyc";
import type { ContactRole } from "./domain";

export interface KycInvite {
  token: string;
  /** Who the form is for (as TFL knows them). */
  name: string;
  roles: ContactRole[];
  /** Documents TFL asks for, from the role checklist. */
  docs: string[];
}

export interface KycFormData {
  name: string;
  companyNumber?: string;
  vatNumber?: string;
  addressLine1?: string;
  city?: string;
  country?: string;
  website?: string;
  contactName?: string;
  email: string;
  phone?: string;
  bankDetails?: string;
  directors?: string;
  declaration: boolean;
}

export interface KycSubmission {
  token: string;
  submittedAt: string;
  data: KycFormData;
}

/* ---- base64url over UTF-8 ------------------------------------------------ */

function toB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64(b64: string): string {
  const pad = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export const encodeKycInvite = (i: KycInvite) => toB64(JSON.stringify(i));
export function decodeKycInvite(code: string): KycInvite | null {
  try {
    const v = JSON.parse(fromB64(code.trim()));
    if (!v || typeof v.token !== "string" || typeof v.name !== "string" || !Array.isArray(v.docs)) return null;
    return { token: v.token, name: v.name, roles: Array.isArray(v.roles) ? v.roles : [], docs: v.docs.map(String) };
  } catch {
    return null;
  }
}

const PREFIX = "TFL-KYC-";
export const encodeKycSubmission = (s: KycSubmission) => PREFIX + toB64(JSON.stringify(s));
export function decodeKycSubmission(code: string): KycSubmission | null {
  try {
    const raw = code.trim().replace(/\s+/g, "");
    if (!raw.startsWith(PREFIX)) return null;
    const v = JSON.parse(fromB64(raw.slice(PREFIX.length)));
    if (!v || typeof v.token !== "string" || !v.data || typeof v.data.name !== "string") return null;
    return v as KycSubmission;
  } catch {
    return null;
  }
}

/** Document list asked of a company with these roles (union, in checklist order). */
export function docsForRoles(roles: ContactRole[]): string[] {
  const out: string[] = [];
  for (const r of roles.length ? roles : (["other"] as ContactRole[])) {
    for (const d of KYC_DOCS_BY_ROLE[r] ?? []) if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** #/onboarding/<token>?i=<invite> — a hash route, so any static host serves it. */
export function buildKycLink(base: string, invite: KycInvite): string {
  return `${base}#/onboarding/${invite.token}?i=${encodeKycInvite(invite)}`;
}

export function parseKycHash(hash: string): { token: string; invite: KycInvite | null } | null {
  const m = hash.match(/^#\/onboarding\/([A-Za-z0-9]+)(?:\?i=([A-Za-z0-9_-]+))?/);
  if (!m) return null;
  const invite = m[2] ? decodeKycInvite(m[2]) : null;
  return { token: m[1], invite: invite && invite.token === m[1] ? invite : null };
}

export function validateKycForm(d: Partial<KycFormData>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.name?.trim()) e.name = "Enter the company or trading name.";
  if (!d.email?.trim()) e.email = "Enter an email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = "That email address doesn't look right.";
  if (!d.country?.trim()) e.country = "Enter the country.";
  if (!d.contactName?.trim()) e.contactName = "Enter a contact name.";
  if (!d.declaration) e.declaration = "Please confirm the details are correct.";
  return e;
}
