/**
 * The Film Location CRM — WhatsApp connection guidance + chat-export parser (v26).
 *
 * Facts below were checked against Meta's developer documentation on
 * "WhatsApp Business app coexistence" (onboarding Business app users). They are
 * Meta's rules, not ours, and can change: confirm with the chosen provider
 * before relying on them.
 */

export interface GuideItem {
  title: string;
  body: string;
}

/** The recommended route, in order. */
export const RECOMMENDED_ROUTE: GuideItem[] = [
  { title: "Switch to WhatsApp Business", body: "Install WhatsApp Business on the same phone and register your current number. Chats and contacts move across — keep using the phone as usual." },
  { title: "Choose a connection provider", body: "Link through Meta via an approved provider (e.g. 360dialog or Twilio). A provider is faster and handles Meta approval for you." },
  { title: "Enable coexistence", body: "In the provider sign-up, choose Business app (coexistence), scan the QR code from the phone, and confirm in the app." },
  { title: "Share chat history", body: "When asked, choose Share. This is the only chance to import past one-to-one chats through the connection." },
  { title: "Open the app every 13 days", body: "If the Business app stays closed longer than 13 days, the link drops. While active, phone and CRM stay in sync for one-to-one chats." },
];

export const WHAT_SYNCS: string[] = [
  "One-to-one chats from the last 6 months (if history is shared on connect).",
  "Contacts from the Business app.",
  "New messages both ways — phone ↔ CRM.",
  "Older message text. Media only for the 14 days before connecting.",
];

export const WHAT_DOES_NOT_SYNC: string[] = [
  "Group chats (stay on the phone only).",
  "History older than 6 months; media older than ~14 days.",
  "Disappearing messages, view-once media, live location.",
  "Calls and business profile settings (stay in the app).",
];

export const COSTS_AND_LIMITS: string[] = [
  "Messages typed on the phone stay free. Messages sent from the CRM follow Meta's pricing and 24-hour customer-service-window rules (a template message is needed to start or restart a conversation).",
  "Availability depends on the country of the phone number. Check the number is supported before starting.",
  "Once connected, the number cannot simply be disconnected through the API, so decide on the number before you start.",
  "Because the CRM only sees one-to-one chats, deals agreed in a WhatsApp group will not appear unless the file is uploaded (below).",
];

export const GAP_FILLING =
  "Anything outside that window (older chats, and groups) can be filled in from exported chat files: in WhatsApp open the chat, choose Export chat (without media, or with media for attachments), and upload the .txt file here. You see a preview and choose which company the chat belongs to before anything is filed.";

/* ------------------------------ Chat export ------------------------------ */

export interface ParsedChatMessage {
  at: string; // ISO (UTC-naive: the export has no time zone)
  sender: string;
  text: string;
  attachment?: string;
}

export interface ParsedChat {
  messages: ParsedChatMessage[];
  participants: string[];
  /** Lines that looked like messages but could not be read. */
  skipped: number;
  /** 2+ participants other than the exporter usually means a group. */
  isGroup: boolean;
}

// 12/03/2026, 14:05 - Name: text        (Android)
// [12/03/2026, 14:05:33] Name: text     (iOS)
const LINE = /^\u200e?\[?(\d{1,2})[./](\d{1,2})[./](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?\]?\s*(?:-\s*)?(.*)$/;
const ATTACH = /<attached:\s*([^>]+)>|([^\s]+\.(?:pdf|xlsx?|csv|jpe?g|png|docx?))\s*\(file attached\)|\u200e?(image|video|audio|document|sticker) omitted/i;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Reads a WhatsApp "Export chat" text file. Day-first dates are assumed (UK /
 * Europe); pass dayFirst=false for US-format exports.
 */
export function parseChatExport(text: string, opts: { dayFirst?: boolean } = {}): ParsedChat {
  const dayFirst = opts.dayFirst ?? true;
  const messages: ParsedChatMessage[] = [];
  let skipped = 0;
  let current: ParsedChatMessage | null = null;

  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = raw.match(LINE);
    if (m) {
      const rest = m[8];
      const idx = rest.indexOf(": ");
      if (idx === -1) {
        // System line ("Messages are end-to-end encrypted…", "X joined"): not a message.
        current = null;
        continue;
      }
      let [a, b] = [Number(m[1]), Number(m[2])];
      if (!dayFirst) [a, b] = [b, a];
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      let hour = Number(m[4]);
      const ap = m[7]?.toLowerCase().replace(/\./g, "");
      if (ap === "pm" && hour < 12) hour += 12;
      if (ap === "am" && hour === 12) hour = 0;
      if (b < 1 || b > 12 || a < 1 || a > 31) {
        skipped++;
        current = null;
        continue;
      }
      const sender = rest.slice(0, idx).replace(/\u200e/g, "").trim();
      const body = rest.slice(idx + 2).replace(/\u200e/g, "");
      const at = `${year}-${pad(b)}-${pad(a)}T${pad(hour)}:${m[5]}:${m[6] ?? "00"}`;
      const att = body.match(ATTACH);
      current = { at, sender, text: body, attachment: att ? (att[1] ?? att[2] ?? att[3]) : undefined };
      messages.push(current);
    } else if (current && raw.length) {
      current.text += "\n" + raw; // continuation of a multi-line message
    }
  }
  const participants = [...new Set(messages.map((x) => x.sender))];
  return { messages, participants, skipped, isGroup: participants.length > 2 };
}

/** Drops messages already held (same sender, minute and text), so re-importing is safe. */
export function newMessagesOnly(
  parsed: ParsedChatMessage[],
  existing: { at: string; sender: string; text: string }[],
): ParsedChatMessage[] {
  const key = (x: { at: string; sender: string; text: string }) => `${x.at.slice(0, 16)}|${x.sender.toLowerCase()}|${x.text.trim().slice(0, 80)}`;
  const have = new Set(existing.map(key));
  return parsed.filter((m) => !have.has(key(m)));
}
