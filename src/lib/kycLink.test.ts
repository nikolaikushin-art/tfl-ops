import { describe, it, expect } from "vitest";
import {
  buildKycLink, decodeKycInvite, decodeKycSubmission, docsForRoles, encodeKycSubmission, parseKycHash, validateKycForm,
  type KycInvite, type KycFormData,
} from "./kycLink";

const invite: KycInvite = { token: "abc123def456", name: "Château Müller & Fils", roles: ["buyer"], docs: ["Certificate of incorporation"] };
const data: KycFormData = { name: "Château Müller & Fils", email: "a@b.fr", country: "France", contactName: "Zoë", declaration: true };

describe("onboarding link", () => {
  it("round-trips an invite, including accents and ampersands", () => {
    const link = buildKycLink("https://crm.example/app", invite);
    const parsed = parseKycHash(link.slice(link.indexOf("#")));
    expect(parsed?.token).toBe("abc123def456");
    expect(parsed?.invite).toEqual(invite);
  });
  it("ignores an invite whose token doesn't match the link", () => {
    const link = buildKycLink("", { ...invite, token: "zzzz" }).replace("zzzz", "abc123def456");
    expect(parseKycHash(link)?.invite).toBeNull();
  });
  it("rejects junk", () => {
    expect(parseKycHash("#/something")).toBeNull();
    expect(decodeKycInvite("not-base64!!")).toBeNull();
  });
});

describe("return code", () => {
  it("round-trips a submission", () => {
    const code = encodeKycSubmission({ token: "t1", submittedAt: "2026-10-04", data });
    expect(code.startsWith("TFL-KYC-")).toBe(true);
    expect(decodeKycSubmission(code)?.data.name).toBe("Château Müller & Fils");
  });
  it("survives line-wrapping from an email client", () => {
    const code = encodeKycSubmission({ token: "t1", submittedAt: "x", data });
    expect(decodeKycSubmission(code.replace(/(.{20})/g, "$1\n"))?.token).toBe("t1");
  });
  it("rejects a code that isn't ours or is damaged", () => {
    expect(decodeKycSubmission("hello")).toBeNull();
    expect(decodeKycSubmission("TFL-KYC-@@@")).toBeNull();
  });
});

describe("form rules", () => {
  it("asks for the essentials and the declaration", () => {
    expect(Object.keys(validateKycForm({}))).toEqual(["name", "email", "country", "contactName", "declaration"]);
    expect(validateKycForm(data)).toEqual({});
    expect(validateKycForm({ ...data, email: "nope" }).email).toBeTruthy();
  });
  it("merges document lists for a company with several roles", () => {
    const docs = docsForRoles(["buyer", "warehouse"]);
    expect(docs).toContain("Bonded warehouse authorisation");
    expect(docs.filter((d) => d === "Certificate of incorporation")).toHaveLength(1);
  });
});
