/**
 * Residency data in browser storage, keyed by the signed-in user so it is never
 * shared with another login. Only an Administrator ever loads it.
 * (The server build stores it in a private table only Roni can read.)
 */
import { useCallback, useEffect, useState } from "react";
import { loadValue, saveValue } from "@/lib/storage";
import { EMPTY_RESIDENCY, type ResidencyData } from "@/lib/residency";

const EVT = "tfl:residency";
const keyFor = (userId: string) => `residency.${userId}`;

export function readResidency(userId?: string): ResidencyData {
  if (!userId) return EMPTY_RESIDENCY;
  return { ...EMPTY_RESIDENCY, ...(loadValue<ResidencyData>(keyFor(userId)) ?? {}) };
}

export function useResidency(userId?: string, enabled = true) {
  const [data, setData] = useState<ResidencyData>(() => (enabled ? readResidency(userId) : EMPTY_RESIDENCY));
  useEffect(() => {
    if (!enabled) return;
    const on = () => setData(readResidency(userId));
    on();
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, [userId, enabled]);
  const save = useCallback(
    (next: ResidencyData) => {
      if (!userId || !enabled) return;
      saveValue(keyFor(userId), next);
      window.dispatchEvent(new Event(EVT));
    },
    [userId, enabled],
  );
  return { data, save };
}
