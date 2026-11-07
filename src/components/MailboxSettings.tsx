/**
 * Settings > Email (v25): the mailboxes Roni connects (Zoho, several), and the
 * "Not business" / accepted / ignored sender lists, with an undo for each.
 * Stored in the browser for now; the server build keeps them in the database.
 */
import { useState } from "react";
import { useMailRules } from "@/lib/useMailRules";
import { normaliseAddress, restoreSender } from "@/lib/senders";

const chip = "inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-[12px] text-ink";
const btn = "brand-focus h-9 rounded-full border border-divider px-3 text-[13px] font-medium text-ink-secondary hover:bg-elevated hover:text-ink";

export function MailboxSettings() {
  const { rules, setRules, mailboxes, setMailboxes } = useMailRules();
  const [draft, setDraft] = useState("");
  const add = () => {
    const a = normaliseAddress(draft);
    if (!a || !a.includes("@") || mailboxes.includes(a)) return;
    setMailboxes([...mailboxes, a]);
    setDraft("");
  };
  const blocked = [...rules.blockedSenders, ...rules.blockedDomains.map((d) => `@${d}`)];
  return (
    <div className="space-y-3">
      <div className="brand-card space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Mailboxes (Zoho)</h3>
          <p className="text-[12px] text-ink-secondary">
            One combined inbox, filtered by mailbox. Replies go out from the address the message arrived on; you can pick another when writing.
            Spam / junk folders are never read. At least 18 months of history is fetched from each.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mailboxes.length === 0 ? <span className="text-[12px] text-ink-tertiary">No mailboxes added yet.</span> : null}
          {mailboxes.map((m) => (
            <span key={m} className={chip}>
              {m}
              <button type="button" aria-label={`Remove ${m}`} className="text-ink-tertiary hover:text-ink" onClick={() => setMailboxes(mailboxes.filter((x) => x !== m))}>×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="name@yourdomain.com"
            className="h-9 min-w-0 flex-1 rounded-xl border border-divider bg-transparent px-3 text-[13px] text-ink outline-none"
          />
          <button type="button" className={btn} onClick={add}>Add mailbox</button>
        </div>
        <p className="text-[12px] text-ink-tertiary">
          Access: the server build connects each mailbox with its own Zoho app-specific password or OAuth grant, read-only for history. Nothing is stored in this demo.
        </p>
      </div>

      <div className="brand-card space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Sender rules</h3>
          <p className="text-[12px] text-ink-secondary">
            Mail from known contacts is filed automatically. Unknown senders wait in New senders. Newsletters, no-reply and automated mail are left out.
          </p>
        </div>
        <RuleList title="Not business (excluded for good)" items={blocked} onRemove={(x) => setRules(restoreSender(rules, x.startsWith("@") ? `x${x}` : x))} />
        <RuleList title="Accepted senders" items={rules.accepted} onRemove={(x) => setRules({ ...rules, accepted: rules.accepted.filter((a) => a !== x) })} />
        <RuleList title="Ignored senders" items={rules.ignored} onRemove={(x) => setRules({ ...rules, ignored: rules.ignored.filter((a) => a !== x) })} />
      </div>
    </div>
  );
}

function RuleList({ title, items, onRemove }: { title: string; items: string[]; onRemove: (x: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium text-ink-secondary">{title} · {items.length}</div>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 ? <span className="text-[12px] text-ink-tertiary">None.</span> : null}
        {items.map((x) => (
          <span key={x} className={chip}>
            {x}
            <button type="button" aria-label={`Remove ${x}`} className="text-ink-tertiary hover:text-ink" onClick={() => onRemove(x)}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}
