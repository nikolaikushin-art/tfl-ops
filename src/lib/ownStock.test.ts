import { describe, expect, it } from "vitest";
import { lotStatus, availableQty, deductFromLot, restoreToLot, reserveLot, releaseReservation, storageCharges, monthsHeld, valueByCurrency, validateLot, isSaleReal, type StockLot } from "./ownStock";

const lot = (o: Partial<StockLot> = {}): StockLot => ({
  id: "l1", warehouseId: "w", productName: "Johnnie Walker Black 12x1L", quantity: 100, unit: "case", dutyStatus: "T1",
  dateIn: "2026-07-04", costPerUnit: 200, currency: "EUR", reservedQty: 0, soldTo: [],
  createdAt: "2026-07-04T00:00:00Z", updatedAt: "2026-07-04T00:00:00Z", ...o,
});
const NOW = "2026-10-05T00:00:00Z";

describe("own stock", () => {
  it("status follows quantity and reservation", () => {
    expect(lotStatus(lot())).toBe("available");
    expect(lotStatus(lot({ reservedQty: 10 }))).toBe("reserved");
    expect(lotStatus(lot({ quantity: 0 }))).toBe("sold");
  });
  it("a sale deducts stock and cannot be deducted twice", () => {
    const a = deductFromLot(lot(), "d1", 40, NOW);
    expect(a.ok && a.lot.quantity).toBe(60);
    const b = deductFromLot(a.lot, "d1", 40, NOW);
    expect(b.ok).toBe(false);
    expect(b.lot.quantity).toBe(60);
  });
  it("cannot sell more than is available, and not stock reserved for another deal", () => {
    expect(deductFromLot(lot({ quantity: 10 }), "d1", 11, NOW).ok).toBe(false);
    const r = reserveLot(lot(), "dX", 90, NOW).lot;
    expect(availableQty(r)).toBe(10);
    expect(deductFromLot(r, "d1", 20, NOW).ok).toBe(false);
  });
  it("selling to the deal it is reserved for releases the reservation", () => {
    const r = reserveLot(lot(), "d1", 30, NOW).lot;
    const s = deductFromLot(r, "d1", 30, NOW);
    expect(s.lot.quantity).toBe(70);
    expect(s.lot.reservedQty).toBe(0);
    expect(s.lot.reservedForDealId).toBeUndefined();
  });
  it("restoring puts the goods back once", () => {
    const s = deductFromLot(lot(), "d1", 40, NOW).lot;
    const back = restoreToLot(s, "d1", NOW);
    expect(back.quantity).toBe(100);
    expect(restoreToLot(back, "d1", NOW).quantity).toBe(100);
  });
  it("storage charges: per unit per month on what is still held", () => {
    const l = lot({ storagePerUnitMonth: 0.5 });
    expect(monthsHeld(l, NOW)).toBe(3);
    expect(storageCharges(l, NOW)).toBe(150);
    expect(storageCharges(lot(), NOW)).toBe(0);
    expect(storageCharges(lot({ storagePerUnitMonth: 0.5, quantity: 0 }), NOW)).toBe(0);
  });
  it("value is kept per currency", () => {
    expect(valueByCurrency([lot(), lot({ id: "2", currency: "USD", quantity: 10, costPerUnit: 50 }), lot({ id: "3", quantity: 0 })])).toEqual({ EUR: 20000, USD: 500 });
  });
  it("validates: T1/T2 only, warehouse and quantity needed", () => {
    expect(validateLot(lot())).toEqual([]);
    const bad = validateLot({ ...lot(), dutyStatus: "duty_paid" as never, quantity: 0, warehouseId: "" });
    expect(bad.length).toBe(3);
  });
  it("a sale is real from escrow onward, not while only agreed", () => {
    expect(isSaleReal({ stage: "agreed" })).toBe(false);
    expect(isSaleReal({ stage: "awaiting_deposit" })).toBe(false);
    expect(isSaleReal({ stage: "in_escrow" })).toBe(true);
    expect(isSaleReal({ stage: "cancelled" })).toBe(false);
  });
  it("reserving for a second deal is refused; releasing frees the stock", () => {
    const r = reserveLot(lot(), "d1", 30, NOW).lot;
    const second = reserveLot(r, "d2", 10, NOW);
    expect(second.ok).toBe(false);
    expect(second.lot.reservedForDealId).toBe("d1");
    const freed = releaseReservation(r, NOW);
    expect(freed.reservedQty).toBe(0);
    expect(freed.reservedForDealId).toBeUndefined();
    expect(lotStatus(freed)).toBe("available");
    expect(releaseReservation(freed, NOW)).toBe(freed);
  });
});
