/** Cash Flow settings (opening cash, low-cash thresholds, commitments) in browser storage, shared by the screen and the notifications. */
import { useCallback, useEffect, useState } from "react";
import { loadValue, saveValue } from "@/lib/storage";
import { EMPTY_CASH, type CashSettings } from "@/lib/cashflow";

const KEY = "cash.settings";
const EVT = "tfl:cash-settings";

export function readCashSettings(): CashSettings {
  return { ...EMPTY_CASH, ...(loadValue<CashSettings>(KEY) ?? {}) };
}

export function useCashSettings() {
  const [settings, setSettings] = useState<CashSettings>(readCashSettings);
  useEffect(() => {
    const on = () => setSettings(readCashSettings());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const save = useCallback((next: CashSettings) => {
    saveValue(KEY, next);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { settings, save };
}
