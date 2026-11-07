/**
 * AI client — local CRM engine by default (no API key).
 * Optional server /api/ai if configured on Vercel.
 */
import { localAiCompose, localAiReply, type LocalCrmSnapshot } from "@/lib/localAi";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type { LocalCrmSnapshot };

const EMPTY: LocalCrmSnapshot = {
  overdueInvoices: [],
  openInvoices: [],
  openRequests: [],
  liveDeals: [],
  unreadEmail: [],
  recentEmail: [],
  kycPending: [],
  products: [],
  topCustomers: [],
  offersToReview: 0,
  fundsAwaiting: [],
  counts: {
    customers: 0,
    suppliers: 0,
    products: 0,
    invoices: 0,
    deals: 0,
    unreadMail: 0,
    overdue: 0,
    openRequests: 0,
    quotations: 0,
    orders: 0,
  },
};

export async function aiConfigured(): Promise<boolean> {
  return true;
}

async function tryServerChat(
  messages: ChatMsg[],
  context: string,
): Promise<{ reply?: string; error?: string } | null> {
  try {
    const r = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, context }),
    });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("json")) return null;
    const j = await r.json();
    if (j.configured === false || j.error) return null;
    if (j.reply) return { reply: j.reply };
    return null;
  } catch {
    return null;
  }
}

export async function aiChat(
  messages: ChatMsg[],
  context: string,
  snapshot?: LocalCrmSnapshot,
): Promise<{ reply?: string; error?: string }> {
  const server = await tryServerChat(messages, context);
  if (server?.reply) return server;
  return { reply: localAiReply(messages, snapshot ?? EMPTY, context) };
}

export async function aiCompose(
  prompt: string,
  snapshot?: LocalCrmSnapshot,
): Promise<{ reply?: string; error?: string }> {
  return { reply: localAiCompose(prompt, snapshot ?? EMPTY) };
}
