/**
 * Vercel serverless function: POST /api/ai
 * Keeps the model key on the server. Configure ONE of:
 *   ANTHROPIC_API_KEY  (+ optional AI_MODEL)
 *   AI_BASE_URL + AI_API_KEY + AI_MODEL   (any OpenAI-compatible endpoint, incl. Ollama)
 * GET /api/ai returns { configured } so the UI can say honestly when AI is off.
 */
type Msg = { role: "user" | "assistant"; content: string };

const SYSTEM =
  "You are the assistant inside The Film Location's trading CRM (drinks trading: contacts, requests, quotations, orders, invoices, stock, email). " +
  "Answer concisely in the user's language. Only use the CRM facts provided in the context; if something is not there, say so. " +
  "Never invent prices, quantities or customers. When asked to write an email, return the subject on the first line as 'Subject: ...' then the body.";

export default async function handler(req: any, res: any) {
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const base = process.env.AI_BASE_URL;
  const configured = !!(anthropic || (base && process.env.AI_MODEL));
  if (req.method === "GET") return res.status(200).json({ configured });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!configured) return res.status(200).json({ configured: false, error: "AI is not configured on the server." });

  const { messages, context } = (req.body ?? {}) as { messages?: Msg[]; context?: string };
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "No messages" });
  const system = `${SYSTEM}\n\nCRM context:\n${String(context ?? "").slice(0, 6000)}`;
  const history = messages.slice(-20).map((m) => ({ role: m.role, content: String(m.content).slice(0, 8000) }));

  try {
    if (anthropic) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.AI_MODEL || "claude-sonnet-4-5", max_tokens: 1200, system, messages: history }),
      });
      const j: any = await r.json();
      if (!r.ok) return res.status(502).json({ error: j?.error?.message || `Model error ${r.status}` });
      return res.status(200).json({ configured: true, reply: (j.content ?? []).map((c: any) => c.text ?? "").join("") });
    }
    const r = await fetch(`${base!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.AI_API_KEY ? { authorization: `Bearer ${process.env.AI_API_KEY}` } : {}) },
      body: JSON.stringify({ model: process.env.AI_MODEL, messages: [{ role: "system", content: system }, ...history] }),
    });
    const j: any = await r.json();
    if (!r.ok) return res.status(502).json({ error: j?.error?.message || `Model error ${r.status}` });
    return res.status(200).json({ configured: true, reply: j.choices?.[0]?.message?.content ?? "" });
  } catch {
    return res.status(502).json({ error: "Could not reach the model." });
  }
}
