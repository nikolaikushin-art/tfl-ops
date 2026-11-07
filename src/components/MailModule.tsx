import { readModuleCfg, useModuleCfg } from "@/lib/moduleConfig";
/**
 * Mail — a full three-pane client (folders · list · reading pane).
 *
 * The point of difference against a generic inbox is the right-hand rail: every
 * message is bound to the customer or supplier it came from and to the
 * quotation, order or invoice it is about, so the reading pane shows live
 * commercial context and can navigate straight into those records. Attachments
 * file into Documents against the correct account in one click, and received
 * messages can be pushed through commercial extraction into the pricing review
 * queue without leaving the pane.
 */
import {
  Archive,
  ArchiveRestore,
  Brain,
  Ban,
  Building2,
  ChevronLeft,
  CornerUpLeft,
  CornerUpRight,
  FileText,
  Flag,
  Inbox,
  UserPlus,
  EyeOff,
  Mail,
  MailOpen,
  MessageCircle,
  Package,
  Paperclip,
  PenSquare,
  Layers,
  AtSign,
  Receipt,
  Search,
  History,
  Sparkles,
  Send,
  Star,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { aiCompose } from "@/lib/ai";
import { useSideExtra } from "@/lib/sideExtra";
import { useStore } from "@/lib/store";
import { usePartyFigures } from "@/lib/usePartyFigures";
import { formatByCurrency } from "@/lib/partyFigures";
import type { Communication, MailFolder } from "@/lib/domain";
import { useMailRules } from "@/lib/useMailRules";
import {
  triageMessage, acceptSender, ignoreSender, blockNotBusiness, restoreSender,
  normaliseAddress, domainOf, defaultSendFrom, REASON_LABEL, type TriageResult,
} from "@/lib/senders";
import { cn } from "@/lib/utils";
import type { AppSection } from "@/components/Shell";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function initialsOf(value: string) {
  const cleaned = value.replace(/[<>"]/g, "").trim();
  const name = cleaned.includes("@") ? cleaned.split("@")[0] : cleaned;
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Mail-client date column: time today, weekday this week, date beyond that. */
function mailDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function money(n: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Folders shown in the rail. `starred` and `flagged` are views over flags
 *  rather than real folders, so a message never leaves its folder to appear. */
type FolderKey = MailFolder | "starred" | "flagged" | "newsenders" | "ignored";

const FOLDERS: { key: FolderKey; label: string; icon: LucideIcon }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "newsenders", label: "New senders", icon: UserPlus },
  { key: "starred", label: "Starred", icon: Star },
  { key: "flagged", label: "Follow up", icon: Flag },
  { key: "sent", label: "Sent", icon: Send },
  { key: "drafts", label: "Drafts", icon: PenSquare },
  { key: "archive", label: "Archive", icon: Archive },
  { key: "ignored", label: "Ignored", icon: EyeOff },
];

/* -------------------------------------------------------------------------- */
/* Module                                                                     */
/* -------------------------------------------------------------------------- */

export function MailModule({
  channel,
  onOpenRecord,
}: {
  channel: "email" | "whatsapp";
  onOpenRecord: (section: AppSection, id?: string) => void;
}) {
  const store = useStore();
  const mailSort = String(useModuleCfg("email").sortBy);
  const [folder, setFolder] = useState<FolderKey>((((v) => (["inbox","sent","drafts","archive","starred","flagged"] as string[]).includes(v) ? v : "inbox")(String(readModuleCfg("email").startFolder))) as FolderKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isEmail = channel === "email";
  const { rules, setRules, mailboxes } = useMailRules();
  const [mailboxFilter, setMailboxFilter] = useState("all");

  const knownEmails = useMemo(
    () =>
      [
        ...store.customers.map((c) => c.email),
        ...store.suppliers.map((c) => c.email),
        ...store.contacts.map((c) => c.email),
      ].filter((e): e is string => !!e),
    [store.customers, store.suppliers, store.contacts],
  );

  // v25: each received email is triaged on arrival. Known contacts reach the
  // Inbox; unknown senders wait in "New senders"; junk, automated mail and
  // anything marked Not business is kept out (and can be restored from Ignored).
  const triage = useMemo(() => {
    const t = new Map<string, TriageResult>();
    if (!isEmail) return t;
    for (const c of store.communications) {
      if (c.channel !== "email" || !c.isReceived) continue;
      t.set(c.id, triageMessage(c, { knownEmails, rules }));
    }
    return t;
  }, [store.communications, knownEmails, rules, isEmail]);

  const mailboxOptions = useMemo(() => {
    const seen = new Set<string>(mailboxes.map(normaliseAddress));
    for (const c of store.communications) if (c.channel === "email" && c.mailbox) seen.add(normaliseAddress(c.mailbox));
    return [...seen].filter(Boolean);
  }, [mailboxes, store.communications]);

  const channelMessages = useMemo(
    () =>
      store.communications.filter(
        (c) =>
          c.channel === channel &&
          (mailboxFilter === "all" || normaliseAddress(c.mailbox) === mailboxFilter),
      ),
    [store.communications, channel, mailboxFilter],
  );

  const actionOf = (c: Communication) => triage.get(c.id)?.action ?? "file";
  const counts = useMemo(() => {
    const unread = (f: MailFolder) =>
      channelMessages.filter((c) => (c.folder ?? "inbox") === f && c.isReceived && !c.isRead && actionOf(c) === "file").length;
    return {
      inbox: unread("inbox"),
      archive: unread("archive"),
      sent: 0,
      drafts: channelMessages.filter((c) => (c.folder ?? "inbox") === "drafts").length,
      starred: channelMessages.filter((c) => c.isStarred).length,
      flagged: channelMessages.filter((c) => c.isFlagged).length,
      newsenders: channelMessages.filter((c) => actionOf(c) === "new_sender" && (c.folder ?? "inbox") === "inbox").length,
      ignored: 0,
    } as Record<FolderKey, number>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelMessages, triage]);

  const messages = useMemo(() => {
    const inFolder = channelMessages.filter((c) => {
      const act = actionOf(c);
      if (folder === "newsenders") return act === "new_sender" && (c.folder ?? "inbox") === "inbox";
      if (folder === "ignored") return act === "ignore";
      // Everything else shows only mail that is allowed in (known / accepted / ours).
      if (act !== "file") return false;
      if (folder === "starred") return c.isStarred;
      if (folder === "flagged") return c.isFlagged;
      return (c.folder ?? "inbox") === folder;
    });
    const q = query.trim().toLowerCase();
    const searched = q
      ? inFolder.filter((c) =>
          [c.subject, c.body, c.from, c.fromName, c.to]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
        )
      : inFolder;
    return [...searched].sort((a, b) =>
      mailSort === "oldest"
        ? new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
        : new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelMessages, folder, query, triage, mailSort]);

  // Keep a valid selection as the folder, search or channel changes, rather
  // than leaving the reading pane showing a message that is no longer listed.
  useEffect(() => {
    if (selectedId && messages.some((m) => m.id === selectedId)) return;
    setSelectedId(messages[0]?.id ?? null);
  }, [messages, selectedId]);

  useEffect(() => {
    setSelectedId(null);
    setFolder("inbox");
  }, [channel]);

  const selected = messages.find((m) => m.id === selectedId) ?? null;

  // Opening a received message marks it read, exactly as a mail client would.
  useEffect(() => {
    if (selected && selected.isReceived && !selected.isRead) {
      store.markCommunicationRead(selected.id, true);
    }
    // Only the identity of the open message should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  useSideExtra({
    primary: { label: isEmail ? "New message" : "New chat", icon: PenSquare, onClick: () => setCompose({ mode: "new", channel }) },
    active: [`folder:${folder}`, ...(isEmail ? [`mb:${mailboxFilter}`] : [])],
    sections: [
      {
        id: "folders",
        items: FOLDERS.map((f) => ({
          key: `folder:${f.key}`,
          label: f.label,
          icon: f.icon,
          count: counts[f.key] ?? 0,
          warn: f.key === "newsenders",
        })),
      },
      ...(isEmail && mailboxOptions.length > 0
        ? [
            {
              id: "mailboxes",
              label: "Mailboxes",
              collapsible: true,
              items: [
                { key: "mb:all", label: "All mailboxes", icon: Layers },
                ...mailboxOptions.map((m) => ({ key: `mb:${m}`, label: m, icon: AtSign })),
              ],
            },
          ]
        : []),
    ],
    onPick: (k) => {
      if (k.startsWith("folder:")) setFolder(k.slice(7) as FolderKey);
      else if (k.startsWith("mb:")) setMailboxFilter(k.slice(3));
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Phones only: the sidebar is a drawer there, so keep compose and the mailbox filter within reach. */}
      <div className="flex items-center gap-2 lg:hidden">
        {isEmail && mailboxOptions.length > 0 ? (
          <select
            value={mailboxFilter}
            onChange={(e) => setMailboxFilter(e.target.value)}
            aria-label="Filter by mailbox"
            className="brand-focus h-9 min-w-0 flex-1 rounded-full border border-divider bg-transparent px-3 text-[13px] text-ink-secondary"
          >
            <option value="all">All mailboxes</option>
            {mailboxOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : <div className="flex-1" />}
        <button
          type="button"
          onClick={() => setCompose({ mode: "new", channel })}
          className="brand-focus inline-flex h-9 items-center gap-2 rounded-full bg-accent-fill px-4 text-[13px] font-semibold text-white"
        >
          <PenSquare className="h-4 w-4" />
          {isEmail ? "New message" : "New chat"}
        </button>
      </div>

      {notice ? (
        <div className="brand-card flex items-start gap-3 p-3.5 text-[13px] text-ink-secondary">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-accent">
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="brand-card grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(300px,1fr)_minmax(0,1.35fr)]">
        {/* ---------------------------------------------------------------- */}
        {/* Folder rail                                                      */}
        {/* ---------------------------------------------------------------- */}
        <aside className="hidden">
          {FOLDERS.map((f) => {
            const Icon = f.icon;
            const active = folder === f.key;
            const count = counts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFolder(f.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors",
                  active
                    ? "bg-accent/10 font-semibold text-ink"
                    : "text-ink-secondary hover:bg-elevated hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]",
                    active ? "bg-accent-fill text-white" : "bg-elevated text-ink-secondary",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                <span className="flex-1 truncate text-left">{f.label}</span>
                {count > 0 ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                      active ? "bg-accent-fill text-white" : "bg-elevated text-ink-secondary",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}

          <div className="mt-auto border-t border-divider px-2.5 pt-3 text-[11px] leading-relaxed text-ink-tertiary">
            Only received messages are put through extraction. Anything we sent
            is kept in the timeline but never re-banked as an offer.
          </div>
        </aside>

        {/* ---------------------------------------------------------------- */}
        {/* Message list                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section
          className={cn(
            "flex min-w-0 flex-col border-r border-divider",
            selected ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="flex items-center gap-2 border-b border-divider px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-ink-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages…"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-tertiary"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X className="h-3.5 w-3.5 text-ink-tertiary" />
              </button>
            ) : null}
            {isEmail ? (
              <button
                type="button"
                title="Scan 18 months of history"
                aria-label="Scan 18 months of history"
                onClick={() => {
                  const r = store.runHistoricalEmailScan();
                  setNotice(r.message);
                }}
                className="mhead-btn !h-8 !w-8 shrink-0"
              >
                <History className="h-4 w-4" strokeWidth={1.75} />
              </button>
            ) : null}
          </div>

          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="px-4 py-12 text-center text-[13px] text-ink-secondary">
                Nothing in {FOLDERS.find((f) => f.key === folder)?.label.toLowerCase()}.
              </p>
            ) : (
              messages.map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  active={m.id === selectedId}
                  onOpen={() => setSelectedId(m.id)}
                  onStar={() => store.toggleCommunicationStar(m.id)}
                />
              ))
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Reading pane                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className={cn("min-w-0 flex-col", selected ? "flex" : "hidden lg:flex")}>
          {selected && isEmail && selected.isReceived ? (
            <TriageBar
              key={`tb-${selected.id}`}
              message={selected}
              result={triage.get(selected.id)}
              onAccept={() => { setRules(acceptSender(rules, selected.from ?? "")); setNotice(`${normaliseAddress(selected.from)} accepted. Their mail now goes to the Inbox.`); }}
              onIgnore={() => { setRules(ignoreSender(rules, selected.from ?? "")); setNotice("Ignored. You can restore them from the Ignored folder."); }}
              onNotBusiness={(scope) => { setRules(blockNotBusiness(rules, selected.from ?? "", scope)); setNotice(scope === "domain" ? `Everything from ${domainOf(selected.from)} is now excluded.` : `${normaliseAddress(selected.from)} is now excluded.`); }}
              onRestore={() => { setRules(restoreSender(rules, selected.from ?? "")); setNotice("Restored. They will be triaged as a new sender again."); }}
            />
          ) : null}
          {selected ? (
            <ReadingPane
              key={selected.id}
              message={selected}
              onBack={() => setSelectedId(null)}
              onOpenRecord={onOpenRecord}
              onReply={(mode) => setCompose({ mode, channel, source: selected })}
              onNotice={setNotice}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <Mail className="h-10 w-10 text-ink-tertiary" strokeWidth={1.25} />
              <p className="text-[14px] text-ink-secondary">Select a message to read it.</p>
            </div>
          )}
        </section>
      </div>

      {compose ? (
        <Composer state={compose} onClose={() => setCompose(null)} onSent={setNotice} />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* v25: sender triage bar                                                     */
/* -------------------------------------------------------------------------- */

function TriageBar({
  message,
  result,
  onAccept,
  onIgnore,
  onNotBusiness,
  onRestore,
}: {
  message: Communication;
  result?: TriageResult;
  onAccept: () => void;
  onIgnore: () => void;
  onNotBusiness: (scope: "sender" | "domain") => void;
  onRestore: () => void;
}) {
  if (!result) return null;
  const btn = "brand-focus h-8 rounded-full border border-divider px-3 text-[12px] font-medium text-ink-secondary hover:bg-elevated hover:text-ink";
  const domain = domainOf(message.from);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-divider bg-canvas/60 px-4 py-2.5 text-[12px] text-ink-secondary">
      <span className="mr-auto">
        {result.action === "new_sender" ? "New sender — not filed yet. " : result.action === "ignore" ? "Not filed: " : ""}
        {REASON_LABEL[result.reason]}
      </span>
      {result.action === "new_sender" ? (
        <>
          <button type="button" className={cn(btn, "bg-accent-fill text-white hover:opacity-90")} onClick={onAccept}>Accept sender</button>
          <button type="button" className={btn} onClick={onIgnore}>Ignore</button>
        </>
      ) : null}
      {result.action === "ignore" && result.reason !== "junk_folder" ? (
        <button type="button" className={btn} onClick={onRestore}>Restore</button>
      ) : null}
      {result.reason !== "blocked_sender" && result.reason !== "blocked_domain" && result.reason !== "junk_folder" ? (
        <>
          <button type="button" className={btn} onClick={() => onNotBusiness("sender")}>
            <Ban className="mr-1 inline h-3.5 w-3.5" />Not business
          </button>
          {domain ? (
            <button type="button" className={btn} title={`Exclude everything from ${domain}`} onClick={() => onNotBusiness("domain")}>
              Whole domain
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Message list row                                                           */
/* -------------------------------------------------------------------------- */

function MessageRow({
  message,
  active,
  onOpen,
  onStar,
}: {
  message: Communication;
  active: boolean;
  onOpen: () => void;
  onStar: () => void;
}) {
  const store = useStore();
  const account =
    store.customers.find((c) => c.id === message.customerId)?.name ||
    store.suppliers.find((s) => s.id === message.supplierId)?.name;
  const unread = message.isReceived && !message.isRead;
  const who = message.isReceived
    ? message.fromName || message.from || "Unknown sender"
    : `To: ${message.to || "—"}`;

  return (
    <div
      className={cn(
        "relative flex w-full cursor-pointer items-start gap-3 border-b border-divider px-3 py-3 text-left transition-colors",
        active ? "bg-accent/10" : "hover:bg-elevated",
      )}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {unread ? (
        <span className="absolute left-1 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-fill" />
      ) : null}

      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
          message.isReceived ? "bg-accent/15 text-accent" : "bg-elevated text-ink-secondary",
        )}
      >
        {initialsOf(who)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              unread ? "font-semibold text-ink" : "text-ink-secondary",
            )}
          >
            {who}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-ink-tertiary">
            {mailDate(message.occurredAt)}
          </span>
        </div>

        <div
          className={cn(
            "mt-0.5 truncate text-[13px]",
            unread ? "font-semibold text-ink" : "text-ink",
          )}
        >
          {message.subject || "(no subject)"}
        </div>

        <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-tertiary">
          {message.body.replace(/\s+/g, " ")}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {account ? (
            <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-medium text-ink-secondary">
              {account}
            </span>
          ) : null}
          {message.attachments?.length ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-ink-tertiary">
              <Paperclip className="h-3 w-3" />
              {message.attachments.length}
            </span>
          ) : null}
          {message.isFlagged ? <Flag className="h-3 w-3 text-accent" /> : null}
        </div>
      </div>

      <button
        type="button"
        aria-label={message.isStarred ? "Remove star" : "Star message"}
        onClick={(e) => {
          e.stopPropagation();
          onStar();
        }}
        className="shrink-0 rounded-lg p-1 text-ink-tertiary hover:text-accent"
      >
        <Star className={cn("h-4 w-4", message.isStarred && "fill-accent text-accent")} />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reading pane                                                               */
/* -------------------------------------------------------------------------- */

function ReadingPane({
  message,
  onBack,
  onOpenRecord,
  onReply,
  onNotice,
}: {
  message: Communication;
  onBack: () => void;
  onOpenRecord: (section: AppSection, id?: string) => void;
  onReply: (mode: "reply" | "forward") => void;
  onNotice: (msg: string) => void;
}) {
  const store = useStore();
  const figuresOf = usePartyFigures();
  const folder = message.folder ?? "inbox";

  const customer = store.customers.find((c) => c.id === message.customerId);
  const supplier = store.suppliers.find((s) => s.id === message.supplierId);
  const quotation = store.quotations.find((q) => q.id === message.quotationId);
  const order = store.orders.find((o) => o.id === message.orderId);
  const invoice = store.invoices.find((i) => i.id === message.invoiceId);
  const product = store.products.find((p) => p.id === message.productId);

  // Same-thread messages, so a reply reads as a conversation rather than an
  // orphan sitting in a folder.
  const thread = useMemo(() => {
    if (!message.threadId) return [];
    return store.communications
      .filter((c) => c.threadId === message.threadId && c.id !== message.id)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [store.communications, message.threadId, message.id]);

  const canExtract = message.isReceived && !message.extracted;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-divider px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="mr-1 rounded-lg p-1.5 text-ink-secondary hover:bg-elevated lg:hidden"
          aria-label="Back to list"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <ToolbarButton icon={CornerUpLeft} label="Reply" onClick={() => onReply("reply")} />
        <ToolbarButton icon={CornerUpRight} label="Forward" onClick={() => onReply("forward")} />

        <span className="mx-1 h-5 w-px bg-divider" />

        <ToolbarButton
          icon={Star}
          label={message.isStarred ? "Unstar" : "Star"}
          active={message.isStarred}
          onClick={() => store.toggleCommunicationStar(message.id)}
        />
        <ToolbarButton
          icon={Flag}
          label={message.isFlagged ? "Clear follow-up" : "Follow up"}
          active={message.isFlagged}
          onClick={() => store.toggleCommunicationFlag(message.id)}
        />
        <ToolbarButton
          icon={message.isRead ? Mail : MailOpen}
          label={message.isRead ? "Mark unread" : "Mark read"}
          onClick={() => store.markCommunicationRead(message.id, !message.isRead)}
        />
        <ToolbarButton
          icon={folder === "archive" ? ArchiveRestore : Archive}
          label={folder === "archive" ? "Move to inbox" : "Archive"}
          onClick={() => {
            store.moveCommunication(message.id, folder === "archive" ? "inbox" : "archive");
            onNotice(folder === "archive" ? "Moved to Inbox." : "Archived.");
          }}
        />

        <span className="flex-1" />

        {canExtract ? (
          <button
            type="button"
            onClick={() => {
              const id = store.extractFromCommunication(message.id);
              onNotice(
                id
                  ? "Commercial terms extracted and queued in Pricing for review. Nothing is approved automatically."
                  : "No unit price could be identified in this message, so nothing was banked. Add the offer manually in Pricing.",
              );
            }}
            className="brand-focus inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-fill px-3 text-[12px] font-semibold text-white"
          >
            <Brain className="h-3.5 w-3.5" />
            Extract terms
          </button>
        ) : message.extracted ? (
          <button
            type="button"
            onClick={() => onOpenRecord("pricing")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-elevated px-3 text-[12px] font-medium text-ink-secondary hover:text-ink"
          >
            <Brain className="h-3.5 w-3.5" />
            Extracted — view in Pricing
          </button>
        ) : null}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b border-divider px-5 py-4">
          <h2 className="text-[19px] font-semibold leading-snug tracking-tight text-ink">
            {message.subject || "(no subject)"}
          </h2>
          <div className="mt-3 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[12px] font-semibold text-accent">
              {initialsOf(message.fromName || message.from || "?")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink">
                {message.fromName || message.from}
              </div>
              <div className="truncate text-[12px] text-ink-tertiary">
                {message.from}
                {message.to ? ` → ${message.to}` : ""}
              </div>
              {message.cc ? (
                <div className="truncate text-[12px] text-ink-tertiary">Cc: {message.cc}</div>
              ) : null}
            </div>
            <span className="shrink-0 text-[11px] text-ink-tertiary">
              {fullDate(message.occurredAt)}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="whitespace-pre-wrap px-5 py-5 text-[14px] leading-[1.65] text-ink">
          {message.body}
        </div>

        {/* Attachments */}
        {message.attachments?.length ? (
          <div className="border-t border-divider px-5 py-4">
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">
              <Paperclip className="h-3.5 w-3.5" />
              {message.attachments.length} attachment
              {message.attachments.length === 1 ? "" : "s"}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {message.attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-divider bg-canvas/40 px-3 py-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-elevated text-ink-secondary">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">{a.name}</div>
                    <div className="text-[11px] text-ink-tertiary">
                      {fileSize(a.size)}
                      {a.documentId ? " · filed in Documents" : ""}
                    </div>
                  </div>
                  {a.documentId ? (
                    <button
                      type="button"
                      onClick={() => onOpenRecord("documents", a.documentId)}
                      className="shrink-0 text-[12px] font-semibold text-accent"
                    >
                      Open
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const id = store.fileAttachment(message.id, a.id);
                        onNotice(
                          id
                            ? `“${a.name}” filed in Documents against ${
                                customer?.name || supplier?.name || "this account"
                              }.`
                            : "That attachment is already filed.",
                        );
                      }}
                      className="shrink-0 rounded-full border border-divider px-2.5 py-1 text-[12px] font-medium text-ink-secondary hover:bg-elevated hover:text-ink"
                    >
                      File
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Linked records — the reason this is a CRM inbox and not a mail app */}
        <div className="border-t border-divider px-5 py-4">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">
            Linked records
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {customer ? (
              <LinkedRecord
                icon={Building2}
                label="Customer"
                title={customer.name}
                detail={`${customer.status} · ${customer.country} · ${formatByCurrency(figuresOf(customer.id).soldTo)} sold`}
                onClick={() => onOpenRecord("customers", customer.id)}
              />
            ) : null}
            {supplier ? (
              <LinkedRecord
                icon={Truck}
                label="Supplier"
                title={supplier.name}
                detail={`${supplier.status} · ${supplier.country} · ${formatByCurrency(figuresOf(supplier.id).boughtFrom)} bought`}
                onClick={() => onOpenRecord("suppliers", supplier.id)}
              />
            ) : null}
            {quotation ? (
              <LinkedRecord
                icon={FileText}
                label="Quotation"
                title={quotation.number}
                detail={`${quotation.status} · ${money(quotation.total, quotation.currency)}`}
                onClick={() => onOpenRecord("quotations", quotation.id)}
              />
            ) : null}
            {order ? (
              <LinkedRecord
                icon={Package}
                label="Order"
                title={order.number}
                detail={`${order.status} · ${money(order.total, order.currency)}`}
                onClick={() => onOpenRecord("orders", order.id)}
              />
            ) : null}
            {invoice ? (
              <LinkedRecord
                icon={Receipt}
                label="Invoice"
                title={invoice.number}
                detail={`${invoice.status} · ${money(invoice.total, invoice.currency)}`}
                onClick={() => onOpenRecord("invoices", invoice.id)}
              />
            ) : null}
            {product ? (
              <LinkedRecord
                icon={Package}
                label="Product"
                title={product.name}
                detail={product.sku}
                onClick={() => onOpenRecord("products", product.id)}
              />
            ) : null}
            {!customer && !supplier && !quotation && !order && !invoice && !product ? (
              <p className="text-[13px] text-ink-secondary">
                Nothing linked yet. Once the sender is matched to an account, this
                message will attach to their timeline automatically.
              </p>
            ) : null}
          </div>
        </div>

        {/* Conversation */}
        {thread.length ? (
          <div className="border-t border-divider px-5 py-4">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">
              Earlier in this conversation ({thread.length})
            </div>
            <div className="space-y-2">
              {thread.map((t) => (
                <div key={t.id} className="rounded-xl border border-divider bg-canvas/40 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[12.5px] font-medium text-ink">
                      {t.isReceived ? t.fromName || t.from : `You → ${t.to}`}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-tertiary">
                      {mailDate(t.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-secondary">
                    {t.body.replace(/\s+/g, " ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "brand-focus inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors",
        active ? "text-accent" : "text-ink-secondary hover:bg-elevated hover:text-ink",
      )}
    >
      <Icon className={cn("h-4 w-4", active && "fill-accent/20")} />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function LinkedRecord({
  icon: Icon,
  label,
  title,
  detail,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-divider bg-canvas/40 px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-elevated"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
          {label}
        </div>
        <div className="truncate text-[13px] font-medium text-ink">{title}</div>
        {detail ? (
          <div className="truncate text-[11.5px] capitalize text-ink-tertiary">{detail}</div>
        ) : null}
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Composer                                                                   */
/* -------------------------------------------------------------------------- */

export type ComposeState = {
  mode: "new" | "reply" | "forward";
  channel: "email" | "whatsapp";
  source?: Communication;
};

export function Composer({
  state,
  onClose,
  onSent,
}: {
  state: ComposeState;
  onClose: () => void;
  onSent: (msg: string) => void;
}) {
  const store = useStore();
  const src = state.source;

  const [to, setTo] = useState(
    state.mode === "reply" ? (src?.isReceived ? src.from ?? "" : src?.to ?? "") : "",
  );
  const [cc, setCc] = useState("");
  const { mailboxes } = useMailRules();
  // v25: replies default to the address the email arrived on.
  const [sendFrom, setSendFrom] = useState(() => defaultSendFrom(src, mailboxes));
  const [subject, setSubject] = useState(() => {
    if (!src) return "";
    const base = src.subject ?? "";
    if (state.mode === "reply") return base.startsWith("RE:") ? base : `RE: ${base}`;
    if (state.mode === "forward") return base.startsWith("FW:") ? base : `FW: ${base}`;
    return "";
  });
  const [body, setBody] = useState(() => {
    if (!src || state.mode === "new") return "";
    const quoted = src.body
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    return `\n\n---\nOn ${fullDate(src.occurredAt)}, ${src.fromName || src.from} wrote:\n${quoted}`;
  });

  const isEmail = state.channel === "email";
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    { name: string; size?: number; mimeType?: string }[]
  >([]);
  const attachRef = useRef<HTMLInputElement>(null);
  const runAi = async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError("");
    // Build a light CRM snapshot so the local writer can name parties, deals and products.
    const snapshot = {
      overdueInvoices: (store.invoices || []).filter((i: any) => i.status === "overdue" || (i.due && new Date(i.due) < new Date() && i.status !== "paid")).slice(0, 8).map((i: any) => ({ ref: i.number || i.ref || i.id, total: i.total || 0, currency: i.currency || "EUR", due: i.due, party: i.customerName || i.party })),
      openInvoices: (store.invoices || []).filter((i: any) => i.status !== "paid").slice(0, 8).map((i: any) => ({ ref: i.number || i.ref || i.id, total: i.total || 0, currency: i.currency || "EUR", party: i.customerName || i.party })),
      openRequests: (store.requirements || []).slice(0, 8).map((r: any) => ({ name: r.productName || r.name || r.id, party: r.customerName, status: r.status })),
      liveDeals: (store.deals || store.orders || []).slice(0, 8).map((d: any) => ({ ref: d.ref || d.number || d.id, stage: d.stage || d.status || "", product: d.productName || d.product, margin: d.margin, currency: d.currency || "EUR" })),
      unreadEmail: [],
      recentEmail: src ? [{ from: src.fromName || src.from, subject: src.subject || "", preview: (src.body || "").slice(0, 200) }] : [],
      kycPending: [],
      products: (store.products || []).slice(0, 20).map((p: any) => ({ name: p.name, category: p.category })),
      topCustomers: [
        ...(src?.customerId ? (store.customers || []).filter((c: any) => c.id === src.customerId) : []),
        ...(store.customers || []).slice(0, 5),
      ].map((c: any) => ({ name: c.name, volume: c.volume || 0 })),
      offersToReview: 0,
      fundsAwaiting: [],
      counts: { customers: store.customers?.length || 0, suppliers: store.suppliers?.length || 0, products: store.products?.length || 0, invoices: store.invoices?.length || 0, deals: (store.deals || store.orders || []).length, unreadMail: 0, overdue: 0, openRequests: store.requirements?.length || 0, quotations: store.quotations?.length || 0, orders: store.orders?.length || 0 },
    };
    // Enrich the instruction with reply context when available.
    let instruction = aiPrompt.trim();
    if (src && state.mode === "reply") {
      instruction = `Reply to ${src.fromName || src.from} re: "${src.subject || ""}". Their message said: "${(src.body || "").slice(0, 400)}". Instruction: ${instruction}`;
    }
    const r = await aiCompose(instruction, snapshot as any);
    setAiBusy(false);
    if (!r.reply) { setAiError(r.error || "No answer."); return; }
    const m = r.reply.match(/^\s*Subject:\s*(.*)\n+([\s\S]*)$/i);
    if (m && isEmail) {
      // On reply, keep RE: prefix if subject was already set that way
      const sub = m[1].trim();
      setSubject(state.mode === "reply" && !/^re:/i.test(sub) ? `RE: ${sub}` : sub);
      setBody(m[2].trim());
    } else setBody(r.reply.trim());
    setAiOpen(false);
    setAiPrompt("");
  };
  const canSend = to.trim().length > 0 && (isEmail ? subject.trim().length > 0 : body.trim().length > 0);

  const submit = (asDraft: boolean) => {
    store.sendCommunication({
      channel: state.channel,
      to: to.trim(),
      from: sendFrom || undefined,
      cc: cc.trim() || undefined,
      subject: subject.trim() || "(no subject)",
      body,
      customerId: src?.customerId,
      supplierId: src?.supplierId,
      contactId: src?.contactId,
      quotationId: src?.quotationId,
      orderId: src?.orderId,
      invoiceId: src?.invoiceId,
      threadId: src?.threadId,
      asDraft,
      attachments: pendingAttachments.length ? pendingAttachments : undefined,
    });
    onSent(
      asDraft
        ? "Saved to Drafts."
        : `Message to ${to.trim()} filed in Sent and added to the account timeline.`,
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-divider bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-accent-fill text-white">
            {isEmail ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
          </span>
          <h3 className="flex-1 text-[15px] font-semibold text-ink">
            {state.mode === "reply" ? "Reply" : state.mode === "forward" ? "Forward" : "New message"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close composer"
            className="rounded-lg p-1.5 text-ink-secondary hover:bg-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
          {isEmail && mailboxes.length > 0 ? (
            <ComposerField label="From">
              <select
                value={sendFrom}
                onChange={(e) => setSendFrom(e.target.value)}
                className="w-full bg-transparent text-[14px] text-ink outline-none"
              >
                {mailboxes.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </ComposerField>
          ) : null}
          <ComposerField label="To">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={isEmail ? "name@company.com" : "+44 …"}
              className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-tertiary"
            />
          </ComposerField>

          {isEmail ? (
            <>
              <ComposerField label="Cc">
                <input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className="w-full bg-transparent text-[14px] text-ink outline-none"
                />
              </ComposerField>
              <ComposerField label="Subject">
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-transparent text-[14px] font-medium text-ink outline-none"
                />
              </ComposerField>
            </>
          ) : null}

          {aiOpen ? (
            <div className="border-b border-divider px-4 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-accent" />
                <input
                  autoFocus
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runAi(); } }}
                  placeholder="e.g. Reply thanking them and confirm 500 cases at the quoted price"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-tertiary"
                />
                <button type="button" disabled={aiBusy || !aiPrompt.trim()} onClick={() => void runAi()} className="brand-focus h-8 rounded-full bg-accent-fill px-3 text-[12px] font-semibold text-white disabled:opacity-40">
                  {aiBusy ? "Writing…" : "Write"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 pl-6">
                {[
                  "Thank them and confirm 500 cases at the quoted price",
                  "Confirm T1 under bond, EXW warehouse, escrow settlement",
                  "Polite follow-up on outstanding offer",
                  "Send formal offer with quantity and EUR price",
                  "Escrow deposit received — request release",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setAiPrompt(chip)}
                    className="rounded-full border border-divider bg-elevated px-2.5 py-0.5 text-[11px] text-ink-secondary hover:border-accent hover:text-accent transition-colors"
                  >
                    {chip.length > 42 ? chip.slice(0, 40) + "…" : chip}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {aiError ? <p className="px-4 py-2 text-[12px] text-ink-secondary">{aiError}</p> : null}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            placeholder="Write your message…"
            className="w-full resize-none bg-transparent px-4 py-4 text-[14px] leading-[1.65] text-ink outline-none placeholder:text-ink-tertiary"
          />
          {pendingAttachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-divider px-4 py-2">
              {pendingAttachments.map((a, i) => (
                <span key={`${a.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-3 py-1 text-[12px] text-ink">
                  <Paperclip className="h-3 w-3 text-ink-tertiary" />
                  {a.name}
                  <button type="button" className="text-ink-tertiary hover:text-ink" aria-label="Remove attachment" onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-divider px-4 py-3">
          <button
            type="button"
            disabled={!canSend}
            onClick={() => submit(false)}
            className={cn(
              "brand-focus inline-flex h-10 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white",
              canSend ? "bg-accent-fill" : "cursor-not-allowed bg-elevated text-ink-tertiary",
            )}
          >
            <Send className="h-4 w-4" />
            Send
          </button>
          <button
            type="button"
            disabled={!to.trim() && !body.trim()}
            onClick={() => submit(true)}
            className="h-10 rounded-full border border-divider px-4 text-[13px] font-medium text-ink-secondary hover:bg-elevated hover:text-ink"
          >
            Save draft
          </button>
          <input
            ref={attachRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              setPendingAttachments((prev) => [
                ...prev,
                ...files.map((f) => ({ name: f.name, size: f.size, mimeType: f.type || undefined })),
              ]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => attachRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-divider px-4 text-[13px] font-medium text-ink-secondary hover:bg-elevated hover:text-ink"
          >
            <Paperclip className="h-4 w-4" />
            Attach
          </button>
          <button
            type="button"
            onClick={() => setAiOpen((o) => !o)}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-full border border-divider px-4 text-[13px] font-medium text-accent hover:bg-elevated"
          >
            <Sparkles className="h-4 w-4" />
            Write with AI
          </button>
          <span className="flex-1" />
          <span className="hidden text-[11px] text-ink-tertiary sm:block">
            Filed against the linked account automatically
          </span>
        </div>
      </div>
    </div>
  );
}

function ComposerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-divider px-4 py-2.5">
      <span className="w-14 shrink-0 text-[12px] text-ink-tertiary">{label}</span>
      {children}
    </div>
  );
}
