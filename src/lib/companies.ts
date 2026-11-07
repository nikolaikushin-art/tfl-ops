/**
 * The Film Location CRM — more than one company in Accounting (v26).
 *
 * Roni plans to move the company abroad, so Accounting must be able to hold a
 * second company with its own currency and its own accounting connection.
 * Records without a companyId belong to the PRIMARY company, so everything held
 * today carries on exactly as it is.
 */
export const PRIMARY_COMPANY_ID = "primary";

export interface AccountingCompany {
  id: string;
  name: string;
  /** Currency this company reports in. */
  baseCurrency: string;
  country?: string;
  /** Month the financial year starts, 1-12. */
  financialYearStartMonth: number;
  /** Each company has its own Xero organisation. Connected in the server build. */
  xero: { status: "not_connected" | "connected"; organisation?: string };
}

export const DEFAULT_PRIMARY: AccountingCompany = {
  id: PRIMARY_COMPANY_ID,
  name: "The Film Location",
  baseCurrency: "GBP",
  country: "United Kingdom",
  financialYearStartMonth: 4,
  xero: { status: "not_connected" },
};

export const belongsTo = (item: { companyId?: string }, companyId: string): boolean =>
  (item.companyId ?? PRIMARY_COMPANY_ID) === companyId;

export function inCompany<T extends { companyId?: string }>(items: T[], companyId: string): T[] {
  return items.filter((i) => belongsTo(i, companyId));
}

/** Payments carry no company of their own: they follow the invoice or expense they settle. */
export function paymentsFor<P extends { invoiceId?: string; expenseId?: string }>(
  payments: P[],
  invoices: { id: string }[],
  expenses: { id: string }[],
): P[] {
  const inv = new Set(invoices.map((i) => i.id));
  const exp = new Set(expenses.map((e) => e.id));
  return payments.filter((p) => (p.invoiceId && inv.has(p.invoiceId)) || (p.expenseId && exp.has(p.expenseId)));
}

export interface CompanyInput {
  name: string;
  baseCurrency: string;
  country?: string;
  financialYearStartMonth?: number;
}

export function validateCompany(input: CompanyInput, existing: AccountingCompany[]): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Give the company a name.");
  else if (existing.some((c) => c.name.trim().toLowerCase() === input.name.trim().toLowerCase())) errors.push("A company with this name already exists.");
  if (!/^[A-Za-z]{3}$/.test(input.baseCurrency.trim())) errors.push("Currency should be a 3-letter code such as GBP or EUR.");
  const m = input.financialYearStartMonth ?? 1;
  if (!Number.isInteger(m) || m < 1 || m > 12) errors.push("Financial year start must be a month from 1 to 12.");
  return errors;
}

export function addCompany(existing: AccountingCompany[], input: CompanyInput): AccountingCompany[] {
  if (validateCompany(input, existing).length) return existing;
  const slug = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
  let id = slug;
  for (let n = 2; existing.some((c) => c.id === id) || id === PRIMARY_COMPANY_ID; n++) id = `${slug}-${n}`;
  return [
    ...existing,
    {
      id,
      name: input.name.trim(),
      baseCurrency: input.baseCurrency.trim().toUpperCase(),
      country: input.country?.trim() || undefined,
      financialYearStartMonth: input.financialYearStartMonth ?? 1,
      xero: { status: "not_connected" },
    },
  ];
}

/**
 * Change the financial-year start month of one company. Returns the list with
 * that company updated; an invalid month or unknown id leaves the list as is.
 * The primary company is stored on first change so the choice survives reloads.
 */
export function setFinancialYearStart(
  existing: AccountingCompany[],
  companyId: string,
  month: number,
): AccountingCompany[] {
  if (!Number.isInteger(month) || month < 1 || month > 12) return existing;
  if (!existing.some((c) => c.id === companyId)) return existing;
  return existing.map((c) => (c.id === companyId ? { ...c, financialYearStartMonth: month } : c));
}

/** Always returns the primary first; a stored list that lost it gets it back. */
export function withPrimary(list: AccountingCompany[] | null | undefined, primaryName?: string): AccountingCompany[] {
  const rest = (list ?? []).filter((c) => c.id !== PRIMARY_COMPANY_ID);
  const stored = (list ?? []).find((c) => c.id === PRIMARY_COMPANY_ID);
  return [{ ...DEFAULT_PRIMARY, ...(stored ?? {}), name: stored?.name ?? primaryName ?? DEFAULT_PRIMARY.name }, ...rest];
}
