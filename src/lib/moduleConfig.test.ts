import { describe, it, expect } from "vitest";
import { allSectionsFor, defaultsFor, HUB_MEMBERS, rulesFor, ownersOf, MODULE_RULES } from "@/lib/moduleConfig";

const MODULES = ["dashboard", "reports", "contacts", "markets", "products", "requirements", "dealdesk", "warehouses", "email", "whatsapp", "campaigns", "kyc", "documents", "residency", "accounting", "cashflow"];

describe("module settings", () => {
  it("every module has settings of its own (not only the generic sections)", () => {
    for (const id of MODULES) expect(rulesFor(id).length, id).toBeGreaterThan(0);
  });

  it("every module has at least two options of its own (a start view alone is not enough)", () => {
    for (const id of MODULES) {
      const n = rulesFor(id).filter((r) => r.owner === id).reduce((a, r) => a + r.fields.length, 0);
      expect(n, id).toBeGreaterThanOrEqual(2);
    }
    // every ordering option offers more than one order
    for (const id of [...MODULES, ...Object.values(HUB_MEMBERS).flat()]) {
      for (const r of MODULE_RULES[id] ?? []) for (const f of r.fields) if (f.kind === "select") expect(f.options!.length, `${id}.${f.key}`).toBeGreaterThan(1);
    }
  });

  it("hub tabs are reachable from their hub's settings screen", () => {
    expect(rulesFor("dealdesk").map((r) => r.owner)).toEqual(expect.arrayContaining(["dealdesk", "orders", "invoices", "shipments", "payments"]));
    expect(rulesFor("products").map((r) => r.owner)).toEqual(expect.arrayContaining(["brands", "priceintel"]));
    expect(rulesFor("requirements").map((r) => r.owner)).toContain("quotations");
    // every tab rule that exists is listed by exactly one hub
    const listed = Object.values(HUB_MEMBERS).flat();
    for (const id of Object.keys(MODULE_RULES)) if (!MODULES.includes(id)) expect(listed, id).toContain(id);
  });

  it("no repeated options inside one settings screen", () => {
    for (const id of MODULES) {
      const keys = allSectionsFor(id).flatMap((s) => s.fields.map((f) => f.key));
      expect(new Set(keys).size, `${id} keys`).toBe(keys.length);
      const labels = [...allSectionsFor(id), ...rulesFor(id)].flatMap((s) => s.fields.filter((f) => !f.hidden).map((f) => `${s.owner ?? ""}|${f.label}`));
      expect(new Set(labels).size, `${id} labels`).toBe(labels.length);
    }
  });

  it("settings screens are unique (no shared view/notify/keys sections)", () => {
    for (const id of MODULES) {
      const ids = allSectionsFor(id).map((s) => s.id);
      expect(ids, id).not.toContain("view");
      expect(ids, id).not.toContain("sidebar");
      expect(ids, id).not.toContain("notify");
      expect(ids, id).not.toContain("keys");
      expect(ids, id).not.toContain("work");
    }
    // email still has its own mailbox rules
    expect(allSectionsFor("email").some((s) => s.id === "mailbox")).toBe(true);
  });

  it("tab owners know their own defaults", () => {
    for (const o of ownersOf("dealdesk")) expect(Object.keys(defaultsFor(o)).length).toBeGreaterThan(5);
  });
});
