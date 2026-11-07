/**
 * Advanced local CRM assistant — answers in milliseconds from browser data.
 * No API keys. Powers the floating Assistant and email “Write with AI”.
 */
import type { ChatMsg } from "@/lib/ai";

export type LocalCrmSnapshot = {
  section?: string;
  overdueInvoices: { ref: string; party: string; total: number; currency: string; due?: string }[];
  openInvoices: { ref: string; party: string; total: number; currency: string; status: string }[];
  openRequests: { name: string; status: string; party?: string }[];
  liveDeals: { ref: string; stage: string; product?: string; margin?: number; currency?: string }[];
  unreadEmail: { from: string; subject: string; when?: string }[];
  recentEmail: { from: string; subject: string; when?: string; inbound?: boolean }[];
  kycPending: { name: string; status: string }[];
  products: { name: string; category?: string }[];
  topCustomers: { name: string }[];
  offersToReview: number;
  fundsAwaiting: { ref: string; amount: number; currency: string }[];
  counts: {
    customers: number;
    suppliers: number;
    products: number;
    invoices: number;
    deals: number;
    unreadMail: number;
    overdue: number;
    openRequests: number;
    quotations: number;
    orders: number;
  };
};

function money(n: number, c = "GBP") {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: c || "GBP", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${c} ${Math.round(n)}`;
  }
}

function bullets(items: string[]) {
  return items.map((t) => `• ${t}`).join("\n");
}

function section(title: string, body: string) {
  return `**${title}**\n${body}`;
}

function attention(s: LocalCrmSnapshot): string {
  const blocks: string[] = [];
  if (s.overdueInvoices.length) {
    blocks.push(
      section(
        `Overdue invoices (${s.overdueInvoices.length})`,
        bullets(
          s.overdueInvoices.slice(0, 10).map(
            (i) => `${i.ref} — ${i.party} — ${money(i.total, i.currency)}${i.due ? ` · due ${i.due}` : ""}`,
          ),
        ),
      ),
    );
  }
  if (s.kycPending.length) {
    blocks.push(
      section(
        `KYC needing action (${s.kycPending.length})`,
        bullets(s.kycPending.slice(0, 8).map((k) => `${k.name} (${k.status})`)),
      ),
    );
  }
  if (s.unreadEmail.length) {
    blocks.push(
      section(
        `Unread email (${s.unreadEmail.length})`,
        bullets(s.unreadEmail.slice(0, 8).map((e) => `${e.from}: ${e.subject}${e.when ? ` · ${e.when}` : ""}`)),
      ),
    );
  }
  if (s.openRequests.length) {
    blocks.push(
      section(
        `Open requests (${s.openRequests.length})`,
        bullets(s.openRequests.slice(0, 8).map((r) => `${r.name}${r.party ? ` — ${r.party}` : ""} (${r.status})`)),
      ),
    );
  }
  if (s.offersToReview > 0) {
    blocks.push(section("Supplier offers", `${s.offersToReview} offer${s.offersToReview === 1 ? "" : "s"} waiting for review.`));
  }
  if (s.fundsAwaiting.length) {
    blocks.push(
      section(
        "Funds awaiting release",
        bullets(s.fundsAwaiting.slice(0, 6).map((f) => `${f.ref} — ${money(f.amount, f.currency)}`)),
      ),
    );
  }
  if (!blocks.length) {
    return [
      "Nothing urgent in the CRM right now.",
      "",
      "• No overdue invoices",
      "• No KYC items waiting",
      "• No unread inbound email in the summary",
      "",
      "You can still ask for a full snapshot, live deals, or a draft email.",
    ].join("\n");
  }
  return [
    "Here’s what needs attention from the CRM data in this browser:",
    "",
    blocks.join("\n\n"),
    "",
    "_Local assistant — CRM data in this browser only. TFL model: back-to-back, T1/T2 bond, escrow margin._",
  ].join("\n");
}

function overdue(s: LocalCrmSnapshot): string {
  if (!s.overdueInvoices.length) {
    return "There are **no overdue invoices** in the CRM right now. Unpaid-but-not-overdue items may still sit under open invoices.";
  }
  const byCur: Record<string, number> = {};
  s.overdueInvoices.forEach((i) => {
    byCur[i.currency] = (byCur[i.currency] || 0) + i.total;
  });
  const totals = Object.entries(byCur)
    .map(([c, n]) => money(n, c))
    .join(" + ");
  return [
    `**${s.overdueInvoices.length} overdue invoice${s.overdueInvoices.length === 1 ? "" : "s"}** — about **${totals}** outstanding.`,
    "",
    bullets(
      s.overdueInvoices.map(
        (i) => `${i.ref} — ${i.party} — ${money(i.total, i.currency)}${i.due ? ` · due ${i.due}` : ""}`,
      ),
    ),
    "",
    "Tip: ask “write a polite payment reminder” to draft a follow-up for the first overdue party.",
  ].join("\n");
}

function unreadMail(s: LocalCrmSnapshot): string {
  if (!s.unreadEmail.length) return "No **unread inbound email** in the CRM summary.";
  return [
    `**${s.unreadEmail.length} unread message${s.unreadEmail.length === 1 ? "" : "s"}:**`,
    "",
    bullets(
      s.unreadEmail.slice(0, 15).map((e) => `${e.from} — ${e.subject}${e.when ? ` (${e.when})` : ""}`),
    ),
    s.unreadEmail.length > 15 ? `\n…and ${s.unreadEmail.length - 15} more.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function paymentReminder(s: LocalCrmSnapshot, hint?: string): string {
  const inv = s.overdueInvoices[0] || s.openInvoices[0];
  if (!inv) {
    return [
      "Subject: Friendly payment reminder",
      "",
      "Dear [Name],",
      "",
      "I hope you are well. This is a polite reminder that invoice [INV-XXXX] remains outstanding.",
      "Please could you confirm when payment will be made, or let us know if anything is holding it up?",
      "",
      "Thank you for your help,",
      "The Film Location",
    ].join("\n");
  }
  const party = "party" in inv ? inv.party : "Customer";
  return [
    `Subject: Payment reminder — ${inv.ref}`,
    "",
    `Dear ${party},`,
    "",
    `I hope you are well. This is a polite reminder that invoice **${inv.ref}** for **${money(inv.total, inv.currency)}** ${"due" in inv && inv.due ? `was due on ${inv.due} and ` : ""}remains outstanding.`,
    "",
    "Please could you arrange payment at your earliest convenience, or let us know if there is anything we can help with on our side?",
    "",
    "Kind regards,",
    "The Film Location",
    hint && !/write|polite|reminder|payment/i.test(hint) ? `\n\n(From your note: ${hint})` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function summary(s: LocalCrmSnapshot): string {
  const c = s.counts;
  return [
    `**CRM snapshot**${s.section ? ` · you are on: ${s.section}` : ""}`,
    "",
    `• Buyers / customers: **${c.customers}**`,
    `• Suppliers: **${c.suppliers}**`,
    `• Products: **${c.products}**`,
    `• Live deals: **${c.deals}**`,
    `• Open requests: **${c.openRequests}** · Quotations: **${c.quotations}** · Orders: **${c.orders}**`,
    `• Invoices: **${c.invoices}** (${c.overdue} overdue)`,
    `• Unread email: **${c.unreadMail}**`,
    `• KYC pending: **${s.kycPending.length}**`,
    `• Offers to review: **${s.offersToReview}**`,
    "",
    "Ask “what needs attention”, “overdue invoices”, “live deals”, or “write a payment reminder” for detail.",
  ].join("\n");
}

function deals(s: LocalCrmSnapshot): string {
  if (!s.liveDeals.length) return "No **live deals** in the summary.";
  return [
    `**Live deals (${s.liveDeals.length}):**`,
    "",
    bullets(
      s.liveDeals.slice(0, 15).map((d) => {
        const m = d.margin != null && d.margin > 0 ? ` · margin ${money(d.margin, d.currency)}` : "";
        return `${d.ref} — ${d.stage}${d.product ? ` · ${d.product}` : ""}${m}`;
      }),
    ),
    s.fundsAwaiting.length
      ? `\n**In escrow / awaiting release:**\n${bullets(s.fundsAwaiting.map((f) => `${f.ref} — ${money(f.amount, f.currency)}`))}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function kyc(s: LocalCrmSnapshot): string {
  if (!s.kycPending.length) return "No **KYC** records need action in the summary.";
  return [
    `**KYC queue (${s.kycPending.length}):**`,
    "",
    bullets(s.kycPending.map((k) => `${k.name} — ${k.status}`)),
  ].join("\n");
}

function requests(s: LocalCrmSnapshot): string {
  if (!s.openRequests.length) return "No **open customer requests** in the summary.";
  return [
    `**Open requests (${s.openRequests.length}):**`,
    "",
    bullets(s.openRequests.slice(0, 15).map((r) => `${r.name}${r.party ? ` — ${r.party}` : ""} (${r.status})`)),
  ].join("\n");
}

function products(s: LocalCrmSnapshot): string {
  if (!s.products.length) return "No products listed in the summary.";
  const cats = new Map<string, number>();
  s.products.forEach((p) => {
    const c = p.category || "Other";
    cats.set(c, (cats.get(c) || 0) + 1);
  });
  return [
    `**Catalogue:** ${s.counts.products} products`,
    "",
    section(
      "By category",
      bullets([...cats.entries()].slice(0, 12).map(([c, n]) => `${c}: ${n}`)),
    ),
    "",
    section(
      "Sample",
      bullets(s.products.slice(0, 8).map((p) => p.name + (p.category ? ` (${p.category})` : ""))),
    ),
  ].join("\n");
}

function contacts(s: LocalCrmSnapshot): string {
  return [
    `**Directory**`,
    `• Customers: **${s.counts.customers}**`,
    `• Suppliers: **${s.counts.suppliers}**`,
    s.topCustomers.length
      ? `\nSample buyers:\n${bullets(s.topCustomers.slice(0, 8).map((c) => c.name))}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractTradeFacts(prompt: string): {
  qty?: string; price?: string; product?: string; currency?: string;
  incoterm?: string; place?: string; tStatus?: string;
} {
  const qty = prompt.match(/(\d[\d,]*)\s*(cases?|bottles?|pallets?|units?|cs)\b/i);
  const price = prompt.match(/(?:at|@|price(?:d)?\s*(?:of|at)?|eur|usd|£|€|\$)\s*([€$£]?\s*[\d,.]+(?:\s*(?:eur|usd|gbp))?)/i)
    || prompt.match(/([\d,.]+)\s*(eur|usd|gbp|€|\$|£)\b/i);
  const currency = (prompt.match(/\b(EUR|USD|GBP)\b/i) || [])[1];
  const incoterm = (prompt.match(/\b(EXW|FCA|FOB|CIF|CFR|DAP|DDP|CPT|CIP)\b/i) || [])[1];
  const place = (prompt.match(/\b(?:EXW|FCA|FOB|CIF|CFR|DAP|DDP)\s+([A-Za-z][A-Za-z\s-]{1,40})/i) || [])[1];
  const tStatus = (prompt.match(/\b(T1|T2)\b/i) || [])[1];
  // product: words around quantity or known spirit categories
  let product: string | undefined;
  const aroundQty = prompt.match(/(?:of|for)?\s*([A-Za-z][A-Za-z0-9 &\-']{2,40}?)\s*(?:\d[\d,]*\s*(?:cases?|bottles?))/i);
  const cat = prompt.match(/\b(whisky|whiskey|champagne|cognac|wine|vodka|gin|rum|tequila|armagnac|bourbon|scotch|champagne|prosecco)\b/i);
  if (aroundQty) product = aroundQty[1].trim();
  else if (cat) product = cat[1];
  return {
    qty: qty ? `${qty[1]} ${qty[2]}` : undefined,
    price: price ? price[1].replace(/\s+/g, " ").trim() : undefined,
    product,
    currency: currency?.toUpperCase(),
    incoterm: incoterm?.toUpperCase(),
    place: place?.trim(),
    tStatus: tStatus?.toUpperCase(),
  };
}

function formalClose(): string[] {
  return ["Kind regards,", "The Film Location"];
}

function emailCompose(prompt: string, s: LocalCrmSnapshot): string {
  const raw = prompt.trim();
  const p = raw.toLowerCase();
  const facts = extractTradeFacts(raw);
  const party = s.topCustomers[0]?.name || "[Name]";
  const dealRef = s.liveDeals[0]?.ref;
  const productHint = facts.product || s.liveDeals[0]?.product || s.openRequests[0]?.name;

  // ── Payment / chase ──────────────────────────────────────────────
  if (/remind|overdue|payment|pay|chase|settlement/.test(p)) return paymentReminder(s, prompt);

  // ── Confirm quantity / price (core TFL back-to-back) ───────────
  if (/confirm|confirmation|booked|accept|proceed|go ahead|agreed/.test(p) || (facts.qty && facts.price)) {
    const lines: string[] = [];
    lines.push(`Subject: Confirmation${productHint ? ` — ${productHint}` : ""}${dealRef ? ` (${dealRef})` : ""}`);
    lines.push("");
    lines.push(`Dear ${party},`);
    lines.push("");
    lines.push("Thank you for your message. I am pleased to confirm the following:");
    lines.push("");
    if (facts.product || productHint) lines.push(`• Product: ${facts.product || productHint}`);
    if (facts.qty) lines.push(`• Quantity: ${facts.qty}`);
    if (facts.price) lines.push(`• Price: ${facts.price}${facts.currency ? ` ${facts.currency}` : ""}`);
    if (facts.incoterm) lines.push(`• Incoterms: ${facts.incoterm}${facts.place ? ` ${facts.place}` : ""}`);
    if (facts.tStatus) lines.push(`• Duty status: ${facts.tStatus} (under bond)`);
    if (!facts.qty && !facts.price) {
      lines.push(raw && !/write|confirm|draft/i.test(raw) ? raw : "• Product / quantity / price: as discussed");
    }
    lines.push("");
    lines.push("All goods remain under bond (T1/T2). Settlement will proceed via the bonded warehouse escrow as agreed — client deposit, supplier payment, and our net margin thereafter.");
    lines.push("");
    lines.push("Please reply to confirm you are content, or let me know if any detail should be adjusted before we issue the formal documents.");
    lines.push("");
    lines.push(...formalClose());
    return lines.join("\n");
  }

  // ── Thank + confirm hybrid (matches the example placeholder) ─────
  if (/thank/.test(p) && (/confirm|cases|price|quote/.test(p) || facts.qty)) {
    const lines: string[] = [];
    lines.push(`Subject: Thank you — confirmation${facts.qty ? ` of ${facts.qty}` : ""}`);
    lines.push("");
    lines.push(`Dear ${party},`);
    lines.push("");
    lines.push("Thank you for your email. I am happy to confirm the following at the quoted terms:");
    lines.push("");
    if (facts.product || productHint) lines.push(`• Product: ${facts.product || productHint}`);
    if (facts.qty) lines.push(`• Quantity: ${facts.qty}`);
    if (facts.price) lines.push(`• Price: ${facts.price}${facts.currency ? ` ${facts.currency}` : ""}`);
    if (facts.incoterm) lines.push(`• ${facts.incoterm}${facts.place ? ` ${facts.place}` : ""}`);
    if (facts.tStatus) lines.push(`• ${facts.tStatus} under bond`);
    if (!facts.qty && !facts.price) lines.push("• As per the quotation previously shared");
    lines.push("");
    lines.push("Please treat this as our formal acceptance. We shall arrange the escrow instructions with the warehouse and send the pre-advice in due course.");
    lines.push("");
    lines.push("Thank you again — I look forward to a smooth shipment.");
    lines.push("");
    lines.push(...formalClose());
    return lines.join("\n");
  }

  // ── Offer / quotation ────────────────────────────────────────────
  if (/quote|quotation|offer|price list|availability|availab/.test(p)) {
    const lines: string[] = [];
    lines.push(`Subject: Offer${productHint ? ` — ${productHint}` : " / availability"}`);
    lines.push("");
    lines.push(`Dear ${party},`);
    lines.push("");
    lines.push("Thank you for your enquiry. Please find our offer below:");
    lines.push("");
    if (facts.product || productHint) lines.push(`• Product: ${facts.product || productHint}`);
    if (facts.qty) lines.push(`• Quantity available: ${facts.qty}`);
    if (facts.price) lines.push(`• Price: ${facts.price}${facts.currency ? ` ${facts.currency}` : ""}`);
    if (facts.incoterm) lines.push(`• Incoterms: ${facts.incoterm}${facts.place ? ` ${facts.place}` : ""}`);
    lines.push(`• Duty status: ${facts.tStatus || "T1/T2"} (under bond — never duty paid)`);
    lines.push("• Validity: subject to prior sale; please confirm promptly");
    if (raw && !/write|draft|compose|quote|offer|email/i.test(raw)) {
      lines.push("");
      lines.push(raw);
    }
    lines.push("");
    lines.push("Happy to revise quantity, Incoterms or delivery window. Escrow through the bonded warehouse is available on request.");
    lines.push("");
    lines.push(...formalClose());
    return lines.join("\n");
  }

  // ── Simple thank-you ─────────────────────────────────────────────
  if (/thank|thanks|appreciate/.test(p)) {
    return [
      "Subject: Thank you",
      "",
      `Dear ${party},`,
      "",
      "Thank you for your message. We appreciate your business and will follow up shortly on the points you raised.",
      "",
      raw && !/thank|write|draft/i.test(raw) ? raw + "\n" : "",
      "Kind regards,",
      "The Film Location",
    ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n");
  }

  // ── Introduction ─────────────────────────────────────────────────
  if (/introduc|hello|meet|reach out|new contact/.test(p)) {
    return [
      "Subject: Introduction — The Film Location",
      "",
      `Dear ${party},`,
      "",
      "I hope this finds you well. I am writing from The Film Location, a specialist trader in fine wines and spirits under bond (T1/T2), principally in EUR and USD.",
      "",
      "We work back-to-back through bonded warehouses with escrow settlement, so counterparties are not asked for open credit.",
      "",
      raw && !/write|draft|introduc/i.test(raw)
        ? raw
        : "I would be glad to share current availability or work from a target list if that would be helpful.",
      "",
      ...formalClose(),
    ].join("\n");
  }

  // ── Follow-up ────────────────────────────────────────────────────
  if (/follow.?up|checking in|any update|circling back/.test(p)) {
    return [
      "Subject: Following up" + (dealRef ? ` — ${dealRef}` : ""),
      "",
      `Dear ${party},`,
      "",
      "I wanted to follow up on our recent exchange and see whether you had any further questions, or whether we might move to confirmation.",
      "",
      raw && !/write|follow|draft/i.test(raw) ? raw : "Please let me know how you would like to proceed — I am happy to adjust quantity, Incoterms or timing.",
      "",
      ...formalClose(),
    ].join("\n");
  }

  // ── Escrow / warehouse / release ─────────────────────────────────
  if (/escrow|warehouse|release|pre-?advice|deposit/.test(p)) {
    return [
      "Subject: Escrow / release instructions" + (dealRef ? ` — ${dealRef}` : ""),
      "",
      `Dear ${party},`,
      "",
      "Further to our agreement, please find the escrow position below:",
      "",
      "• Client deposit into the bonded warehouse escrow",
      "• Warehouse pays the supplier on cleared funds",
      "• TFL receives the net margin after escrow fees and bank charges",
      "",
      raw && !/write|draft|escrow|release/i.test(raw) ? raw : "Kindly confirm when the deposit has been instructed so that we may arrange the corresponding release.",
      "",
      ...formalClose(),
    ].join("\n");
  }

  // ── Free-form — still polished British trade English ─────────────
  const subjectBits = [facts.product, facts.qty].filter(Boolean).join(" · ");
  return [
    `Subject: ${subjectBits || "Regarding our discussion"}`,
    "",
    `Dear ${party},`,
    "",
    raw || "Please find a short note regarding our ongoing discussion.",
    "",
    "Please let me know if you need anything further from our side.",
    "",
    ...formalClose(),
  ].join("\n");
}

function help(): string {
  // TFL trades back-to-back under bond (T1/T2); escrow via warehouses; net margin after fees.

  return [
    "I am the **TFL CRM local assistant**. I read only the data stored in this browser — no API key, no cloud model, answers in a split second.",
    "",
    "**Commercial**",
    "• What needs my attention today?",
    "• Which invoices are overdue? / ageing",
    "• Live deals / pipeline / funds in escrow",
    "• Open customer requests & matches",
    "• KYC queue / compliance status",
    "",
    "**Communications**",
    "• Summarise unread email",
    "• Write a polite payment reminder",
    "• Draft a thank-you / follow-up / introduction / confirmation",
    "",
    "**Directory & catalogue**",
    "• How many customers / suppliers / products",
    "• CRM snapshot / overview",
    "",
    "In **Email → New message**, use **Write with AI** with a short instruction (e.g. “thank them and confirm 200 cases EXW”).",
    "",
    "Tip: be specific (“overdue invoices for Isla Verde”) — I match keywords to structured lists from your CRM.",
  ].join("\n");
}

/** Main router — instant answers from the snapshot. */
export function localAiReply(messages: ChatMsg[], snapshot: LocalCrmSnapshot, contextNote?: string): string {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content?.trim() || "";
  const q = last.toLowerCase();

  if (!last || /^(help|\?|hi|hello|hey)\b/.test(q)) return help();

  if (/attention|urgent|today|priority|what needs|to.?do|action/.test(q)) return attention(snapshot);
  if (/overdue|late invoice|unpaid invoice|ageing/.test(q)) return overdue(snapshot);
  if (/unread|inbox|summaris[ea] unread|email summary|new mail/.test(q)) return unreadMail(snapshot);
  if (/payment reminder|remind.*pay|polite reminder|chase.*payment/.test(q)) return paymentReminder(snapshot, last);
  if (/deal|pipeline|escrow|funds awaiting/.test(q)) return deals(snapshot);
  if (/kyc|onboard|compliance/.test(q)) return kyc(snapshot);
  if (/request|requirement|match/.test(q)) return requests(snapshot);
  if (/product|catalogue|catalog|sku|brand/.test(q)) return products(snapshot);
  if (/contact|customer|supplier|directory|buyer/.test(q)) return contacts(snapshot);
  if (/summary|snapshot|overview|how many|count|stats/.test(q)) return summary(snapshot);
  if (/write|draft|compose|email body|letter|message to/.test(q)) return emailCompose(last, snapshot);
  if (/invoice/.test(q)) return overdue(snapshot) + "\n\n" + summary(snapshot);

  // Intelligent fallback: full attention + snapshot so the user always gets value
  return [
    attention(snapshot),
    "",
    "---",
    "",
    summary(snapshot),
    contextNote ? `\n_Page context: ${contextNote.slice(0, 200)}_` : "",
    "",
    "Ask more specifically (overdue, deals, KYC, draft email) for a focused answer.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function localAiCompose(prompt: string, snapshot: LocalCrmSnapshot): string {
  return emailCompose(prompt || "Write a clear professional email.", snapshot);
}
