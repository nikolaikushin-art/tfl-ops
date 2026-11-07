import { describe, it, expect } from "vitest";
import { dealDocName, dealFolder, missingDealDocs, warehouseTermsFor, warehouseParties, partyForRecord } from "./dealFolder";
import type { Document } from "./domain";
import type { Party } from "./parties";

const doc = (o: Partial<Document>) => ({ id: "x", name: "n", type: "other", createdAt: "2026-10-01", ...o }) as Document;
const wh = { key: "k", name: "Rotterdam Hub", roles: ["warehouse"], recordIds: ["w2"],
  profile: { warehouse: { escrowFeePct: 0.35, escrowFeeFlat: 100, releaseTerms: "5 days", releaseDays: 5 } } } as unknown as Party;
const trader = { key: "t", name: "T", roles: ["trader"], recordIds: ["s9"], profile: {} } as unknown as Party;

describe("deal folder", () => {
  it("names files in the agreed pattern", () => {
    expect(dealDocName({ date: "2026-10-04T10:00:00Z", tag: "pre_advice", counterparty: "Rotterdam Hub", dealRef: "RG-2026-011" }))
      .toBe("2026-10-04 – Pre-advice – Rotterdam Hub – RG-2026-011");
  });
  it("shows only this deal's documents, oldest first", () => {
    const docs = [doc({ id: "a", dealId: "d1", createdAt: "2026-10-03" }), doc({ id: "b", dealId: "d2" }), doc({ id: "c", dealId: "d1", createdAt: "2026-10-01" })];
    expect(dealFolder("d1", docs).map((d) => d.id)).toEqual(["c", "a"]);
  });
  it("lists missing core documents, and skips escrow ones without a warehouse", () => {
    const withWh = missingDealDocs({ warehouseId: "w2" }, [doc({ docTag: "contract" })]).map((t) => t.tag);
    expect(withWh).toContain("escrow_statement");
    expect(withWh).not.toContain("contract");
    const noWh = missingDealDocs({}, []).map((t) => t.tag);
    expect(noWh).not.toContain("escrow_statement");
    expect(noWh).not.toContain("release_note");
  });
});

describe("warehouse from Contacts", () => {
  it("only Warehouse-role contacts are offered", () => {
    expect(warehouseParties([wh, trader])).toEqual([wh]);
  });
  it("finds the contact behind a deal's warehouseId", () => {
    expect(partyForRecord([wh, trader], "w2")?.name).toBe("Rotterdam Hub");
    expect(partyForRecord([wh], undefined)).toBeUndefined();
  });
  it("pulls escrow fee and release terms through for the deal size", () => {
    const t = warehouseTermsFor(wh, 100000);
    expect(t.escrowFees).toBe(450); // 0.35% of 100,000 + 100 flat
    expect(t.releaseDays).toBe(5);
    expect(t.hasTerms).toBe(true);
    expect(warehouseTermsFor(trader, 100000).hasTerms).toBe(false);
  });
});
