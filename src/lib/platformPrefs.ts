/** Platform + notification preferences (ported from unique-ops Preferences / Notifications panels). */
import { useCallback, useEffect, useState } from "react";
import { loadValue, saveValue } from "@/lib/storage";

export interface PlatformPrefs {
  companyName: string;
  timezone: string;
  currency: string;
  language: string;
  dateFormat: "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd";
}
export const PLATFORM_DEFAULTS: PlatformPrefs = {
  companyName: "The Film Location",
  timezone: "Europe/London",
  currency: "GBP",
  language: "en",
  dateFormat: "dd/mm/yyyy",
};

export interface NotificationPrefs {
  emailInvoices: boolean;
  emailQuotations: boolean;
  priceExpiry: boolean;
  lowStock: boolean;
  followUps: boolean;
  newRequests: boolean;
  kycAlerts: boolean;
  escrowAlerts: boolean;
}
export const NOTIFICATION_DEFAULTS: NotificationPrefs = {
  emailInvoices: true,
  emailQuotations: true,
  priceExpiry: true,
  lowStock: true,
  followUps: true,
  newRequests: true,
  kycAlerts: true,
  escrowAlerts: true,
};

function usePref<T extends object>(name: string, defaults: T) {
  const [value, setValue] = useState<T>(() => ({ ...defaults, ...(loadValue<Partial<T>>(name) ?? {}) }));
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === `tfl.${name}`) setValue({ ...defaults, ...(loadValue<Partial<T>>(name) ?? {}) });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  const save = useCallback((next: T) => { saveValue(name, next); setValue(next); }, [name]);
  return [value, save] as const;
}

export const usePlatformPrefs = () => usePref<PlatformPrefs>("prefs.platform", PLATFORM_DEFAULTS);
export const useNotificationPrefs = () => usePref<NotificationPrefs>("prefs.notifications", NOTIFICATION_DEFAULTS);
export const readNotificationPrefs = (): NotificationPrefs => ({ ...NOTIFICATION_DEFAULTS, ...(loadValue<Partial<NotificationPrefs>>("prefs.notifications") ?? {}) });
