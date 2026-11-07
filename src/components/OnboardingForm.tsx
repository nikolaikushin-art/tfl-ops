/**
 * Public Onboarding & KYC form (v22). Opened from the link TFL sends
 * (#/onboarding/<token>). It deliberately uses nothing from the CRM store, so
 * the person filling it in never sees, or loads, any CRM data.
 *
 * Without the server build the finished form gives the client a return code to
 * email back; TFL pastes it on the KYC screen. Documents are listed so the
 * client knows what to send, and are attached to the reply email.
 */
import { useMemo, useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import { inputClass } from "@/components/brand";
import {
  encodeKycSubmission,
  parseKycHash,
  validateKycForm,
  type KycFormData,
} from "@/lib/kycLink";

const REPLY_TO = "info@yourdomain.com"; // TODO: set to the TFL contact address

export function OnboardingForm({ hash }: { hash: string }) {
  const parsed = useMemo(() => parseKycHash(hash), [hash]);
  const invite = parsed?.invite ?? null;
  const [d, setD] = useState<Partial<KycFormData>>({ name: invite?.name ?? "", declaration: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (k: keyof KycFormData, v: string | boolean) => setD((x) => ({ ...x, [k]: v }));

  const submit = () => {
    const e = validateKycForm(d);
    setErrors(e);
    if (Object.keys(e).length || !parsed) return;
    setCode(encodeKycSubmission({ token: parsed.token, submittedAt: new Date().toISOString(), data: d as KycFormData }));
  };

  const field = (k: keyof KycFormData, label: string, opts: { required?: boolean; multiline?: boolean; hint?: string } = {}) => (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-medium text-ink-secondary">
        {label}
        {opts.required ? " *" : ""}
      </span>
      {opts.multiline ? (
        <textarea rows={3} className={inputClass + " h-auto py-2"} value={(d[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input className={inputClass} value={(d[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} />
      )}
      {opts.hint ? <span className="mt-1 block text-[12px] text-ink-tertiary">{opts.hint}</span> : null}
      {errors[k] ? <span className="mt-1 block text-[12px] text-red-600">{errors[k]}</span> : null}
    </label>
  );

  return (
    <div className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto max-w-[640px] space-y-5">
        <img src="/logo-blue.png" alt="The Film Location" className="h-8" />
        <div>
          <h1 className="ios-large-title text-ink">Onboarding &amp; KYC</h1>
          <p className="text-[13.5px] text-ink-secondary">
            Please complete this form so we can set up your account. It takes about five minutes.
          </p>
        </div>

        {!parsed ? (
          <div className="brand-card p-5 text-[14px] text-ink">
            This link isn't valid. Please ask The Film Location to send it again.
          </div>
        ) : code ? (
          <div className="brand-card space-y-3 p-5">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Your form is complete
            </div>
            <p className="text-[13.5px] text-ink-secondary">
              To send it to us, email the code below to <b>{REPLY_TO}</b>
              {invite?.docs.length ? ", together with the documents listed" : ""}. Nothing has been sent yet.
            </p>
            <textarea readOnly rows={5} value={code} className={inputClass + " h-auto break-all py-2 font-mono text-[12px]"} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--accent-fill))] px-3.5 py-2 text-[13px] font-medium text-white"
                onClick={() => {
                  void navigator.clipboard?.writeText(code).catch(() => {});
                  setCopied(true);
                }}
              >
                <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy code"}
              </button>
              <a
                className="rounded-xl border border-divider px-3.5 py-2 text-[13px] font-medium text-ink"
                href={`mailto:${REPLY_TO}?subject=${encodeURIComponent(`KYC form: ${d.name ?? ""}`)}&body=${encodeURIComponent(`Please find my completed onboarding form code below. Documents attached.\n\n${code}`)}`}
              >
                Open in my email
              </a>
            </div>
          </div>
        ) : (
          <>
            <section className="brand-card space-y-3 p-5">
              <h2 className="text-[14px] font-semibold text-ink">Company</h2>
              {field("name", "Company or trading name", { required: true, hint: "Sole traders: your own name or trading name." })}
              <div className="grid gap-3 sm:grid-cols-2">
                {field("companyNumber", "Company registration number")}
                {field("vatNumber", "VAT / tax number")}
                {field("addressLine1", "Address")}
                {field("city", "City")}
                {field("country", "Country", { required: true })}
                {field("website", "Website")}
              </div>
              {field("directors", "Directors / owners", { multiline: true, hint: "Full names, one per line." })}
            </section>

            <section className="brand-card space-y-3 p-5">
              <h2 className="text-[14px] font-semibold text-ink">Contact</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {field("contactName", "Contact name", { required: true })}
                {field("email", "Email", { required: true })}
                {field("phone", "Phone / WhatsApp")}
              </div>
              {field("bankDetails", "Bank details (name, IBAN, SWIFT)", {
                multiline: true,
                hint: "Used only to verify payments. It is not stored on your contact record.",
              })}
            </section>

            {invite?.docs.length ? (
              <section className="brand-card p-5">
                <h2 className="mb-2 text-[14px] font-semibold text-ink">Documents we need</h2>
                <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-ink">
                  {invite.docs.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[12.5px] text-ink-secondary">Attach these when you email your completed form back to us.</p>
              </section>
            ) : null}

            <label className="flex items-start gap-2 text-[13.5px] text-ink">
              <input type="checkbox" className="mt-1" checked={!!d.declaration} onChange={(e) => set("declaration", e.target.checked)} />
              I confirm the details above are correct and I am authorised to provide them.
            </label>
            {errors.declaration ? <div className="text-[12px] text-red-600">{errors.declaration}</div> : null}

            <button type="button" onClick={submit} className="w-full rounded-xl bg-[rgb(var(--accent-fill))] px-4 py-3 text-[14px] font-semibold text-white">
              Complete form
            </button>
          </>
        )}
      </div>
    </div>
  );
}
