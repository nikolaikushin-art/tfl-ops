/**
 * The Film Location CRM — onboarding & KYC helpers (v17).
 * Pure functions: duplicate detection and the per-role document checklists.
 * Roni defines the final checklists; these are sensible starting defaults.
 */
import type { ContactRole, Customer, Supplier } from "@/lib/domain";

export const KYC_DOCS_BY_ROLE: Record<ContactRole, string[]> = {
  buyer: ["Certificate of incorporation", "Director ID", "Proof of address", "Bank details", "Excise / trade licence"],
  supplier: ["Certificate of incorporation", "Director ID", "Bank details", "Excise / trade licence", "Brand authorisation (if any)"],
  trader: ["Certificate of incorporation", "Director ID", "Proof of address", "Bank details", "Excise / trade licence"],
  warehouse: ["Bonded warehouse authorisation", "Certificate of incorporation", "Escrow terms & fee schedule"],
  broker: ["Certificate of incorporation (or ID if sole trader)", "Proof of address"],
  service: ["Certificate of incorporation"],
  other: ["Certificate of incorporation"],
};

const norm = (v?: string) =>
  (v ?? "")
    .toLowerCase()
    .replace(/\b(ltd|limited|llc|gmbh|sa|sarl|bv|inc|co|company|fze|fzc)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");

export interface DuplicateHit {
  id: string;
  name: string;
  kind: "customer" | "supplier";
  reason: "name" | "email" | "company number" | "vat";
}

/** Flags existing records that look like the submitted details. */
export function findDuplicates(
  input: { name?: string; email?: string; companyNumber?: string; vatNumber?: string },
  customers: Customer[],
  suppliers: Supplier[],
  ignoreId?: string,
): DuplicateHit[] {
  const hits: DuplicateHit[] = [];
  const check = (kind: "customer" | "supplier", r: Customer | Supplier) => {
    if (r.id === ignoreId) return;
    const c = r as Customer;
    if (input.companyNumber && c.companyNumber && norm(input.companyNumber) === norm(c.companyNumber))
      hits.push({ id: r.id, name: r.name, kind, reason: "company number" });
    else if (input.vatNumber && r.vatNumber && norm(input.vatNumber) === norm(r.vatNumber))
      hits.push({ id: r.id, name: r.name, kind, reason: "vat" });
    else if (input.email && r.email && input.email.trim().toLowerCase() === r.email.trim().toLowerCase())
      hits.push({ id: r.id, name: r.name, kind, reason: "email" });
    else if (input.name && norm(input.name) && norm(input.name) === norm(r.name))
      hits.push({ id: r.id, name: r.name, kind, reason: "name" });
  };
  customers.forEach((c) => check("customer", c));
  suppliers.forEach((s) => check("supplier", s));
  return hits;
}

export const newKycToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
