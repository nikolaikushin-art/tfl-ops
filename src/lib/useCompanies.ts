/** Accounting companies and the one currently shown, kept in browser storage (demo). */
import { useCallback, useEffect, useState } from "react";
import { loadValue, saveValue } from "@/lib/storage";
import { PRIMARY_COMPANY_ID, withPrimary, type AccountingCompany } from "@/lib/companies";

const LIST_KEY = "accounting.companies";
const ACTIVE_KEY = "accounting.activeCompany";
const EVT = "tfl:companies";

export function useCompanies(primaryName?: string) {
  const read = () => ({
    companies: withPrimary(loadValue<AccountingCompany[]>(LIST_KEY), primaryName),
    activeId: loadValue<string>(ACTIVE_KEY) ?? PRIMARY_COMPANY_ID,
  });
  const [snap, setSnap] = useState(read);
  useEffect(() => {
    const on = () => setSnap(read());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setCompanies = useCallback((next: AccountingCompany[]) => {
    saveValue(LIST_KEY, next);
    window.dispatchEvent(new Event(EVT));
  }, []);
  const setActive = useCallback((id: string) => {
    saveValue(ACTIVE_KEY, id);
    window.dispatchEvent(new Event(EVT));
  }, []);
  const active = snap.companies.find((c) => c.id === snap.activeId) ?? snap.companies[0];
  return { companies: snap.companies, active, setCompanies, setActive };
}
