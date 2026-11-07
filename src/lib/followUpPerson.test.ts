import { describe, expect, it } from "vitest";
import { buildTradeNotifications } from "./notifications";
import type { Customer, Supplier } from "./domain";

const seedData = {
  customers: [{ id: "c1", name: "Pinewood Productions" }] as unknown as Customer[],
  suppliers: [] as Supplier[],
};

const base = {
  deals: [], customers: seedData.customers, suppliers: seedData.suppliers, kycRecords: [],
  pricingRecords: [], requirements: [], now: Date.parse("2026-10-06T10:00:00Z"),
};
const person = (over: object) => ({
  id: "ct_x", firstName: "Anna", lastName: "Berg", isPrimary: false, customerId: seedData.customers[0].id,
  createdAt: "2026-01-01", updatedAt: "2026-01-01", ...over,
});

describe("follow-up per person", () => {
  it("raises a notification for a person whose own follow-up date has arrived", () => {
    const out = buildTradeNotifications({ ...base, contacts: [person({ followUpDate: "2026-10-05", followUpNote: "Ask about Q4" })] });
    const n = out.find((x) => x.id === "follow-up-person:ct_x");
    expect(n?.title).toContain("Anna Berg");
    expect(n?.title).toContain(seedData.customers[0].name);
    expect(n?.detail).toBe("Ask about Q4");
    expect(n?.recordId).toBe(seedData.customers[0].id);
  });
  it("stays quiet for a future date or no date", () => {
    const out = buildTradeNotifications({ ...base, contacts: [person({ followUpDate: "2026-12-01" }), person({ id: "ct_y" })] });
    expect(out.some((x) => x.id.startsWith("follow-up-person:"))).toBe(false);
  });
});
