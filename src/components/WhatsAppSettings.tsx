/**
 * Settings > WhatsApp (v26): the recommended connection route (Business app +
 * coexistence), what history comes in and what does not, and a preview-then-file
 * importer for exported chats (fills gaps and covers group chats).
 */
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  COSTS_AND_LIMITS, GAP_FILLING, RECOMMENDED_ROUTE, WHAT_DOES_NOT_SYNC, WHAT_SYNCS,
  newMessagesOnly, parseChatExport, type ParsedChat,
} from "@/lib/whatsappSetup";
import type { Communication } from "@/lib/domain";

const btn = "brand-focus h-9 rounded-full border border-divider px-3 text-[13px] font-medium text-ink-secondary hover:bg-elevated hover:text-ink disabled:opacity-40";
const primary = "brand-focus h-9 rounded-full bg-accent-fill px-4 text-[13px] font-semibold text-white disabled:opacity-40";

function List({ items, tone }: { items: string[]; tone?: string }) {
  return <ul className={`space-y-1.5 text-[12.5px] leading-snug ${tone ?? "text-ink-secondary"}`}>{items.map((t) => <li key={t}>• {t}</li>)}</ul>;
}

export function WhatsAppSettings() {
  const store = useStore();
  const [parsed, setParsed] = useState<ParsedChat | null>(null);
  const [fileName, setFileName] = useState("");
  const [dayFirst, setDayFirst] = useState(true);
  const [raw, setRaw] = useState("");
  const [who, setWho] = useState("");
  const [me, setMe] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const companies = useMemo(
    () => [
      ...store.customers.map((c) => ({ key: `c:${c.id}`, name: c.name })),
      ...store.suppliers.map((c) => ({ key: `s:${c.id}`, name: c.name })),
    ],
    [store.customers, store.suppliers],
  );

  const load = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setRaw(text);
    setFileName(file.name);
    const p = parseChatExport(text, { dayFirst });
    setParsed(p);
    setMe(p.participants[0] ?? "");
    setMsg(p.messages.length ? null : "No messages could be read. Use the .txt file from Export chat.");
  };
  const reparse = (df: boolean) => {
    setDayFirst(df);
    if (raw) setParsed(parseChatExport(raw, { dayFirst: df }));
  };

  const existing = store.communications
    .filter((c) => c.channel === "whatsapp")
    .map((c) => ({ at: c.occurredAt, sender: c.fromName ?? c.from ?? "", text: c.body }));
  const fresh = parsed ? newMessagesOnly(parsed.messages, existing) : [];

  const file = () => {
    if (!parsed || !who) return;
    const [kind, id] = who.split(":");
    const now = new Date().toISOString();
    const stamp = Date.now();
    const items: Communication[] = fresh.map((m, i) => {
      const mine = m.sender === me;
      return {
        id: `cm_wa_${stamp}_${i}`,
        channel: "whatsapp",
        direction: mine ? "outbound" : "inbound",
        body: m.text,
        from: m.sender,
        fromName: m.sender,
        customerId: kind === "c" ? id : undefined,
        supplierId: kind === "s" ? id : undefined,
        isReceived: !mine,
        isRead: true,
        occurredAt: m.at,
        createdAt: now,
      } as Communication;
    });
    store.addCommunicationsBatch(items);
    setMsg(`${items.length} messages filed to the company timeline. ${parsed.messages.length - items.length} were already held and skipped.`);
    setParsed(null);
    setRaw("");
  };

  return (
    <div className="space-y-3">
      <div className="brand-card space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">How to connect</h3>
          <p className="text-[12.5px] leading-relaxed text-ink-secondary">
            Personal WhatsApp cannot be linked. Use WhatsApp Business with coexistence so the CRM connects while you keep the app on your phone. Confirm steps with your provider — Meta’s process can change.
          </p>
        </div>
        <ol className="space-y-2">
          {RECOMMENDED_ROUTE.map((s, i) => (
            <li key={s.title} className="text-[12.5px] text-ink-secondary">
              <span className="font-semibold text-ink">{i + 1}. {s.title}.</span> {s.body}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="brand-card space-y-2 p-4">
          <h3 className="text-[14px] font-semibold text-ink">What syncs</h3>
          <List items={WHAT_SYNCS} />
        </div>
        <div className="brand-card space-y-2 p-4">
          <h3 className="text-[14px] font-semibold text-ink">What does not sync</h3>
          <List items={WHAT_DOES_NOT_SYNC} />
        </div>
      </div>

      <div className="brand-card space-y-2 p-4">
        <h3 className="text-[14px] font-semibold text-ink">Costs and limits</h3>
        <List items={COSTS_AND_LIMITS} />
        <p className="text-[12px] text-ink-tertiary">Status: not connected. The live connection is part of the server build.</p>
      </div>

      <div className="brand-card space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Fill gaps from exported chats</h3>
          <p className="text-[12px] text-ink-secondary">{GAP_FILLING}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${primary} inline-flex cursor-pointer items-center`}>
            Choose chat file (.txt)
            <input type="file" accept=".txt" className="hidden" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink-secondary">
            Dates are
            <select className="h-8 rounded-lg border border-divider bg-transparent px-2 text-[12px]" value={dayFirst ? "dmy" : "mdy"} onChange={(e) => reparse(e.target.value === "dmy")}>
              <option value="dmy">day / month</option>
              <option value="mdy">month / day</option>
            </select>
          </label>
        </div>

        {parsed && parsed.messages.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-divider p-3">
            <p className="text-[13px] text-ink">
              <span className="font-semibold">{fileName}</span>: {parsed.messages.length} messages, {parsed.participants.length} people ({parsed.participants.join(", ")}).
              {" "}{fresh.length} are new, {parsed.messages.length - fresh.length} already held.
              {parsed.skipped ? ` ${parsed.skipped} lines could not be read.` : ""}
            </p>
            {parsed.isGroup ? (
              <p className="text-[12px] text-amber-700">This looks like a group chat. It will be filed against the one company you pick, so only do this if the group is about that company.</p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[12px] text-ink-secondary">
                Which one is you?
                <select className="mt-1 h-9 w-full rounded-xl border border-divider bg-transparent px-2 text-[13px]" value={me} onChange={(e) => setMe(e.target.value)}>
                  {parsed.participants.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label className="text-[12px] text-ink-secondary">
                File against company
                <select className="mt-1 h-9 w-full rounded-xl border border-divider bg-transparent px-2 text-[13px]" value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="">Choose…</option>
                  {companies.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <div className="thin-scroll max-h-[160px] space-y-1 overflow-y-auto rounded-lg bg-elevated p-2 text-[12px] text-ink-secondary">
              {parsed.messages.slice(0, 8).map((m, i) => <div key={i}><span className="text-ink-tertiary">{m.at.replace("T", " ").slice(0, 16)}</span> <b>{m.sender}</b>: {m.text.slice(0, 120)}</div>)}
              {parsed.messages.length > 8 ? <div className="text-ink-tertiary">…and {parsed.messages.length - 8} more</div> : null}
            </div>
            <div className="flex gap-2">
              <button type="button" className={primary} disabled={!who || fresh.length === 0} onClick={file}>File {fresh.length} messages</button>
              <button type="button" className={btn} onClick={() => setParsed(null)}>Cancel</button>
            </div>
          </div>
        ) : null}
        {msg ? <p className="text-[12px] font-medium text-ink">{msg}</p> : null}
      </div>
    </div>
  );
}
