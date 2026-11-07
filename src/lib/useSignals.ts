/**
 * One place that turns the live store into signals.
 *
 * The top-bar indicator, the dashboard strip and the Signals page all read
 * from this hook, so they cannot disagree about how many things need doing —
 * which is exactly what happens when three surfaces each count for themselves.
 */
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { buildSignals, SEVERITY_ORDER, type Signal } from "@/lib/signals";
import { buildTradeNotifications } from "@/lib/notifications";
import { cashNotifications } from "@/lib/cashflow";
import { residencyNotifications } from "@/lib/residency";
import { useCashSettings } from "@/lib/useCashSettings";
import { useResidency } from "@/lib/useResidency";
import { useNotificationPrefs, type NotificationPrefs } from "@/lib/platformPrefs";

/** Which notification preference switches a signal off (matched on id prefix). */
const PREF_BY_PREFIX: [string, keyof NotificationPrefs][] = [
  ["deal-escrow", "escrowAlerts"], ["deal-deposit", "escrowAlerts"], ["deal-released", "escrowAlerts"],
  ["kyc", "kycAlerts"], ["kycorder", "kycAlerts"],
  ["offer-expiry", "priceExpiry"], ["expiring:", "priceExpiry"],
  ["follow-up", "followUps"], ["followup:", "followUps"],
  ["request-match", "newRequests"], ["offer-matches", "newRequests"],
  ["fulfilment:", "lowStock"],
];
export const signalAllowed = (id: string, prefs: NotificationPrefs): boolean => {
  const hit = PREF_BY_PREFIX.find(([p]) => id === p || id.startsWith(p));
  return hit ? prefs[hit[1]] !== false : true;
};

export function useLiveSignals(): Signal[] {
  const store = useStore();
  // Live subscriptions, so editing cash settings or residency updates the bell at once.
  const { settings: cashSettings } = useCashSettings();
  const [notifPrefs] = useNotificationPrefs();
  const isAdmin = store.user?.role === "administrator";
  const { data: residency } = useResidency(store.user?.id, isAdmin);
  return useMemo(() => {
    const trade = buildTradeNotifications({
      deals: store.deals,
      customers: store.customers,
      suppliers: store.suppliers,
      contacts: store.contacts,
      kycRecords: store.kycRecords,
      pricingRecords: store.pricingRecords,
      requirements: store.requirements,
      products: store.products,
      quotations: store.quotations,
    });
    const merged = [
      ...buildSignals({
        customers: store.customers,
        suppliers: store.suppliers,
        products: store.products,
        invoices: store.invoices,
        orders: store.orders,
        quotations: store.quotations,
        deliveries: store.deliveries,
        payments: store.payments,
        pricingRecords: store.pricingRecords,
        kycRecords: store.kycRecords,
        documents: store.documents,
        communications: store.communications,
        contacts: store.contacts,
        ownDomains: [],
        fx: store.fx,
        reportingCurrency: store.fx.base,
        marginFloorPct: store.productSettings.lowMarginThresholdPct,
        documentExpiryWarningDays: store.crmSettings.documentExpiryWarningDays,
        followUpReminderDays: store.crmSettings.followUpReminderDays,
      }),
      ...trade,
      ...cashNotifications({ deals: store.deals, expenses: store.expenses, settings: cashSettings, now: new Date().toISOString().slice(0, 10) }),
      // Residency is private: only the Administrator ever sees these.
      ...(isAdmin ? residencyNotifications(residency, new Date().toISOString().slice(0, 10)) : []),
    ]
      .filter((signal) => {
        if (store.dismissedSignals.includes(signal.id)) return false;
        if (!signalAllowed(signal.id, notifPrefs)) return false;
        const until = store.snoozedSignals?.[signal.id];
        return !(until && new Date(until).getTime() > Date.now());
      })
      .sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
          b.weight - a.weight,
      );
    return merged;
  }, [store, cashSettings, residency, isAdmin, notifPrefs]);
}
