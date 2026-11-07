import { AlertCircle, Clock } from "lucide-react";
import { Pill, type PillTone } from "@/components/ios";
import { expiryLabel, type ExpiryInfo } from "@/lib/documents";

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "contract", label: "Contract" },
  { value: "quotation", label: "Quotation" },
  { value: "order", label: "Order" },
  { value: "invoice", label: "Invoice" },
  { value: "kyc", label: "KYC" },
  { value: "certificate", label: "Certificate" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
];

/**
 * Expiry badge.
 *
 * Rebuilt on the shared iOS pill. The previous version used a saturated orange
 * for anything inside the warning window, which is not a colour Apple uses for
 * a countdown and which made three documents that are merely *approaching*
 * renewal shout louder than the one that has actually lapsed. Now: neutral
 * while there's time, a muted caution inside the window, red only once it has
 * genuinely expired.
 */
export function ExpiryBadge({ info }: { info: ExpiryInfo }) {
  if (info.state === "none") {
    return <span className="text-[12px] text-ink-tertiary">No expiry</span>;
  }
  const tone: PillTone =
    info.state === "expired" ? "danger" : info.state === "expiring" ? "caution" : "success";
  const Icon = info.state === "expired" ? AlertCircle : info.state === "expiring" ? Clock : undefined;
  return (
    <Pill tone={tone} icon={Icon}>
      {expiryLabel(info)}
    </Pill>
  );
}
