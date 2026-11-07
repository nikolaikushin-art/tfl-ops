/** Settings > Xero account mapping. Agreed once with the accountants. */
import { useStore } from "@/lib/store";
import { PanelShell } from "@/components/shared-ui";
import { inputClass } from "@/components/brand";
import { useXeroMapping } from "@/lib/useXeroMapping";
import { mappingGaps, unmappedExpenseCategories, type XeroAccount, type XeroMapping } from "@/lib/xeroMapping";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/domain";

const CORE: { key: "commissionIncome" | "escrowFees" | "bankCharges" | "fxGainLoss"; hint: string }[] = [
  { key: "commissionIncome", hint: "Our margin on each deal (official accounting treats it as commission)." },
  { key: "escrowFees", hint: "Escrow / warehouse fees taken before we are paid." },
  { key: "bankCharges", hint: "Bank charges on the payments." },
  { key: "fxGainLoss", hint: "Used only when the margin received differs from expected." },
];

export function XeroMappingPanel({ onBack, toast }: { onBack: () => void; toast?: string | null }) {
  const store = useStore();
  const { mapping, setMapping } = useXeroMapping();
  const set = (patch: Partial<XeroMapping>) => setMapping({ ...mapping, ...patch });
  const acct = (a: XeroAccount, patch: Partial<XeroAccount>): XeroAccount => ({ ...a, ...patch });
  const gaps = mappingGaps(mapping);
  const used = store.expenses.map((e) => e.category);
  const unmapped = unmappedExpenseCategories(mapping, used);
  const row = (label: string, hint: string, a: XeroAccount, onChange: (a: XeroAccount) => void) => (
    <div key={label} className="grid items-end gap-2 sm:grid-cols-[1fr_110px_1fr]">
      <div><div className="text-[13px] font-medium text-ink">{label}</div><div className="text-[11.5px] text-ink-tertiary">{hint}</div></div>
      <input className={inputClass} placeholder="Code" value={a.code} onChange={(e) => onChange(acct(a, { code: e.target.value }))} aria-label={`${label} code`} />
      <input className={inputClass} placeholder="Account name in Xero" value={a.name} onChange={(e) => onChange(acct(a, { name: e.target.value }))} aria-label={`${label} name`} />
    </div>
  );
  return (
    <PanelShell title="Xero account mapping" onBack={onBack} toast={toast ?? null}>
      <div className="space-y-5">
        <p className="text-[13px] text-ink-secondary">
          Agree these once with your accountants. A deal cannot be sent to Xero until the first three have a code.
          {gaps.length ? <span className="font-medium text-accent"> Still missing: {gaps.join(", ")}.</span> : <span className="font-medium text-ink"> Core accounts are set.</span>}
        </p>
        <div className="brand-card space-y-3 p-4">
          {CORE.map((c) => row(mapping[c.key].name, c.hint, mapping[c.key], (a) => set({ [c.key]: a } as Partial<XeroMapping>)))}
        </div>
        <div className="brand-card space-y-3 p-4">
          <h3 className="text-[14px] font-semibold text-ink">Expense codes</h3>
          {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((c) =>
            row(EXPENSE_CATEGORY_LABELS[c], unmapped.includes(c) ? "Used in your expenses but no code yet" : "", mapping.expenses[c] ?? { code: "", name: EXPENSE_CATEGORY_LABELS[c] },
              (a) => set({ expenses: { ...mapping.expenses, [c]: a } })),
          )}
        </div>
        <p className="text-[12px] text-ink-tertiary">Saved on this device until the server build. Entries are always created as drafts for your approval.</p>
      </div>
    </PanelShell>
  );
}
