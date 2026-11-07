import { bondCheck, type TaxBearing } from "@/lib/bondLines";
import { money } from "@/lib/format";

/**
 * Shown only when an older record still carries VAT / duty. TFL trades under
 * bond, so new documents never do; this lets you see and (where the record is
 * editable) strip it. Renders nothing for a clean document.
 */
export function BondNotice({
  doc,
  currency,
  onFix,
  fixLabel = "Remove VAT / duty",
}: {
  doc: TaxBearing;
  currency: string;
  onFix?: () => void;
  fixLabel?: string;
}) {
  const c = bondCheck(doc);
  if (c.clean) return null;
  const parts = [
    c.taxAmount ? `a tax amount of ${money(c.taxAmount, currency)}` : null,
    c.taxRatePct ? `a ${c.taxRatePct}% tax rate` : null,
    c.taxLineIds.length ? `${c.taxLineIds.length} VAT/duty line${c.taxLineIds.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return (
    <div className="rounded-xl border border-divider bg-elevated p-3 text-[12.5px] text-ink">
      <div className="font-medium">This record still carries VAT / duty</div>
      <p className="mt-0.5 text-ink-secondary">
        It has {parts.join(", ")}. TFL trades under bond (T1/T2), so there should be none.
      </p>
      {onFix ? (
        <button type="button" className="mt-2 font-medium text-[rgb(var(--accent))]" onClick={onFix}>
          {fixLabel}
        </button>
      ) : (
        <p className="mt-1 text-ink-tertiary">An issued invoice is not edited here: raise a corrected invoice.</p>
      )}
    </div>
  );
}
