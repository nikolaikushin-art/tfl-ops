/** One shared lookup of trading figures by record id, for any screen that shows a customer's numbers. */
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { buildParties, figuresForRecord } from "@/lib/parties";

export function usePartyFigures() {
  const s = useStore();
  const parties = useMemo(
    () =>
      buildParties({
        customers: s.customers, suppliers: s.suppliers, contacts: s.contacts, deals: s.deals,
        pricingRecords: s.pricingRecords, requirements: s.requirements, communications: s.communications,
      }),
    [s.customers, s.suppliers, s.contacts, s.deals, s.pricingRecords, s.requirements, s.communications],
  );
  return useMemo(() => (recordId: string) => figuresForRecord(recordId, parties, s.deals), [parties, s.deals]);
}
