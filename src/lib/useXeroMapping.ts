import { useCallback, useEffect, useState } from "react";
import { loadValue, saveValue } from "@/lib/storage";
import { EMPTY_MAPPING, type XeroMapping } from "@/lib/xeroMapping";

const KEY = "xero.mapping";
const EVT = "tfl:xeromapping";
const read = (): XeroMapping => ({ ...EMPTY_MAPPING, ...(loadValue<XeroMapping>(KEY) ?? {}) });

/** Xero account mapping, kept in browser storage until the server build. */
export function useXeroMapping() {
  const [mapping, setState] = useState<XeroMapping>(read);
  useEffect(() => {
    const on = () => setState(read());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const setMapping = useCallback((next: XeroMapping) => {
    saveValue(KEY, next);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { mapping, setMapping };
}
