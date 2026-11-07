import { describe, expect, it } from "vitest";
import {
  EMPTY_RULES, triageMessage, acceptSender, ignoreSender, blockNotBusiness, restoreSender,
  isAutomatedSender, dropDuplicates, defaultSendFrom, normaliseAddress, domainOf,
} from "./senders";

const ctx = (over = {}) => ({ knownEmails: ["buyer@acme-drinks.com", "Jo <jo@gmail.com>"], rules: EMPTY_RULES, ...over });
const msg = (from: string, extra: Record<string, unknown> = {}) => ({ isReceived: true, from, subject: "Offer", body: "hello", ...extra });

describe("inbound email triage", () => {
  it("files mail from a known address, and from a colleague at a known company", () => {
    expect(triageMessage(msg("Buyer <buyer@acme-drinks.com>"), ctx()).action).toBe("file");
    expect(triageMessage(msg("ops@acme-drinks.com"), ctx()).reason).toBe("known_contact");
  });
  it("a known gmail address does not make every gmail sender known", () => {
    expect(triageMessage(msg("jo@gmail.com"), ctx()).action).toBe("file");
    expect(triageMessage(msg("stranger@gmail.com"), ctx()).action).toBe("new_sender");
  });
  it("unknown senders go to the New senders queue", () => {
    const r = triageMessage(msg("trader@newco.fr"), ctx());
    expect(r.action).toBe("new_sender");
  });
  it("junk folder is ignored completely, even for a known sender", () => {
    expect(triageMessage(msg("buyer@acme-drinks.com", { junk: true }), ctx()).action).toBe("ignore");
  });
  it("no-reply, newsletters and automated mail are left out", () => {
    expect(isAutomatedSender("no-reply@shop.com")).toBe(true);
    expect(isAutomatedSender("Mailer-Daemon@x.com")).toBe(true);
    expect(isAutomatedSender("sales@shop.com", "Our newsletter")).toBe(true);
    expect(isAutomatedSender("sales@shop.com", "Whisky offer 12x70cl")).toBe(false);
    expect(triageMessage(msg("noreply@bank.com"), ctx()).reason).toBe("automated");
  });
  it("a known contact's automated-looking address is still filed (known beats automated)", () => {
    expect(triageMessage(msg("notifications@acme-drinks.com"), ctx()).action).toBe("file");
  });
  it("accept moves a sender into the filed set; ignore keeps it out", () => {
    let r = acceptSender(EMPTY_RULES, "Trader <trader@newco.fr>");
    expect(triageMessage(msg("trader@newco.fr"), ctx({ rules: r })).action).toBe("file");
    r = ignoreSender(r, "trader@newco.fr");
    expect(triageMessage(msg("trader@newco.fr"), ctx({ rules: r })).action).toBe("ignore");
  });
  it("Not business blocks a sender or a whole domain for good, and can be undone", () => {
    const bySender = blockNotBusiness(EMPTY_RULES, "x@spam.io", "sender");
    expect(triageMessage(msg("x@spam.io"), ctx({ rules: bySender })).reason).toBe("blocked_sender");
    expect(triageMessage(msg("y@spam.io"), ctx({ rules: bySender })).action).toBe("new_sender");
    const byDomain = blockNotBusiness(EMPTY_RULES, "x@spam.io", "domain");
    expect(triageMessage(msg("y@spam.io"), ctx({ rules: byDomain })).reason).toBe("blocked_domain");
    expect(triageMessage(msg("y@spam.io"), ctx({ rules: restoreSender(byDomain, "x@spam.io") })).action).toBe("new_sender");
  });
  it("never blocks a whole free-mail domain", () => {
    const r = blockNotBusiness(EMPTY_RULES, "x@gmail.com", "domain");
    expect(r.blockedDomains).toHaveLength(0);
    expect(r.blockedSenders).toContain("x@gmail.com");
  });
  it("blocked beats known only for blocked, never for our own sent mail", () => {
    const r = blockNotBusiness(EMPTY_RULES, "buyer@acme-drinks.com", "sender");
    expect(triageMessage(msg("buyer@acme-drinks.com"), ctx({ rules: r })).action).toBe("ignore");
    expect(triageMessage({ isReceived: false, from: "me@x.com" } as never, ctx({ rules: r })).action).toBe("file");
  });
  it("same message through two mailboxes is stored once", () => {
    const a = { from: "a@b.com", to: "x@thefilmlocation.com", subject: "Hi", body: "Same body", occurredAt: "2026-10-01T10:00:10Z" };
    const b = { ...a, to: "y@thefilmlocation.com", occurredAt: "2026-10-01T10:00:40Z" };
    expect(dropDuplicates([a, b, { ...a, subject: "Other" }])).toHaveLength(2);
  });
  it("replies default to the mailbox the message arrived on", () => {
    const boxes = ["roni@thefilmlocation.com", "deals@thefilmlocation.com"];
    expect(defaultSendFrom({ mailbox: "Deals@thefilmlocation.com" }, boxes)).toBe("deals@thefilmlocation.com");
    expect(defaultSendFrom({ to: "x@y.com, deals@thefilmlocation.com" }, boxes)).toBe("deals@thefilmlocation.com");
    expect(defaultSendFrom(undefined, boxes)).toBe("roni@thefilmlocation.com");
    expect(defaultSendFrom(undefined, [])).toBe("");
  });
  it("normalises addresses", () => {
    expect(normaliseAddress("Jo Bloggs <Jo@Example.COM>")).toBe("jo@example.com");
    expect(domainOf("Jo <jo@Example.com>")).toBe("example.com");
  });
});
