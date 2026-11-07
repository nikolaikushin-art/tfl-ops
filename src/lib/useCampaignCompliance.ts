/**
 * Suppression list + sending set-up, kept in browser storage (demo) and shared
 * between Campaigns and Settings through one event. The server build moves both
 * into the database.
 */
import { useCallback, useEffect, useState } from "react";
import { loadValue, saveValue } from "@/lib/storage";
import { EMPTY_SENDING, type SendingConfig, type SuppressionEntry } from "@/lib/campaignCompliance";

export const SUPPRESSION_KEY = "campaigns.suppression";
export const SENDING_KEY = "campaigns.sending";
const EVT = "tfl:campaign-compliance";

export function readCompliance() {
  return {
    suppression: loadValue<SuppressionEntry[]>(SUPPRESSION_KEY) ?? [],
    sending: { ...EMPTY_SENDING, ...(loadValue<SendingConfig>(SENDING_KEY) ?? {}) } as SendingConfig,
  };
}

export function writeSuppression(next: SuppressionEntry[]) {
  saveValue(SUPPRESSION_KEY, next);
  window.dispatchEvent(new Event(EVT));
}

export function useCampaignCompliance() {
  const [snap, setSnap] = useState(readCompliance);
  useEffect(() => {
    const on = () => setSnap(readCompliance());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const setSuppression = useCallback((next: SuppressionEntry[]) => writeSuppression(next), []);
  const setSending = useCallback((next: SendingConfig) => {
    saveValue(SENDING_KEY, next);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { suppression: snap.suppression, sending: snap.sending, setSuppression, setSending };
}
