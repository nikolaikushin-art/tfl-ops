import { describe, expect, it } from "vitest";
import { parseChatExport, newMessagesOnly, WHAT_DOES_NOT_SYNC, RECOMMENDED_ROUTE } from "./whatsappSetup";

const android = `12/03/2026, 14:05 - Messages and calls are end-to-end encrypted.
12/03/2026, 14:06 - Roni: Do you have 12x70cl Johnnie Walker Black?
second line of the same message
12/03/2026, 14:09 - Marc (Acme): Yes, 2,000 cases T2
13/03/2026, 09:30 - Marc (Acme): PriceList.pdf (file attached)
31/13/2026, 09:30 - Marc (Acme): impossible date`;

const ios = `[12/03/26, 2:05:33 PM] Roni: Hello
[12/03/26, 2:06:00 PM] Marc: <attached: 00001-offer.xlsx>`;

describe("WhatsApp chat export", () => {
  it("reads Android exports, joins multi-line messages and ignores system lines", () => {
    const p = parseChatExport(android);
    expect(p.messages).toHaveLength(3);
    expect(p.messages[0].text).toContain("second line");
    expect(p.messages[0].at).toBe("2026-03-12T14:06:00");
    expect(p.participants).toEqual(["Roni", "Marc (Acme)"]);
    expect(p.isGroup).toBe(false);
    expect(p.skipped).toBe(1);
  });
  it("sees attachments", () => {
    const p = parseChatExport(android);
    expect(p.messages[2].attachment).toBe("PriceList.pdf");
  });
  it("reads iOS exports with 12-hour clock", () => {
    const p = parseChatExport(ios);
    expect(p.messages[0].at).toBe("2026-03-12T14:05:33");
    expect(p.messages[1].attachment).toBe("00001-offer.xlsx");
  });
  it("supports US-format dates", () => {
    const p = parseChatExport("03/12/2026, 14:06 - A: hi", { dayFirst: false });
    expect(p.messages[0].at).toBe("2026-03-12T14:06:00");
  });
  it("flags groups", () => {
    const p = parseChatExport("12/03/2026, 14:06 - A: x\n12/03/2026, 14:07 - B: y\n12/03/2026, 14:08 - C: z");
    expect(p.isGroup).toBe(true);
  });
  it("re-importing the same file adds nothing", () => {
    const p = parseChatExport(android).messages;
    expect(newMessagesOnly(p, p)).toHaveLength(0);
    expect(newMessagesOnly(p, p.slice(0, 1))).toHaveLength(2);
  });
});

describe("coexistence guidance", () => {
  it("states that groups do not sync and gives the route", () => {
    expect(WHAT_DOES_NOT_SYNC[0].toLowerCase()).toContain("group");
    expect(RECOMMENDED_ROUTE.length).toBeGreaterThanOrEqual(4);
  });
});
