import { describe, expect, it } from "vitest";
import {
  EMPTY_SENDING, addSuppression, removeSuppression, isSuppressed, applySuppression, parseEmailList,
  buildUnsubscribeUrl, parseUnsubscribeToken, withUnsubscribe, hasUnsubscribeField, listUnsubscribeHeaders,
  validateSending, dnsChecklist, sendGate, sendingReady, fromAddress, ZOHO_BULK_LIMIT,
} from "./campaignCompliance";

const ready = () => ({
  ...EMPTY_SENDING, provider: "brevo" as const, postalAddress: "1 Example St, London",
  confirmed: { spf: true, dkim: true, dmarc: true, returnPath: true },
});

describe("suppression list", () => {
  it("adds once, normalises the address, and keeps the first reason", () => {
    let l = addSuppression([], "Jo <JO@Acme.com>", "unsubscribed");
    l = addSuppression(l, "jo@acme.com", "bounced");
    expect(l).toHaveLength(1);
    expect(l[0].reason).toBe("unsubscribed");
    expect(isSuppressed(l, "JO@acme.com")).toBe(true);
  });
  it("ignores things that are not addresses, and can remove", () => {
    expect(addSuppression([], "nonsense", "manual")).toHaveLength(0);
    const l = addSuppression([], "a@b.co", "manual");
    expect(removeSuppression(l, "A@B.co")).toHaveLength(0);
  });
  it("holds back suppressed recipients and mails duplicates once", () => {
    const l = addSuppression([], "gone@x.com", "unsubscribed");
    const r = applySuppression([{ email: "ok@x.com" }, { email: "GONE@x.com" }, { email: "ok@x.com" }], l);
    expect(r.allowed).toHaveLength(1);
    expect(r.held).toHaveLength(1);
    expect(r.held[0].reason).toBe("unsubscribed");
  });
  it("parses a pasted list", () => {
    expect(parseEmailList("a@b.co, c@d.io\nbad; A@B.co")).toEqual(["a@b.co", "c@d.io"]);
  });
});

describe("unsubscribe link", () => {
  it("round-trips through the token", () => {
    const url = buildUnsubscribeUrl("https://news.thefilmlocation.com/unsubscribe/", "Jo@Acme.com", "cp_1");
    expect(url.startsWith("https://news.thefilmlocation.com/unsubscribe?t=")).toBe(true);
    expect(parseUnsubscribeToken(url)).toEqual({ email: "jo@acme.com", campaignId: "cp_1" });
  });
  it("rejects a bad token", () => {
    expect(parseUnsubscribeToken("https://x.com/u?t=%%%")).toBeNull();
    expect(parseUnsubscribeToken("https://x.com/u")).toBeNull();
  });
  it("always ends up with a link: merge field is filled, otherwise a footer is added", () => {
    const a = withUnsubscribe("Hi\n{{unsubscribe_url}}", "https://u/1");
    expect(a).toContain("https://u/1");
    expect(a).not.toContain("{{");
    const b = withUnsubscribe("Hi there", "https://u/2", "1 Example St");
    expect(b).toContain("Unsubscribe: https://u/2");
    expect(b).toContain("1 Example St");
    expect(hasUnsubscribeField("x {{ unsubscribe_url }}")).toBe(true);
  });
  it("sets one-click headers", () => {
    const h = listUnsubscribeHeaders("https://u/1", "u@news.thefilmlocation.com");
    expect(h["List-Unsubscribe"]).toContain("<https://u/1>");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("sending set-up", () => {
  it("needs a provider, a subdomain (not the main domain), a postal address and https", () => {
    const fields = validateSending(EMPTY_SENDING).map((i) => i.field);
    expect(fields).toContain("provider");
    expect(fields).toContain("postalAddress");
    expect(validateSending({ ...ready(), subdomain: "example.com" }).map((i) => i.field)).toContain("subdomain");
    expect(validateSending({ ...ready(), unsubscribeBaseUrl: "http://x" }).map((i) => i.field)).toContain("unsubscribeBaseUrl");
    expect(validateSending(ready())).toHaveLength(0);
  });
  it("lists four DNS records and is not ready until all are confirmed", () => {
    expect(dnsChecklist(ready())).toHaveLength(4);
    expect(sendingReady({ ...ready(), confirmed: { spf: true, dkim: false, dmarc: true, returnPath: true } })).toBe(false);
    expect(sendingReady(ready())).toBe(true);
    expect(fromAddress(ready())).toBe("The Film Location <hello@news.example.com>");
  });
  it("blocks a bulk send until the sending service is ready", () => {
    expect(sendGate(ZOHO_BULK_LIMIT + 1, EMPTY_SENDING).ok).toBe(false);
    expect(sendGate(ZOHO_BULK_LIMIT, EMPTY_SENDING).ok).toBe(true);
    expect(sendGate(ZOHO_BULK_LIMIT, EMPTY_SENDING).viaService).toBe(false);
    expect(sendGate(500, ready()).ok).toBe(true);
    expect(sendGate(500, ready()).viaService).toBe(true);
    expect(sendGate(0, ready()).ok).toBe(false);
  });
});
