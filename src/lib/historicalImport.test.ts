import { describe, expect, it } from "vitest";
import { parseCsv } from "./offerImport";
import {
  TEMPLATES, templateCsv, mapColumns, itemsFromRows, markDuplicates, queueSummary, rolesFrom,
  toDealFields, dealBlockers, findByName, toOfferFields, splitPersonName, toPartyInput, type Known,
} from "./historicalImport";

const meta = (name = "contacts.csv", source: "spreadsheet" | "whatsapp" = "spreadsheet") => ({ source, sourceName: name, batchId: name, nowIso: "2026-10-04T00:00:00Z" });
const none: Known = { companies: [], offers: [], dealRefs: [] };

describe("templates", () => {
  it("each template reads back through its own column mapper with nothing missing", () => {
    for (const kind of ["contacts", "offers", "deals"] as const) {
      const rows = parseCsv(templateCsv(kind));
      expect(rows).toHaveLength(2);
      expect(mapColumns(kind, rows[0]).missing).toEqual([]);
      expect(rows[0]).toHaveLength(TEMPLATES[kind].length);
    }
  });
  it("accepts common alternative headers and reports missing required ones", () => {
    const m = mapColumns("contacts", ["Customer", "E-mail", "Country"]);
    expect(m.map.company).toBe(0);
    expect(m.map.email).toBe(1);
    expect(mapColumns("offers", ["Supplier", "Product"]).missing).toContain("Price");
  });
  it("a file with missing required columns produces no rows and names them", () => {
    const r = itemsFromRows("offers", parseCsv("Supplier,Product\nA,B"), meta());
    expect(r.items).toHaveLength(0);
    expect(r.missingColumns).toContain("Price");
  });
});

describe("contacts review rows", () => {
  const csv = "Company,Roles,Country,Email\nMaison Dupont SAS,buyer; trader,France,orders@dupont.fr\n,buyer,France,x@y.fr\nBad Mail Ltd,supplier,UK,not-an-email\n";
  it("flags missing and invalid fields as blocking errors", () => {
    const { items } = itemsFromRows("contacts", parseCsv(csv), meta());
    expect(items).toHaveLength(3);
    expect(items[0].errors).toEqual([]);
    expect(items[1].errors.join()).toContain("Company is missing");
    expect(items[2].errors.join()).toContain("Email");
  });
  it("parses roles, defaulting to buyer", () => {
    expect(rolesFrom("buyer; Trader")).toEqual(["buyer", "trader"]);
    expect(rolesFrom("")).toEqual(["buyer"]);
  });
  it("catches duplicates of held companies, ignoring legal suffixes and case", () => {
    const { items } = itemsFromRows("contacts", parseCsv("Company,Country,Email\nMAISON DUPONT,France,\n"), meta());
    const known = { ...none, companies: [{ name: "Maison Dupont SAS", country: "France" }] };
    expect(markDuplicates(items, known)[0].duplicateOf).toContain("directory");
  });
  it("catches the same company arriving from two sources, keeping the first clean", () => {
    const a = itemsFromRows("contacts", parseCsv("Company,Country,Email\nAcme Drinks Ltd,UK,buy@acme.com\n"), meta("sheet.csv")).items;
    const b = itemsFromRows("contacts", parseCsv("Company,Country,Email\nOther Name,Spain,BUY@acme.com\n"), meta("chat.csv", "whatsapp")).items;
    const out = markDuplicates([...a, ...b], none);
    expect(out[0].duplicateOf).toBeUndefined();
    expect(out[1].duplicateOf).toContain("sheet.csv");
  });
  it("a rejected row never blocks the next copy", () => {
    const a = itemsFromRows("contacts", parseCsv("Company,Country\nAcme,UK\nAcme,UK\n"), meta()).items;
    a[0] = { ...a[0], status: "rejected" };
    expect(markDuplicates(a, none)[1].duplicateOf).toBeUndefined();
  });
  it("queue summary counts what can be approved", () => {
    const { items } = itemsFromRows("contacts", parseCsv(csv), meta());
    const s = queueSummary(markDuplicates(items, none));
    expect(s.pending).toBe(3);
    expect(s.ready).toBe(1);
    expect(s.errors).toBe(2);
  });
});

describe("offers", () => {
  it("rejects 'duty paid' style values: only T1/T2 exist", () => {
    const { items } = itemsFromRows("offers", parseCsv("Supplier,Product,Price,T1/T2\nA,Vodka,10,duty paid\nA,Gin,11,T1\n"), meta("o.csv"));
    expect(items[0].errors.join()).toContain("T1 or T2");
    expect(items[1].errors).toEqual([]);
    expect(toOfferFields(items[1].data).dutyStatus).toBe("T1");
  });
  it("detects an offer we already hold, and reads incoterm and place", () => {
    const { items } = itemsFromRows("offers", parseCsv("Supplier,Product,Price,Currency,Incoterm\nSpirits Trading BV,Vodka 12x70cl,10,EUR,FCA Rotterdam\n"), meta("o.csv"));
    const known = { ...none, offers: [{ supplierName: "Spirits Trading", productName: "vodka 12x70cl", unitPrice: 10, currency: "eur" }] };
    expect(markDuplicates(items, known)[0].duplicateOf).toBeTruthy();
    const f = toOfferFields(items[0].data);
    expect(f.incoterm).toBe("FCA");
    expect(f.incotermPlace).toBe("Rotterdam");
  });
});

describe("past deals", () => {
  const head = "Deal ref,Client,Supplier,Product,Currency,Sale price (total),Purchase price (total),Escrow / warehouse fees,Bank charges,Net margin received";
  it("warns when the margin does not add up", () => {
    const { items } = itemsFromRows("deals", parseCsv(`${head}\nD1,A,B,Gin,EUR,100000,97000,400,60,9999\n`), meta("d.csv"));
    expect(items[0].warnings.join()).toContain("does not match");
  });
  it("a consistent margin has no warning about it", () => {
    const { items } = itemsFromRows("deals", parseCsv(`${head}\nD1,A,B,Gin,EUR,100000,97000,400,60,2540\n`), meta("d.csv"));
    expect(items[0].warnings.join()).not.toContain("does not match");
  });
  it("cannot be approved until client and supplier exist", () => {
    const { items } = itemsFromRows("deals", parseCsv(`${head}\nD1,A,B,Gin,EUR,1,1,0,0,0\n`), meta("d.csv"));
    expect(dealBlockers(items[0].data, {})).toHaveLength(2);
    expect(dealBlockers(items[0].data, { clientId: "c", supplierId: "s" })).toHaveLength(0);
    expect(findByName([{ id: "1", name: "Maison Dupont SAS" }], "maison dupont")?.id).toBe("1");
  });
  it("history is booked and reconciled by default so Xero is never posted twice", () => {
    const { items } = itemsFromRows("deals", parseCsv(`${head}\nD1,A,B,Gin,EUR,100000,97000,400,60,2540\n`), meta("d.csv"));
    const f = toDealFields(items[0].data, { clientId: "c", supplierId: "s" });
    expect(f.stage).toBe("booked");
    expect(f.xero.status).toBe("reconciled");
    expect(f.historical).toBe(true);
    expect(f.dutyStatus).toBe("T2");
  });
  it("only a deal marked 'no' for Xero is left open for posting", () => {
    const { items } = itemsFromRows("deals", parseCsv(`${head},Already in Xero (yes/no)\nD1,A,B,Gin,EUR,100000,97000,400,60,2540,no\n`), meta("d.csv"));
    const f = toDealFields(items[0].data, { clientId: "c", supplierId: "s" });
    expect(f.stage).toBe("margin_received");
    expect(f.xero.status).toBe("not_posted");
  });
  it("catches a deal ref already held", () => {
    const { items } = itemsFromRows("deals", parseCsv(`${head}\nd-1,A,B,Gin,EUR,1,1,0,0,0\n`), meta("d.csv"));
    expect(markDuplicates(items, { ...none, dealRefs: ["D-1"] })[0].duplicateOf).toContain("D-1");
  });
});

describe("contact person column", () => {
  it("splits names in both orders and ignores blanks", () => {
    expect(splitPersonName("Marc Dupont")).toEqual({ firstName: "Marc", lastName: "Dupont" });
    expect(splitPersonName("Dupont, Marc")).toEqual({ firstName: "Marc", lastName: "Dupont" });
    expect(splitPersonName("Jean Paul De la Cruz")).toEqual({ firstName: "Jean", lastName: "Paul De la Cruz" });
    expect(splitPersonName("Madonna")).toEqual({ firstName: "Madonna", lastName: "" });
    expect(splitPersonName("  ")).toBeUndefined();
  });
  it("is carried into the party input so a person is created under the company", () => {
    const i = toPartyInput({ company: "Maison Dupont", person: "Marc Dupont", roles: "buyer" });
    expect(i.person).toEqual({ firstName: "Marc", lastName: "Dupont" });
    expect(toPartyInput({ company: "X" }).person).toBeUndefined();
  });
});
