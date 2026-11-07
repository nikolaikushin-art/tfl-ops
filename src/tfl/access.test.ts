import { describe, it, expect } from "vitest";
import { canViewTfl, canEditTfl, canViewSection, roleMatrix } from "./access";

const KEYS = ["locations", "owners", "productions", "enquiries", "scouting", "bookings", "quotes", "invoices", "contracts", "permits"];

describe("role access", () => {
  it("administrator and management can edit everything", () => {
    for (const r of ["administrator", "management"]) for (const k of KEYS) { expect(canViewTfl(r, k)).toBe(true); expect(canEditTfl(r, k)).toBe(true); }
  });
  it("read-only can open every module but change nothing", () => {
    for (const k of KEYS) { expect(canViewTfl("readonly", k)).toBe(true); expect(canEditTfl("readonly", k)).toBe(false); }
  });
  it("finance edits invoices; operations and sales do not", () => {
    expect(canEditTfl("finance", "invoices")).toBe(true);
    expect(canEditTfl("operations", "invoices")).toBe(false);
    expect(canEditTfl("sales", "invoices")).toBe(false);
  });
  it("operations edits locations and permits; finance only views them", () => {
    expect(canEditTfl("operations", "locations")).toBe(true);
    expect(canEditTfl("operations", "permits")).toBe(true);
    expect(canEditTfl("finance", "locations")).toBe(false);
    expect(canViewTfl("finance", "locations")).toBe(true);
  });
  it("an unknown or missing role can never edit", () => {
    expect(canEditTfl(undefined, "locations")).toBe(false);
    expect(canEditTfl("intern", "locations")).toBe(false);
  });
  it("the new modules follow the role table", () => {
    expect(canEditTfl("finance", "payments")).toBe(true);
    expect(canEditTfl("finance", "insurance")).toBe(true);
    expect(canEditTfl("operations", "assessments")).toBe(true);
    expect(canEditTfl("sales", "shortlists")).toBe(true);
    expect(canEditTfl("sales", "payments")).toBe(false);
    expect(canViewTfl("readonly", "assessments")).toBe(true);
    expect(canEditTfl("readonly", "assessments")).toBe(false);
  });
  it("registrations, incidents, neighbour notices and tasks follow the role table", () => {
    expect(canEditTfl("sales", "registrations")).toBe(true);
    expect(canEditTfl("finance", "incidents")).toBe(true);
    expect(canEditTfl("finance", "neighbours")).toBe(false);
    expect(canEditTfl("operations", "neighbours")).toBe(true);
    expect(canEditTfl("readonly", "tasks")).toBe(false);
    expect(canViewTfl("readonly", "tasks")).toBe(true);
  });
  it("Settings is for administrators and management only", () => {
    expect(canViewSection("administrator", "settings")).toBe(true);
    expect(canViewSection("management", "settings")).toBe(true);
    for (const r of ["commercial", "sales", "finance", "operations", "readonly", "assistant"]) expect(canViewSection(r, "settings")).toBe(false);
    expect(canViewSection(undefined, "settings")).toBe(true);
  });
  it("the role matrix agrees with the rules", () => {
    const m = roleMatrix(["locations", "invoices"]);
    expect(m.find((r) => r.role === "readonly")?.cells.invoices).toBe("view");
    expect(m.find((r) => r.role === "finance")?.cells.invoices).toBe("edit");
    expect(m.find((r) => r.role === "sales")?.cells.locations).toBe("edit");
  });
  it("menu follows the same rules", () => {
    expect(canViewSection("administrator", "tfl-invoices")).toBe(true);
    expect(canViewSection("dashboard" as string, "dashboard")).toBe(true);
    expect(canViewSection("readonly", "email")).toBe(true);
  });
});
