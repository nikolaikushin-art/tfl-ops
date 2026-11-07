/**
 * Settings > Mass Mailing (v26): the dedicated sending service, the news.
 * subdomain, the DNS records to publish, and the suppression list (anyone who
 * unsubscribed or bounced is never mailed again).
 */
import { useState } from "react";
import {
  PROVIDERS, ZOHO_BULK_LIMIT, addSuppression, dnsChecklist, dnsComplete, fromAddress, normEmail,
  parseEmailList, parseUnsubscribeToken, removeSuppression, sendingReady, validateSending,
  type SendingProvider, type SuppressionReason,
} from "@/lib/campaignCompliance";
import { useCampaignCompliance } from "@/lib/useCampaignCompliance";

const input = "h-11 w-full rounded-xl border border-divider bg-transparent px-3 text-[13px] text-ink outline-none focus:border-accent";
const btn = "brand-focus h-11 rounded-full border border-divider px-3 text-[13px] font-medium text-ink-secondary hover:bg-elevated hover:text-ink";
const label = "mb-1 block text-[12px] font-medium text-ink-secondary";
const REASON: Record<SuppressionReason, string> = {
  unsubscribed: "Unsubscribed", bounced: "Bounced", complaint: "Spam complaint", manual: "Added by you",
};

export function CampaignSendingSettings() {
  const { sending, setSending, suppression, setSuppression } = useCampaignCompliance();
  const [paste, setPaste] = useState("");
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const issues = validateSending(sending);
  const dns = dnsChecklist(sending);
  const set = (patch: Partial<typeof sending>) => setSending({ ...sending, ...patch });
  const ready = sendingReady(sending);

  const addPasted = (reason: SuppressionReason) => {
    const list = parseEmailList(paste);
    let next = suppression;
    list.forEach((e) => (next = addSuppression(next, e, reason)));
    setSuppression(next);
    setMsg(list.length ? `${next.length - suppression.length} added, ${list.length - (next.length - suppression.length)} already on the list.` : "No valid addresses found.");
    setPaste("");
  };
  const applyLink = () => {
    const t = parseUnsubscribeToken(link.trim());
    if (!t) return setMsg("That is not a valid unsubscribe link.");
    setSuppression(addSuppression(suppression, t.email, "unsubscribed", { campaignId: t.campaignId }));
    setMsg(`${t.email} will not be mailed again.`);
    setLink("");
  };

  return (
    <div className="space-y-3">
      <div className="brand-card space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Sending service</h3>
          <p className="text-[12px] text-ink-secondary">
            Zoho blocks mass mailing above about {ZOHO_BULK_LIMIT} emails. Larger campaigns go through a dedicated service, sent from a subdomain so your
            main addresses are never put at risk. Campaigns of {ZOHO_BULK_LIMIT} or fewer can still go from Zoho.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(PROVIDERS) as SendingProvider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => set({ provider: p })}
              className={`rounded-xl border p-3 text-left min-h-[44px] ${sending.provider === p ? "border-accent bg-accent/5" : "border-divider hover:bg-elevated"}`}
            >
              <div className="text-[13px] font-semibold text-ink">{PROVIDERS[p].label}</div>
              <div className="mt-1 text-[11.5px] leading-snug text-ink-secondary">{PROVIDERS[p].note}</div>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><span className={label}>Sending subdomain</span><input className={input} value={sending.subdomain} onChange={(e) => set({ subdomain: e.target.value })} /></div>
          <div><span className={label}>Sender name</span><input className={input} value={sending.fromName} onChange={(e) => set({ fromName: e.target.value })} /></div>
          <div><span className={label}>Sender address (before the @)</span><input className={input} value={sending.fromLocal} onChange={(e) => set({ fromLocal: e.target.value })} /></div>
          <div><span className={label}>Replies go to</span><input className={input} placeholder="info@yourdomain.com" value={sending.replyTo} onChange={(e) => set({ replyTo: e.target.value })} /></div>
          <div className="sm:col-span-2"><span className={label}>Postal address (footer)</span><input className={input} value={sending.postalAddress} onChange={(e) => set({ postalAddress: e.target.value })} /></div>
          <div className="sm:col-span-2"><span className={label}>Unsubscribe page (https)</span><input className={input} value={sending.unsubscribeBaseUrl} onChange={(e) => set({ unsubscribeBaseUrl: e.target.value })} /></div>
        </div>
        {issues.length > 0 ? (
          <ul className="space-y-1 text-[12px] text-amber-700">{issues.map((i) => <li key={i.field}>• {i.message}</li>)}</ul>
        ) : (
          <p className="text-[12px] text-ink-secondary">Campaigns will be sent as {fromAddress(sending)}.</p>
        )}
      </div>

      <div className="brand-card space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">DNS records for {sending.subdomain || "the subdomain"}</h3>
          <p className="text-[12px] text-ink-secondary">
            Whoever manages the domain publishes these once. Tick each when it is done. The exact values come from the service you choose.
          </p>
        </div>
        <div className="divide-y divide-divider">
        {dns.map((r) => (
          <label key={r.key} className="flex min-h-[44px] items-start gap-3 py-3">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={sending.confirmed[r.key]} onChange={(e) => set({ confirmed: { ...sending.confirmed, [r.key]: e.target.checked } })} />
            <span className="min-w-0 text-[12.5px]">
              <span className="font-semibold text-ink">{r.purpose}</span>
              <span className="block break-all font-mono text-[11.5px] text-ink-secondary">{r.type} · {r.host}</span>
              <span className="block break-words text-ink-tertiary">{r.value}</span>
            </span>
          </label>
        ))}
        </div>
        <p className={`text-[12.5px] font-medium ${ready ? "text-emerald-700" : "text-ink-secondary"}`}>
          {ready ? "Ready: large campaigns can be sent." : dnsComplete(sending) ? "DNS confirmed. Finish the details above." : "Not ready: large campaigns stay blocked until every record is confirmed."}
        </p>
        <p className="text-[12px] text-ink-tertiary">Warm up gradually: start with your most engaged contacts, and raise the volume over a few weeks.</p>
      </div>

      <div className="brand-card space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Suppression list ({suppression.length})</h3>
          <p className="text-[12px] text-ink-secondary">Never mailed again by any campaign. Every campaign carries an unsubscribe link that adds the person here.</p>
        </div>
        <textarea className="min-h-[72px] w-full rounded-xl border border-divider bg-transparent p-3 text-[13px] text-ink outline-none focus:border-accent" placeholder="Paste addresses, one per line or comma separated" value={paste} onChange={(e) => setPaste(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => addPasted("manual")}>Add to list</button>
          <button type="button" className={btn} onClick={() => addPasted("bounced")}>Add as bounced</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} min-w-0 flex-1`} placeholder="Test: paste an unsubscribe link from a campaign" value={link} onChange={(e) => setLink(e.target.value)} />
          <button type="button" className={btn} onClick={applyLink}>Process</button>
        </div>
        {msg ? <p className="text-[12px] text-ink-secondary">{msg}</p> : null}
        <div className="thin-scroll max-h-[240px] divide-y divide-divider overflow-y-auto rounded-xl border border-divider">
          {suppression.length === 0 ? <p className="p-3 text-[12px] text-ink-tertiary">Nobody suppressed yet.</p> : null}
          {suppression.map((s) => (
            <div key={s.email} className="flex flex-wrap items-center justify-between gap-3 px-3 py-1">
              <span className="min-w-0 truncate text-[13px] text-ink">{s.email}</span>
              <span className="shrink-0 text-[11.5px] text-ink-tertiary">{REASON[s.reason]} · {new Date(s.at).toLocaleDateString("en-GB")}</span>
              <button type="button" className="min-h-[44px] shrink-0 px-2 text-[12px] text-accent" onClick={() => setSuppression(removeSuppression(suppression, normEmail(s.email)))}>Remove</button>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-ink-tertiary">Only remove someone if they asked to hear from you again.</p>
      </div>
    </div>
  );
}
