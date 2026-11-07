/**
 * Own stock (v29): goods held in a bonded warehouse under TFL's name.
 * Occasional (usually when a deal went wrong). One lot = one product, one warehouse,
 * one duty status (T1/T2). There is no duty-paid state, and no low-stock or reorder alert.
 */
import type { Deal, DutyStatus } from "./domain";

export type StockStatus = "available" | "reserved" | "sold";

export interface StockLot {
  id: string;
  /** Warehouse = a Contact with the Warehouse role. */
  warehouseId: string;
  productId?: string;
  productName: string;
  quantity: number; // cases still held (never negative)
  unit: string;
  dutyStatus: DutyStatus;
  dateIn: string; // ISO date
  /** The purchase deal it came from. */
  sourceDealId?: string;
  costPerUnit: number;
  currency: string;
  /** Storage charged per unit per month, in the lot's currency (optional). */
  storagePerUnitMonth?: number;
  /** Reserved against a deal, if any (quantity set aside). */
  reservedQty: number;
  reservedForDealId?: string;
  /** Deals that have already taken stock from this lot (so a sale is only deducted once). */
  soldTo: { dealId: string; qty: number }[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  available: "Available", reserved: "Reserved", sold: "Sold",
};

export function lotStatus(l: StockLot): StockStatus {
  if (l.quantity <= 0) return "sold";
  if (l.reservedQty > 0) return "reserved";
  return "available";
}

export const availableQty = (l: StockLot) => Math.max(0, l.quantity - l.reservedQty);

/** Whole months held (minimum 1 once stored), counted from the date in. */
export function monthsHeld(l: StockLot, nowIso: string): number {
  const a = new Date(l.dateIn), b = new Date(nowIso);
  if (isNaN(a.getTime()) || b < a) return 0;
  const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1);
  return Math.max(1, m);
}

/** Storage charges built up so far on what is still held. */
export function storageCharges(l: StockLot, nowIso: string): number {
  if (!l.storagePerUnitMonth || l.quantity <= 0) return 0;
  return Math.round(l.quantity * l.storagePerUnitMonth * monthsHeld(l, nowIso) * 100) / 100;
}

export const stockValue = (l: StockLot) => Math.round(l.quantity * l.costPerUnit * 100) / 100;

/** Held value per currency — never added across currencies. */
export function valueByCurrency(lots: StockLot[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lots) if (l.quantity > 0) out[l.currency] = Math.round(((out[l.currency] ?? 0) + stockValue(l)) * 100) / 100;
  return out;
}

export function validateLot(l: Partial<StockLot>): string[] {
  const e: string[] = [];
  if (!l.warehouseId) e.push("Choose the warehouse (a contact with the Warehouse role).");
  if (!l.productName?.trim()) e.push("Product is required.");
  if (!(Number(l.quantity) > 0)) e.push("Quantity must be more than zero.");
  if (l.dutyStatus !== "T1" && l.dutyStatus !== "T2") e.push("Duty status must be T1 or T2.");
  if (!l.dateIn) e.push("Date in is required.");
  if (!(Number(l.costPerUnit) >= 0)) e.push("Cost must be zero or more.");
  if (!l.currency?.trim()) e.push("Currency is required.");
  return e;
}

/**
 * Take stock for a sale. Works on one lot; refuses to go below zero and never
 * deducts the same deal twice. Reserved stock for that same deal is released first.
 */
export function deductFromLot(lot: StockLot, dealId: string, qty: number, nowIso: string): { lot: StockLot; ok: boolean; reason?: string } {
  if (lot.soldTo.some((s) => s.dealId === dealId)) return { lot, ok: false, reason: "already deducted for this deal" };
  if (!(qty > 0)) return { lot, ok: false, reason: "quantity must be more than zero" };
  const own = lot.reservedForDealId === dealId ? lot.reservedQty : 0;
  if (qty > availableQty(lot) + own) return { lot, ok: false, reason: `only ${availableQty(lot) + own} available` };
  const reservedQty = lot.reservedForDealId === dealId ? 0 : lot.reservedQty;
  return {
    ok: true,
    lot: {
      ...lot, quantity: lot.quantity - qty, reservedQty,
      reservedForDealId: reservedQty > 0 ? lot.reservedForDealId : undefined,
      soldTo: [...lot.soldTo, { dealId, qty }], updatedAt: nowIso,
    },
  };
}

/** Put a deal's goods back (deal cancelled / mistake). Only reverses a deduction that happened. */
export function restoreToLot(lot: StockLot, dealId: string, nowIso: string): StockLot {
  const hit = lot.soldTo.find((s) => s.dealId === dealId);
  if (!hit) return lot;
  return { ...lot, quantity: lot.quantity + hit.qty, soldTo: lot.soldTo.filter((s) => s.dealId !== dealId), updatedAt: nowIso };
}

/**
 * Set goods aside for a deal. A lot carries one reservation at a time: reserving
 * for a second, different deal is refused rather than silently overwriting the first.
 */
export function reserveLot(lot: StockLot, dealId: string, qty: number, nowIso: string): { lot: StockLot; ok: boolean; reason?: string } {
  if (lot.reservedQty > 0 && lot.reservedForDealId && lot.reservedForDealId !== dealId) {
    return { lot, ok: false, reason: "already reserved for another deal; release that first" };
  }
  if (!(qty > 0) || qty > availableQty(lot)) return { lot, ok: false, reason: `only ${availableQty(lot)} available` };
  return { ok: true, lot: { ...lot, reservedQty: lot.reservedQty + qty, reservedForDealId: dealId, updatedAt: nowIso } };
}

/** Give a reservation back to the free pool (deal fell through, or reserved by mistake). */
export function releaseReservation(lot: StockLot, nowIso: string): StockLot {
  if (lot.reservedQty <= 0 && !lot.reservedForDealId) return lot;
  return { ...lot, reservedQty: 0, reservedForDealId: undefined, updatedAt: nowIso };
}

/** Deals that take their goods from own stock, and have reached the point where the sale is real. */
export const SALE_STAGES: Deal["stage"][] = ["in_escrow", "released", "margin_received", "booked"];
export const isSaleReal = (d: Pick<Deal, "stage">) => SALE_STAGES.includes(d.stage);
