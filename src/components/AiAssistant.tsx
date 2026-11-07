import { AiIcon } from "@/components/AiIcon";
import { Check, Copy, Send, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { aiChat, type ChatMsg, type LocalCrmSnapshot } from "@/lib/ai";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "What needs my attention today?",
  "Which invoices are overdue?",
  "Summarise unread email",
  "Write a polite payment reminder",
];

/** Live CRM snapshot for the local assistant (browser data only). */
function useCrmContext(section: string): { text: string; snapshot: LocalCrmSnapshot } {
  const s = useStore();
  return useMemo(() => {
    const nameOf = (id?: string) =>
      s.customers.find((c) => c.id === id)?.name ??
      s.suppliers.find((x) => x.id === id)?.name ??
      "unknown";
    const overdue = s.invoices.filter((i) => i.status === "overdue" || i.status === "issued");
    const overdueOnly = s.invoices.filter((i) => i.status === "overdue");
    const unread = s.communications.filter(
      (c) => c.channel === "email" && (c.direction === "inbound" || c.isReceived) && !c.isRead,
    );
    const openReq = s.requirements.filter((r) => !["won", "lost", "cancelled"].includes(String(r.status || "").toLowerCase()));
    const liveDeals = (s.deals || []).filter((d) => !["completed", "cancelled", "lost"].includes(String(d.stage || "").toLowerCase()));
    const kycPending = (s.kycRecords || []).filter((k) => !["approved", "cleared", "complete"].includes(String(k.status || "").toLowerCase()));
    const offers = (s.pricingRecords || []).filter((p) => p.status === "pending_review").length;
    const funds = liveDeals
      .filter((d) => /escrow|awaiting|held/i.test(String(d.stage || "")))
      .map((d) => ({
        ref: d.ref || d.id,
        amount: Number(d.actualMargin || (d.salePrice - d.purchasePrice) || 0),
        currency: d.currency || "GBP",
      }));

    const openInv = s.invoices.filter((i) => i.status !== "paid" && i.status !== "cancelled");
    const snapshot: LocalCrmSnapshot = {
      section,
      overdueInvoices: overdueOnly.map((i) => ({
        ref: i.number || i.id,
        party: nameOf(i.customerId),
        total: Number(i.total || 0),
        currency: i.currency || "GBP",
        due: i.dueAt,
      })),
      openInvoices: openInv.slice(0, 20).map((i) => ({
        ref: i.number || i.id,
        party: nameOf(i.customerId),
        total: Number(i.total || 0),
        currency: i.currency || "GBP",
        status: String(i.status),
      })),
      openRequests: openReq.slice(0, 20).map((r) => ({
        name: r.productName || (r as { title?: string }).title || r.id,
        status: String(r.status || "open"),
        party: nameOf(r.customerId),
      })),
      liveDeals: liveDeals.slice(0, 20).map((d) => ({
        ref: d.ref || d.id,
        stage: String(d.stage || "open"),
        product: d.productDescription,
        margin: Number(d.actualMargin ?? (Number(d.salePrice || 0) - Number(d.purchasePrice || 0))),
        currency: d.currency,
      })),
      unreadEmail: unread.slice(0, 20).map((c) => ({
        from: c.fromName || c.from || "Unknown",
        subject: c.subject || "(no subject)",
        when: c.occurredAt?.slice(0, 10),
      })),
      recentEmail: s.communications
        .filter((c) => c.channel === "email")
        .slice(0, 15)
        .map((c) => ({
          from: c.fromName || c.from || "Unknown",
          subject: c.subject || "(no subject)",
          when: c.occurredAt?.slice(0, 10),
          inbound: !!(c.direction === "inbound" || c.isReceived),
        })),
      kycPending: kycPending.slice(0, 20).map((k) => ({
        name: nameOf(k.customerId) || k.id,
        status: String(k.status || "pending"),
      })),
      products: s.products.slice(0, 40).map((p) => ({ name: p.name, category: p.category })),
      topCustomers: s.customers.slice(0, 12).map((c) => ({ name: c.name })),
      offersToReview: offers,
      fundsAwaiting: funds.slice(0, 10),
      counts: {
        customers: s.customers.length,
        suppliers: s.suppliers.length,
        products: s.products.length,
        invoices: s.invoices.length,
        deals: liveDeals.length,
        unreadMail: unread.length,
        overdue: overdueOnly.length,
        openRequests: openReq.length,
        quotations: s.quotations.length,
        orders: s.orders.length,
      },
    };
    const text = [
      `Current page: ${section}`,
      `Customers: ${s.customers.length}; suppliers: ${s.suppliers.length}`,
      `Open requests: ${openReq.length}; live deals: ${liveDeals.length}; invoices: ${s.invoices.length}`,
      `Overdue: ${overdueOnly.length}; unread email: ${unread.length}; KYC pending: ${kycPending.length}`,
    ].join("\n");
    return { text, snapshot };
  }, [s, section]);
}

export function AiAssistant({ section }: { section: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<(ChatMsg & { error?: boolean })[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const { text: ctx, snapshot } = useCrmContext(section);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [msgs, busy, open]);

  const send = async (q: string) => {
    const content = q.trim();
    if (!content || busy) return;
    const next: ChatMsg[] = [...msgs.filter((m) => !m.error), { role: "user", content }];
    setMsgs(next);
    setText("");
    setBusy(true);
    const r = await aiChat(next, ctx, snapshot);
    setBusy(false);
    setMsgs([...next, r.reply ? { role: "assistant", content: r.reply } : { role: "assistant", content: r.error || "No answer.", error: true }]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ai-fab"
        aria-label="AI assistant (Ctrl/⌘ J)"
        title="AI assistant (Ctrl/⌘ J)"
      >
        <span className="ai-fab-tile">{open ? <X size={20} /> : <AiIcon size={21} />}</span>
      </button>
      {open ? (
        <div className="ai-panel" role="dialog" aria-label="AI assistant">
          <header className="ai-head">
            <AiIcon size={17} />
            <b>Assistant</b>
            <span className="ai-sub">{section}</span>
            <button type="button" className="mhead-btn" title="Clear chat" aria-label="Clear chat" onClick={() => setMsgs([])}>
              <Trash2 size={15} />
            </button>
            <button type="button" className="mhead-btn" title="Close" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>
          <div className="ai-body thin-scroll">
            {msgs.length === 0 ? (
              <div className="ai-empty">
                <p>Ask about contacts, requests, invoices or email. Answers use the CRM data in this browser — no API key needed.</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="ai-chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              msgs.map((m, i) => (
                <div key={i} className={cn("ai-msg", m.role === "user" ? "is-user" : "is-bot", m.error && "is-error")}>
                  <div className="ai-text">{m.content}</div>
                  {m.role === "assistant" && !m.error ? (
                    <button
                      type="button"
                      className="ai-copy"
                      aria-label="Copy"
                      onClick={() => {
                        void navigator.clipboard?.writeText(m.content);
                        setCopied(i);
                        setTimeout(() => setCopied(null), 1200);
                      }}
                    >
                      {copied === i ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  ) : null}
                </div>
              ))
            )}
            {busy ? <div className="ai-msg is-bot"><div className="ai-text ai-typing">Thinking…</div></div> : null}
            <div ref={bottom} />
          </div>
          <form
            className="ai-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything…" aria-label="Message" autoFocus />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="ai-send">
              <Send size={15} />
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
