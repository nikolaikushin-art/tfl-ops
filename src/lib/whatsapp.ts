/**
 * The Film Location CRM — WhatsApp conversation model.
 *
 * Pulled out of `WhatsAppModule.tsx` so the threading logic (which account a
 * message belongs to, unread/starred/flagged aggregation, and delivery-state
 * inference) can run under `vitest` without dragging in JSX. The component
 * still owns rendering; this module owns "what is a conversation".
 */
import type { Communication } from "@/lib/domain";

export interface Chat {
  /** Account id where we know it, otherwise the raw number. */
  key: string;
  name: string;
  /** Counterparty number, as best we know it. */
  phone: string;
  subtitle: string;
  customerId?: string;
  supplierId?: string;
  messages: Communication[];
  last: Communication;
  unread: number;
  starred: boolean;
  flagged: boolean;
}

/**
 * Groups the WhatsApp timeline into conversations.
 *
 * Keyed on the account wherever the message is matched to one, so two
 * numbers belonging to the same supplier collapse into a single thread
 * rather than splitting the history — which is the behaviour anyone chasing
 * a price needs. Unmatched numbers fall back to the number itself.
 */
export function buildChats(
  messages: Communication[],
  nameFor: (m: Communication) => { name: string; subtitle: string; phone: string },
): Chat[] {
  const groups = new Map<string, Communication[]>();
  for (const m of messages) {
    const counterparty = m.isReceived ? m.from : m.to;
    const key = m.customerId || m.supplierId || counterparty || m.id;
    const bucket = groups.get(key);
    if (bucket) bucket.push(m);
    else groups.set(key, [m]);
  }

  const chats: Chat[] = [];
  for (const [key, bucket] of groups) {
    const ordered = [...bucket].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
    const last = ordered[ordered.length - 1];
    const identity = nameFor(last);
    chats.push({
      key,
      name: identity.name,
      phone: identity.phone,
      subtitle: identity.subtitle,
      customerId: ordered.find((m) => m.customerId)?.customerId,
      supplierId: ordered.find((m) => m.supplierId)?.supplierId,
      messages: ordered,
      last,
      unread: ordered.filter((m) => m.isReceived && !m.isRead).length,
      starred: ordered.some((m) => m.isStarred),
      flagged: ordered.some((m) => m.isFlagged),
    });
  }

  return chats.sort(
    (a, b) => new Date(b.last.occurredAt).getTime() - new Date(a.last.occurredAt).getTime(),
  );
}

/**
 * Delivery state for an outbound message.
 *
 * Deliberately honest about what we know. A real WhatsApp Business API
 * webhook reports sent / delivered / read as three separate events; this
 * prototype only holds a read flag, so "delivered" is the floor for
 * anything that has left drafts — never upgraded to "read" on a guess.
 */
export type TickState = "pending" | "delivered" | "read";

export function tickStateFor(m: Communication): TickState {
  if ((m.folder ?? "sent") === "drafts") return "pending";
  return m.isRead ? "read" : "delivered";
}

/** A bare phone number has no initials worth showing — use the last two
 *  digits, which is what the eye actually uses to tell two unsaved numbers
 *  apart. Otherwise, first letters of the first two words. */
export function initialsOf(value: string): string {
  const cleaned = (value || "").replace(/[<>"]/g, "").trim();
  if (!cleaned) return "?";
  if (/^[+\d][\d\s()-]+$/.test(cleaned)) {
    const digits = cleaned.replace(/\D/g, "");
    return digits.slice(-2) || "#";
  }
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
