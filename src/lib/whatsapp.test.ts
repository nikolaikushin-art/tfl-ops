import { describe, expect, it } from "vitest";
import { buildChats, initialsOf, tickStateFor } from "./whatsapp";
import type { Communication } from "./domain";

let seq = 0;
const msg = (over: Partial<Communication> = {}): Communication => {
  seq += 1;
  return {
    id: `m${seq}`,
    channel: "whatsapp",
    direction: "outbound",
    body: "hi",
    isReceived: false,
    occurredAt: "2026-02-01T00:00:00Z",
    createdAt: "2026-02-01T00:00:00Z",
    ...over,
  };
};

const nameFor = (m: Communication) => ({
  name: m.customerId ? "Known Customer" : m.from || m.to || "Unknown",
  subtitle: m.customerId ? "Customer" : "",
  phone: m.from || m.to || "",
});

describe("buildChats", () => {
  it("groups messages by account id, not by raw phone number, when both are matched", () => {
    const messages = [
      msg({ customerId: "c1", from: "+447700111111", isReceived: true, occurredAt: "2026-01-01T00:00:00Z" }),
      // Same customer, different number (e.g. a second contact) — should still collapse.
      msg({ customerId: "c1", from: "+447700222222", isReceived: true, occurredAt: "2026-01-02T00:00:00Z" }),
    ];
    const chats = buildChats(messages, nameFor);
    expect(chats).toHaveLength(1);
    expect(chats[0].messages).toHaveLength(2);
  });

  it("falls back to the raw counterparty number when no account is matched", () => {
    const messages = [
      msg({ from: "+447700333333", isReceived: true }),
      msg({ from: "+447700444444", isReceived: true }),
    ];
    const chats = buildChats(messages, nameFor);
    expect(chats).toHaveLength(2);
  });

  it("orders messages within a chat oldest to newest, and returns chats newest-first", () => {
    const messages = [
      msg({ customerId: "c1", occurredAt: "2026-01-10T00:00:00Z" }),
      msg({ customerId: "c1", occurredAt: "2026-01-05T00:00:00Z" }),
      msg({ customerId: "c2", occurredAt: "2026-01-20T00:00:00Z" }),
    ];
    const chats = buildChats(messages, nameFor);
    expect(chats[0].customerId).toBe("c2"); // most recent chat first
    expect(chats[1].messages.map((m) => m.occurredAt)).toEqual([
      "2026-01-05T00:00:00Z",
      "2026-01-10T00:00:00Z",
    ]);
  });

  it("counts unread as received-and-unread only — sent messages are never unread", () => {
    const messages = [
      msg({ customerId: "c1", isReceived: true, isRead: false, occurredAt: "2026-01-01T00:00:00Z" }),
      msg({ customerId: "c1", isReceived: true, isRead: true, occurredAt: "2026-01-02T00:00:00Z" }),
      msg({ customerId: "c1", isReceived: false, isRead: false, occurredAt: "2026-01-03T00:00:00Z" }),
    ];
    const [chat] = buildChats(messages, nameFor);
    expect(chat.unread).toBe(1);
  });

  it("flags starred/flagged at the chat level if any message in the thread carries it", () => {
    const messages = [
      msg({ customerId: "c1", isStarred: false, occurredAt: "2026-01-01T00:00:00Z" }),
      msg({ customerId: "c1", isStarred: true, isFlagged: true, occurredAt: "2026-01-02T00:00:00Z" }),
    ];
    const [chat] = buildChats(messages, nameFor);
    expect(chat.starred).toBe(true);
    expect(chat.flagged).toBe(true);
  });

  it("returns an empty list for no messages", () => {
    expect(buildChats([], nameFor)).toHaveLength(0);
  });
});

describe("tickStateFor", () => {
  it("is pending for anything still in drafts, regardless of the read flag", () => {
    expect(tickStateFor(msg({ folder: "drafts", isRead: true }))).toBe("pending");
  });

  it("is read once the recipient has read it", () => {
    expect(tickStateFor(msg({ folder: "sent", isRead: true }))).toBe("read");
  });

  it("is delivered — not read — for anything sent but not yet confirmed read", () => {
    // Deliberately conservative: no delivery webhook exists, so "delivered" is
    // the floor once a message has left drafts, never upgraded to "read" on a guess.
    expect(tickStateFor(msg({ folder: "sent", isRead: false }))).toBe("delivered");
    expect(tickStateFor(msg({ folder: undefined, isRead: false }))).toBe("delivered");
  });
});

describe("initialsOf", () => {
  it("uses the last two digits for a bare phone number", () => {
    expect(initialsOf("+44 7700 900123")).toBe("23");
  });

  it("uses first letters of the first two words for a name", () => {
    expect(initialsOf("Roni Ornadel")).toBe("RO");
  });

  it("falls back to '?' for an empty value", () => {
    expect(initialsOf("")).toBe("?");
  });
});
