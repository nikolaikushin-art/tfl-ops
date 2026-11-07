import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { shortDate } from "@/lib/format";
import { staleRates } from "@/lib/fx";
import { PrimaryButton, EmptyState, AccentRule } from "@/components/brand";
import { FormSection, Field, TextInput, SelectInput, TextArea } from "@/components/forms";
import { PanelShell, CURRENCY_OPTIONS } from "@/components/shared-ui";

export function OrganisationPanel({
  onBack,
  showToast,
  toast,
}: {
  onBack: () => void;
  showToast: (msg: string) => void;
  toast: string | null;
}) {
  const store = useStore();
  const [form, setForm] = useState(store.organisation);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    store.updateOrganisation(form);
    showToast("Organisation profile saved");
  };

  return (
    <PanelShell title="Organisation" onBack={onBack} toast={toast}>
      <div className="brand-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Legal name" required>
          <TextInput value={form.legalName} onChange={(e) => set("legalName", e.target.value)} />
        </Field>
        <Field label="Trading as">
          <TextInput value={form.tradingName || ""} onChange={(e) => set("tradingName", e.target.value)} />
        </Field>
        <Field label="Address line 1" full>
          <TextInput value={form.addressLine1 || ""} onChange={(e) => set("addressLine1", e.target.value)} />
        </Field>
        <Field label="Address line 2" full>
          <TextInput value={form.addressLine2 || ""} onChange={(e) => set("addressLine2", e.target.value)} />
        </Field>
        <Field label="City">
          <TextInput value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="Postcode">
          <TextInput value={form.postcode || ""} onChange={(e) => set("postcode", e.target.value)} />
        </Field>
        <Field label="Country" required>
          <TextInput value={form.country} onChange={(e) => set("country", e.target.value)} />
        </Field>
        <Field label="Default currency">
          <SelectInput
            value={form.defaultCurrency}
            onChange={(v) => set("defaultCurrency", v)}
            options={[
              { value: "GBP", label: "GBP — British Pound" },
              { value: "USD", label: "USD — US Dollar" },
              { value: "EUR", label: "EUR — Euro" },
            ]}
          />
        </Field>
        <Field label="VAT number">
          <TextInput value={form.vatNumber || ""} onChange={(e) => set("vatNumber", e.target.value)} />
        </Field>
        <Field label="Company registration number">
          <TextInput value={form.registrationNumber || ""} onChange={(e) => set("registrationNumber", e.target.value)} />
        </Field>
        <Field label="Phone">
          <TextInput value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email">
          <TextInput value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Website" full>
          <TextInput value={form.website || ""} onChange={(e) => set("website", e.target.value)} />
        </Field>
      </div>
      <Button className="w-full h-12 rounded-full bg-accent-fill text-white font-semibold" onClick={save}>
        Save changes
      </Button>
      <p className="text-[13px] text-ink-tertiary px-1">
        Used across quotations, invoices, and the company header. Saved in this browser until you clear site data.
      </p>
    </PanelShell>
  );
}

export function CrmSettingsPanel({
  onBack,
  showToast,
  toast,
}: {
  onBack: () => void;
  showToast: (msg: string) => void;
  toast: string | null;
}) {
  const store = useStore();
  const s = store.crmSettings;
  const [leadSources, setLeadSources] = useState(s.leadSources.join(", "));
  const [segments, setSegments] = useState(s.customerSegments.join(", "));
  const [territories, setTerritories] = useState(s.salesTerritories.join(", "));
  const [followUpDays, setFollowUpDays] = useState(String(s.followUpReminderDays));
  const [expiryWarningDays, setExpiryWarningDays] = useState(String(s.documentExpiryWarningDays));
  const [requireKyc, setRequireKyc] = useState(s.requireKycForOnboarding);

  const save = () => {
    const nextTerritories = territories.split(",").map((t) => t.trim()).filter(Boolean);
    store.updateCrmSettings({
      leadSources: leadSources.split(",").map((t) => t.trim()).filter(Boolean),
      customerSegments: segments.split(",").map((t) => t.trim()).filter(Boolean),
      salesTerritories: nextTerritories,
      followUpReminderDays: Number(followUpDays) || s.followUpReminderDays,
      // Zero is a legitimate setting ("warn only once expired"), so guard on
      // NaN rather than on falsiness.
      documentExpiryWarningDays: Number.isFinite(Number(expiryWarningDays))
        ? Math.max(0, Number(expiryWarningDays))
        : s.documentExpiryWarningDays,
      requireKycForOnboarding: requireKyc,
    });
    showToast("CRM settings saved");
  };

  // Territories already in use that the edit box no longer contains — removing
  // them would orphan those customers, so say so before the save happens.
  const pendingTerritories = new Set(
    territories.split(",").map((t) => t.trim()).filter(Boolean),
  );
  const orphaned = Array.from(
    new Set(
      store.customers
        .map((c) => c.territory)
        .filter((t): t is string => Boolean(t) && !pendingTerritories.has(t as string)),
    ),
  );

  return (
    <PanelShell title="CRM" onBack={onBack} toast={toast}>
      <div className="brand-card p-4 space-y-4">
        <Field label="Lead sources" hint="Comma-separated, shown when logging a new lead">
          <TextInput value={leadSources} onChange={(e) => setLeadSources(e.target.value)} placeholder="Referral, Website, Trade show" />
        </Field>
        <Field label="Customer segments" hint="Comma-separated, used to classify customers">
          <TextInput value={segments} onChange={(e) => setSegments(e.target.value)} placeholder="Wholesale, Retail, Distributor" />
        </Field>
        <Field label="Sales territories" hint="Comma-separated, offered when assigning a customer">
          <TextInput
            value={territories}
            onChange={(e) => setTerritories(e.target.value)}
            placeholder="UK & Ireland, Northern Europe, Middle East"
          />
        </Field>
        {orphaned.length > 0 ? (
          <p className="-mt-2 text-[12px] text-accent">
            {orphaned.join(", ")} {orphaned.length === 1 ? "is" : "are"} still assigned to customers. Removing{" "}
            {orphaned.length === 1 ? "it" : "them"} will leave those accounts without a territory.
          </p>
        ) : null}
        <Field label="Follow-up reminder (days)" hint="Days of inactivity before a customer is flagged for follow-up">
          <TextInput type="number" value={followUpDays} onChange={(e) => setFollowUpDays(e.target.value)} />
        </Field>
        <Field
          label="Document expiry warning (days)"
          hint="How far ahead a contract, certificate or KYC pack is flagged as expiring"
        >
          <TextInput
            type="number"
            min="0"
            value={expiryWarningDays}
            onChange={(e) => setExpiryWarningDays(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div>
            <div className="text-[15px] font-medium">Require KYC for onboarding</div>
            <div className="text-[13px] text-ink-secondary">New customers must complete KYC before activation</div>
          </div>
          <button
            type="button"
            onClick={() => setRequireKyc((v) => !v)}
            className={cn(
              "h-7 w-12 shrink-0 rounded-full transition-colors relative",
              requireKyc ? "bg-accent-fill" : "bg-elevated",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
                requireKyc ? "translate-x-5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </div>
      <Button className="w-full h-12 rounded-full bg-accent-fill text-white font-semibold" onClick={save}>
        Save changes
      </Button>
    </PanelShell>
  );
}

export function SalesSettingsPanel({
  onBack,
  showToast,
  toast,
}: {
  onBack: () => void;
  showToast: (msg: string) => void;
  toast: string | null;
}) {
  const store = useStore();
  const s = store.salesSettings;
  const [quotationPrefix, setQuotationPrefix] = useState(s.quotationPrefix);
  const [validityDays, setValidityDays] = useState(String(s.quotationValidityDays));
  const [orderPrefix, setOrderPrefix] = useState(s.orderPrefix);
  const [invoicePrefix, setInvoicePrefix] = useState(s.invoicePrefix || "INV-2026-");
  const [paymentTerms, setPaymentTerms] = useState(s.defaultPaymentTerms);
  const [approvalAmount, setApprovalAmount] = useState(String(s.requireApprovalAboveAmount ?? ""));

  const save = () => {
    store.updateSalesSettings({
      quotationPrefix: quotationPrefix.trim() || s.quotationPrefix,
      quotationValidityDays: Number(validityDays) || s.quotationValidityDays,
      orderPrefix: orderPrefix.trim() || s.orderPrefix,
      invoicePrefix: invoicePrefix.trim() || s.invoicePrefix || "INV-2026-",
      defaultPaymentTerms: paymentTerms.trim() || s.defaultPaymentTerms,
      defaultTaxRatePct: 0, // bonded trade: no VAT or duty
      requireApprovalAboveAmount: approvalAmount.trim() ? Number(approvalAmount) : undefined,
    });
    showToast("Sales settings saved");
  };

  return (
    <PanelShell title="Sales" onBack={onBack} toast={toast}>
      <div className="brand-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Quotation number prefix">
          <TextInput value={quotationPrefix} onChange={(e) => setQuotationPrefix(e.target.value)} />
        </Field>
        <Field label="Quotation validity (days)">
          <TextInput type="number" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
        </Field>
        <Field label="Order number prefix">
          <TextInput value={orderPrefix} onChange={(e) => setOrderPrefix(e.target.value)} />
        </Field>
        <Field label="Invoice number prefix">
          <TextInput value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} />
        </Field>
        <Field label="Default payment terms">
          <TextInput value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="30 days" />
        </Field>
        <Field label="Require approval above" hint="Leave blank to disable approval threshold">
          <TextInput type="number" value={approvalAmount} onChange={(e) => setApprovalAmount(e.target.value)} placeholder="25000" />
        </Field>
      </div>
      <Button className="w-full h-12 rounded-full bg-accent-fill text-white font-semibold" onClick={save}>
        Save changes
      </Button>
      <p className="text-[13px] text-ink-tertiary px-1">
        Applies to new quotations and orders created under Sales.
      </p>
    </PanelShell>
  );
}

export function ProductSettingsPanel({
  onBack,
  showToast,
  toast,
}: {
  onBack: () => void;
  showToast: (msg: string) => void;
  toast: string | null;
}) {
  const store = useStore();
  const s = store.productSettings;
  const [categories, setCategories] = useState(s.categories.join(", "));
  const [units, setUnits] = useState(s.units.join(", "));
  const [currency, setCurrency] = useState(s.defaultCurrency);
  const [marginThreshold, setMarginThreshold] = useState(String(s.lowMarginThresholdPct));

  const save = () => {
    store.updateProductSettings({
      categories: categories.split(",").map((t) => t.trim()).filter(Boolean),
      units: units.split(",").map((t) => t.trim()).filter(Boolean),
      defaultCurrency: currency,
      lowMarginThresholdPct: Number(marginThreshold) || s.lowMarginThresholdPct,
    });
    showToast("Product settings saved");
  };

  return (
    <PanelShell title="Products" onBack={onBack} toast={toast}>
      <div className="brand-card p-4 space-y-4">
        <Field label="Categories" hint="Comma-separated, offered when creating a product">
          <TextInput value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="Spirits, Wines, Champagnes" />
        </Field>
        <Field label="Units of measure" hint="Comma-separated">
          <TextInput value={units} onChange={(e) => setUnits(e.target.value)} placeholder="unit, kg, box, pallet" />
        </Field>
        <Field label="Default currency">
          <SelectInput
            value={currency}
            onChange={setCurrency}
            options={[
              { value: "GBP", label: "GBP — British Pound" },
              { value: "USD", label: "USD — US Dollar" },
              { value: "EUR", label: "EUR — Euro" },
            ]}
          />
        </Field>
        <Field label="Low margin alert threshold (%)" hint="Flag products whose margin falls below this">
          <TextInput type="number" value={marginThreshold} onChange={(e) => setMarginThreshold(e.target.value)} />
        </Field>
      </div>
      <Button className="w-full h-12 rounded-full bg-accent-fill text-white font-semibold" onClick={save}>
        Save changes
      </Button>
    </PanelShell>
  );
}

type LegalSection = { heading: string; body: string[] };

export function LegalDocument({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="brand-card p-5 sm:p-7 space-y-6">
      <p className="text-[12px] text-ink-tertiary">
        Last updated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} ·
        The Film Location, 843 Finchley Rd, London NW11 8NA
      </p>
      {sections.map((s) => (
        <div key={s.heading} className="space-y-2">
          <h3 className="text-[15px] font-semibold text-ink">{s.heading}</h3>
          {s.body.map((p, i) => (
            <p key={i} className="text-[13.5px] leading-relaxed text-ink-secondary">
              {p}
            </p>
          ))}
        </div>
      ))}
      <p className="text-[12px] text-ink-tertiary pt-2 border-t border-divider">
        This is a demo/prototype document for evaluation purposes and does not constitute legal advice.
        The Film Location should have this reviewed and finalised by qualified legal counsel before production use.
      </p>
    </div>
  );
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "1. Acceptance of terms",
    body: [
      "By accessing or using the The Film Location commercial platform (\"the Platform\"), you agree to be bound by these Terms & Conditions. If you do not agree, do not use the Platform.",
    ],
  },
  {
    heading: "2. Authorised use",
    body: [
      "Access is restricted to authorised The Film Location personnel and approved third parties. Accounts are personal and must not be shared. Users are responsible for all activity under their credentials.",
    ],
  },
  {
    heading: "3. Data & confidentiality",
    body: [
      "Customer, supplier and pricing data held in the Platform is confidential business information. It must not be exported, shared or disclosed outside The Film Location except as required for legitimate business purposes.",
    ],
  },
  {
    heading: "4. Acceptable use",
    body: [
      "The Platform must not be used to store or process unlawful content, to circumvent security controls, or in any way that could disrupt service for other users.",
    ],
  },
  {
    heading: "5. Availability & liability",
    body: [
      "The Platform is provided on an \"as is\" basis during its prototype/demo phase. The Film Location and its developers make no warranty of uninterrupted availability and accept no liability for business decisions made solely on demo data.",
    ],
  },
  {
    heading: "6. Changes to these terms",
    body: [
      "These terms may be updated as the Platform moves from prototype to production. Continued use after an update constitutes acceptance of the revised terms.",
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "1. What we collect",
    body: [
      "The Platform holds business contact data (names, emails, phone numbers, company affiliations), correspondence history, commercial records (quotations, orders, invoices) and, where provided, KYC/onboarding documents for customers and suppliers.",
    ],
  },
  {
    heading: "2. How data is used",
    body: [
      "Data is used solely to operate The Film Location's sales, sourcing, finance and compliance processes — including pricing intelligence and reporting shown on this Platform.",
    ],
  },
  {
    heading: "3. Storage & retention",
    body: [
      "In this prototype, data is held client-side for the duration of the session and is not transmitted to a third-party server. A production deployment will define server-side storage location, retention periods and backup policy.",
    ],
  },
  {
    heading: "4. Third-party integrations",
    body: [
      "Where email, WhatsApp, accounting or mailing providers are connected in a future production version, data will only be shared with those providers as strictly necessary to deliver the integration, under their respective data processing terms.",
    ],
  },
  {
    heading: "5. Individual rights",
    body: [
      "Individuals whose data is held in the Platform may request access to, correction of, or deletion of their personal data, subject to The Film Location's legitimate business and legal record-keeping requirements.",
    ],
  },
  {
    heading: "6. Contact",
    body: [
      "Questions about this policy should be directed to The Film Location, 843 Finchley Rd, London NW11 8NA.",
    ],
  },
];


/**
 * Currency & trade settings.
 *
 * The rate table is the quiet foundation of the whole intelligence layer:
 * margin, credit exposure and the price index all convert through it. So the
 * panel is explicit about provenance — every rate carries the date it was
 * entered, rates over a month old are called out, and there is no "fetch live
 * rates" button, because there is no rate provider behind this build and a
 * button that invented a number would be worse than no button.
 */
export function TermsPanel() {
  return <LegalDocument sections={TERMS_SECTIONS} />;
}

export function PrivacyPanel() {
  return <LegalDocument sections={PRIVACY_SECTIONS} />;
}

export function CurrencySettingsPanel({
  onBack,
  showToast,
  toast,
}: {
  onBack: () => void;
  showToast: (msg: string) => void;
  toast: string | null;
}) {
  const store = useStore();
  const [draft, setDraft] = useState(() =>
    store.fx.rates.map((r) => ({ currency: r.currency, value: String(r.perBase), asOf: r.asOf })),
  );
  const [newCurrency, setNewCurrency] = useState("");
  const [trade, setTrade] = useState(store.tradeSettings);
  const stale = staleRates(store.fx);

  const save = () => {
    const today = new Date().toISOString();
    const next = draft
      .filter((row) => row.currency.trim() && Number(row.value) > 0)
      .map((row) => {
        const existing = store.fx.rates.find((r) => r.currency === row.currency);
        const changed = !existing || existing.perBase !== Number(row.value);
        // Only a changed rate gets re-stamped. Re-dating every row on save
        // would make a stale table look fresh without anyone having checked it.
        return {
          currency: row.currency.trim().toUpperCase(),
          perBase: Number(row.value),
          asOf: changed ? today : existing!.asOf,
        };
      });
    store.updateFxRates(next);
    store.updateTradeSettings(trade);
    showToast("Rates and trade defaults saved");
  };

  return (
    <PanelShell title="Currency & trade" onBack={onBack} toast={toast}>
      <div className="brand-card p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold text-ink">
            Reporting currency — {store.fx.base}
          </span>
          <span className="text-[12px] text-ink-tertiary">1 {store.fx.base} buys</span>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-secondary">
          Every converted figure in the platform — margin, exposure, the price index —
          resolves through this table. A currency with no rate is reported in its own
          currency rather than assumed to be at parity.
        </p>

        {draft.map((row, index) => (
          <div key={row.currency} className="flex items-end gap-3">
            <div className="w-16 shrink-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">
                {row.currency}
              </span>
              <span className="block text-[11px] text-ink-tertiary">
                {shortDate(row.asOf)}
              </span>
            </div>
            <div className="flex-1">
              <TextInput
                value={row.value}
                inputMode="decimal"
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)),
                  )
                }
              />
            </div>
            <Button
              variant="ghost"
              className="h-11 shrink-0 px-3 text-ink-tertiary"
              onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <div className="flex items-end gap-3 border-t border-divider pt-3">
          <div className="flex-1">
            <Field label="Add a currency" hint="ISO code, e.g. CHF">
              <TextInput
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
                placeholder="CHF"
              />
            </Field>
          </div>
          <Button
            variant="outline"
            className="h-11 shrink-0 rounded-xl"
            onClick={() => {
              const code = newCurrency.trim().toUpperCase();
              if (!code || draft.some((r) => r.currency === code)) return;
              setDraft((prev) => [
                ...prev,
                { currency: code, value: "1", asOf: new Date().toISOString() },
              ]);
              setNewCurrency("");
            }}
          >
            Add
          </Button>
        </div>

        {stale.length ? (
          <p className="text-[13px] leading-relaxed" style={{ color: "rgb(var(--caution))" }}>
            {stale.map((r) => r.currency).join(", ")} last confirmed over a month ago. Every
            figure converted through those rates inherits that age, and the Signals page says so.
          </p>
        ) : null}
      </div>

      <div className="brand-card p-4 space-y-3">
        <span className="block text-[15px] font-semibold text-ink">Exchange rate policy</span>
        <p className="text-[13px] leading-relaxed text-ink-secondary">
          A decision for you to make. Under either option the actual rate is recorded on each deal.
        </p>
        {([
          ["live", "Live rates for quoting", "Quotes use a current market rate from a rate provider. Needs the server build; until then the table above is used."],
          ["controlled", "A controlled rate table", "You set and date each rate yourself, so every figure traces to a rate you chose. This is how the table above works today."],
        ] as const).map(([value, title, body]) => (
          <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${trade.fxPolicy === value ? "border-accent bg-accent/5" : "border-divider"}`}>
            <input type="radio" name="fxPolicy" className="mt-1" checked={trade.fxPolicy === value} onChange={() => setTrade({ ...trade, fxPolicy: value })} />
            <span className="text-[13px] text-ink-secondary"><span className="block font-semibold text-ink">{title}</span>{body}</span>
          </label>
        ))}
        {!trade.fxPolicy ? <p className="text-[12px] text-ink-tertiary">Not decided yet. The controlled table is used meanwhile.</p> : null}
      </div>

      <div className="brand-card p-4 space-y-4">
        <span className="block text-[15px] font-semibold text-ink">Margin and alerts</span>
        <p className="text-[13px] leading-relaxed text-ink-secondary">
          Everything is traded under bond (T1 / T2), so there is no import duty, insurance or freight cost to assume here.
        </p>
        <Field label="Target margin, %" hint="Used by the price solver">
          <TextInput
            value={String(trade.targetMarginPct)}
            inputMode="decimal"
            onChange={(e) => setTrade({ ...trade, targetMarginPct: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field
          label="Price alert threshold, %"
          hint="A move smaller than this is not worth a signal"
        >
          <TextInput
            value={String(trade.priceAlertThresholdPct)}
            inputMode="decimal"
            onChange={(e) =>
              setTrade({ ...trade, priceAlertThresholdPct: Number(e.target.value) || 0 })
            }
          />
        </Field>
      </div>

      <Button className="h-11 w-full rounded-xl bg-accent-fill" onClick={save}>
        Save
      </Button>
    </PanelShell>
  );
}
