/**
 * Xero account mapping and posting entry (v30).
 * Agreed once with the accountants, then every deal posts the same way:
 * commission income, escrow/warehouse fees and bank charges as separate lines, so the
 * entry equals the net amount in the bank. Original currency, deal ref as tracking
 * category, deal documents attached. Always created as a DRAFT for approval.
 */
import type { Deal, Document, ExpenseCategory } from "./domain";
import { grossMargin, expectedNet } from "./deals";

export interface XeroAccount { code: string; name: string }
export interface XeroMapping {
  commissionIncome: XeroAccount;
  escrowFees: XeroAccount;
  bankCharges: XeroAccount;
  fxGainLoss: XeroAccount;
  /** Expense categories -> Xero expense codes (agreed with the accountants). */
  expenses: Partial<Record<ExpenseCategory, XeroAccount>>;
}

export const EMPTY_MAPPING: XeroMapping = {
  commissionIncome: { code: "", name: "Commission income" },
  escrowFees: { code: "", name: "Escrow / warehouse fees" },
  bankCharges: { code: "", name: "Bank charges" },
  fxGainLoss: { code: "", name: "FX gain / loss" },
  expenses: {},
};

const REQUIRED: (keyof Omit<XeroMapping, "expenses">)[] = ["commissionIncome", "escrowFees", "bankCharges"];

/** Which accounts still have no Xero code. FX is only required when a deal needs it. */
export function mappingGaps(m: XeroMapping): string[] {
  return REQUIRED.filter((k) => !m[k].code.trim()).map((k) => m[k].name);
}

export interface PostingLine { account: string; code: string; amount: number; kind: "income" | "cost" | "fx" }
export interface XeroEntry {
  reference: string;
  trackingCategory: string;
  currency: string;
  status: "DRAFT";
  lines: PostingLine[];
  /** What should arrive in the bank: sum of the lines. */
  bankNet: number;
  attachments: string[];
  blockers: string[];
  warnings: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build the draft entry for a deal. Blockers stop posting; warnings do not.
 * If the margin actually received differs from expected, the difference goes to the
 * FX gain/loss account and a warning asks to confirm it is FX and not a short payment.
 */
export function buildXeroEntry(d: Deal, m: XeroMapping, docs: Pick<Document, "name" | "dealId">[] = []): XeroEntry {
  const gross = r2(grossMargin(d));
  const lines: PostingLine[] = [
    { account: m.commissionIncome.name, code: m.commissionIncome.code, amount: gross, kind: "income" },
    { account: m.escrowFees.name, code: m.escrowFees.code, amount: -r2(d.escrowFees), kind: "cost" },
    { account: m.bankCharges.name, code: m.bankCharges.code, amount: -r2(d.bankCharges), kind: "cost" },
  ];
  const blockers: string[] = [];
  const warnings: string[] = [];
  const gaps = mappingGaps(m);
  if (gaps.length) blockers.push(`Xero account code missing for: ${gaps.join(", ")}. Agree these with the accountants in Settings.`);
  if (!d.marginReceivedDate) blockers.push("Margin has not been received yet.");
  if (d.stage === "cancelled") blockers.push("Cancelled deals are not posted.");
  if (d.historical && d.xero.status === "reconciled") blockers.push("Already in Xero.");

  const expected = r2(expectedNet(d));
  const diff = d.actualMargin == null ? 0 : r2(d.actualMargin - expected);
  if (diff !== 0) {
    lines.push({ account: m.fxGainLoss.name, code: m.fxGainLoss.code, amount: diff, kind: "fx" });
    if (!m.fxGainLoss.code.trim()) blockers.push("Margin received differs from expected: FX gain / loss account needs a Xero code.");
    warnings.push(`Received ${d.actualMargin} but expected ${expected}: the ${diff > 0 ? "extra" : "shortfall"} of ${Math.abs(diff)} is posted to FX gain / loss. Check it is not a short payment.`);
  }
  const bankNet = r2(lines.reduce((s, l) => s + l.amount, 0));
  const attachments = docs.filter((x) => x.dealId === d.id).map((x) => x.name);
  if (!attachments.length) warnings.push("No documents are filed to this deal to attach.");
  return { reference: d.ref, trackingCategory: d.ref, currency: d.currency, status: "DRAFT", lines, bankNet, attachments, blockers, warnings };
}

export const canPost = (e: XeroEntry) => e.blockers.length === 0;

/** Xero code for an expense, or undefined when not mapped yet. */
export function expenseAccount(m: XeroMapping, c: ExpenseCategory): XeroAccount | undefined {
  const a = m.expenses[c];
  return a && a.code.trim() ? a : undefined;
}
export function unmappedExpenseCategories(m: XeroMapping, used: ExpenseCategory[]): ExpenseCategory[] {
  return [...new Set(used)].filter((c) => !expenseAccount(m, c));
}
