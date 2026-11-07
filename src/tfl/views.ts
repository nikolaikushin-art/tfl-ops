// Smart views: the saved filters shown in each module's second sidebar, with live counts.
// Pure rules (no React, no browser) so they are unit-tested.
import type { TflKey, TflRecord } from "./model";
import type { TflSettings } from "./settings";
import { addDays } from "./settings";

export type ViewCtx = { today: string; s: TflSettings };
export type SmartView = { key: string; label: string; warn?: boolean; test: (r: TflRecord, c: ViewCtx) => boolean };

const s = (r: TflRecord, k: string) => String(r[k] ?? "").trim();
const has = (r: TflRecord, k: string) => s(r, k) !== "";
const isIn = (r: TflRecord, k: string, list: string[]) => list.includes(s(r, k));
const before = (d: string, limit: string) => d !== "" && d < limit;
/** Date is today or later and no later than `days` ahead. */
const within = (d: string, c: ViewCtx, days: number) => d !== "" && d >= c.today && d <= addDays(c.today, days);
const num = (r: TflRecord, k: string) => Number(r[k]) || 0;

const OPEN_ENQUIRY = ["New", "Scouting", "Shortlisted", "Quoted"];
const CLOSED_TASK = ["Done", "Cancelled"];
const openTask = (r: TflRecord) => !isIn(r, "status", CLOSED_TASK);

export const SMART_VIEWS: Partial<Record<TflKey, SmartView[]>> = {
  locations: [
    { key: "available", label: "Available now", test: (r) => s(r, "status") === "Available" },
    { key: "norate", label: "No day rate set", warn: true, test: (r) => !num(r, "dayRate") && s(r, "status") !== "Archived" },
    { key: "permit", label: "Permit required", test: (r) => s(r, "permitRequired") === "Yes" },
    { key: "noowner", label: "No owner linked", warn: true, test: (r) => !has(r, "owner") && s(r, "status") !== "Archived" },
  ],
  registrations: [
    { key: "new", label: "New", test: (r) => s(r, "status") === "New" },
    { key: "followup", label: "Follow-up due", warn: true, test: (r, c) => !isIn(r, "status", ["Listed", "Declined"]) && has(r, "followUp") && s(r, "followUp") <= c.today },
    { key: "visit", label: "Waiting for a visit", test: (r) => isIn(r, "status", ["Contacted", "Visit booked"]) },
  ],
  assessments: [
    { key: "high", label: "High risk", warn: true, test: (r) => s(r, "riskLevel") === "High" },
    { key: "followup", label: "Needs follow-up", warn: true, test: (r) => s(r, "status") === "Needs follow-up" },
    { key: "listed", label: "Listed buildings", test: (r) => has(r, "listedGrade") && s(r, "listedGrade") !== "Not listed" },
    { key: "approved", label: "Approved for filming", test: (r) => s(r, "status") === "Approved for filming" },
  ],
  shortlists: [
    { key: "waiting", label: "Waiting for an answer", test: (r) => isIn(r, "status", ["Sent", "Viewed"]) },
    { key: "drafts", label: "Drafts", test: (r) => s(r, "status") === "Draft" },
  ],
  owners: [
    { key: "owner", label: "Owners", test: (r) => s(r, "kind") === "Owner" },
    { key: "supplier", label: "Suppliers", test: (r) => s(r, "kind") === "Supplier" },
    { key: "authority", label: "Authorities", test: (r) => s(r, "kind") === "Authority" },
    { key: "noemail", label: "Missing email", warn: true, test: (r) => !has(r, "email") },
  ],
  productions: [
    { key: "active", label: "Active", test: (r) => isIn(r, "stage", ["Pre-production", "Shooting"]) },
    { key: "nobilling", label: "No billing details", warn: true, test: (r) => !has(r, "billingName") && s(r, "stage") !== "Closed" },
  ],
  enquiries: [
    { key: "open", label: "Open", test: (r) => isIn(r, "status", OPEN_ENQUIRY) },
    { key: "followup", label: "Follow-up due", warn: true, test: (r, c) => isIn(r, "status", OPEN_ENQUIRY) && has(r, "followUp") && s(r, "followUp") <= c.today },
    { key: "unassigned", label: "Nobody handling it", warn: true, test: (r) => isIn(r, "status", OPEN_ENQUIRY) && !has(r, "assignedTo") },
    { key: "soon", label: "Shoot starts soon", test: (r, c) => isIn(r, "status", OPEN_ENQUIRY) && within(s(r, "shootStart"), c, c.s.bookingSoonDays) },
  ],
  scouting: [
    { key: "upcoming", label: "Upcoming visits", test: (r, c) => s(r, "status") === "Planned" && has(r, "date") && s(r, "date") >= c.today },
    { key: "late", label: "Planned but past", warn: true, test: (r, c) => s(r, "status") === "Planned" && before(s(r, "date"), c.today) },
    { key: "recommended", label: "Recommended", test: (r) => s(r, "outcome") === "Recommended" },
  ],
  bookings: [
    { key: "now", label: "Shooting now", test: (r, c) => s(r, "status") === "Confirmed" && s(r, "startDate") <= c.today && s(r, "endDate") >= c.today },
    { key: "soon", label: "Starting soon", test: (r, c) => !isIn(r, "status", ["Cancelled", "Wrapped", "Shot"]) && within(s(r, "startDate"), c, c.s.bookingSoonDays) },
    {
      key: "papers", label: "Missing paperwork", warn: true,
      test: (r, c) => s(r, "status") === "Confirmed" && ((c.s.requireInsurance && !isIn(r, "insurance", ["Received", "Not needed"])) || (c.s.requireRams && !isIn(r, "riskAssessment", ["Received", "Not needed"]))),
    },
    { key: "deposit", label: "Deposit outstanding", warn: true, test: (r) => s(r, "depositStatus") === "Requested" && !isIn(r, "status", ["Cancelled"]) },
    { key: "holds", label: "Holds to decide", test: (r) => s(r, "status") === "Hold" },
  ],
  quotes: [
    { key: "waiting", label: "Waiting for an answer", test: (r) => s(r, "status") === "Sent" },
    { key: "expiring", label: "Expiring within 7 days", warn: true, test: (r, c) => s(r, "status") === "Sent" && within(s(r, "validUntil"), c, 7) },
    { key: "expired", label: "Past valid-until date", warn: true, test: (r, c) => isIn(r, "status", ["Draft", "Sent"]) && before(s(r, "validUntil"), c.today) },
    { key: "drafts", label: "Drafts", test: (r) => s(r, "status") === "Draft" },
  ],
  invoices: [
    { key: "overdue", label: "Overdue", warn: true, test: (r, c) => !isIn(r, "status", ["Paid", "Draft"]) && before(s(r, "due"), c.today) },
    { key: "unpaid", label: "Unpaid", test: (r) => isIn(r, "status", ["Sent", "Part paid", "Overdue"]) },
    { key: "week", label: "Due in 7 days", test: (r, c) => !isIn(r, "status", ["Paid", "Draft"]) && within(s(r, "due"), c, 7) },
    { key: "drafts", label: "Drafts to send", test: (r) => s(r, "status") === "Draft" },
  ],
  payments: [
    { key: "due", label: "Due", warn: true, test: (r) => s(r, "status") === "Due" },
    { key: "held", label: "Deposits held", test: (r) => s(r, "kind") === "Security deposit" && s(r, "status") === "Received" },
    { key: "payouts", label: "Owner payouts", test: (r) => s(r, "kind") === "Owner payout" },
  ],
  contracts: [
    { key: "out", label: "Out for signature", test: (r) => s(r, "status") === "Out for signature" },
    { key: "expiring", label: "Expiring soon", warn: true, test: (r, c) => s(r, "status") === "Signed" && within(s(r, "expires"), c, c.s.expiryWarnDays) },
    { key: "expired", label: "Expired", warn: true, test: (r, c) => s(r, "status") !== "Draft" && before(s(r, "expires"), c.today) },
  ],
  permits: [
    { key: "waiting", label: "Waiting for approval", test: (r) => s(r, "status") === "Applied" },
    { key: "notstarted", label: "Not started", warn: true, test: (r) => s(r, "status") === "Not started" },
    { key: "expiring", label: "Expiring soon", warn: true, test: (r, c) => s(r, "status") === "Approved" && within(s(r, "expires"), c, c.s.expiryWarnDays) },
    { key: "expired", label: "Expired", warn: true, test: (r, c) => s(r, "status") !== "Rejected" && before(s(r, "expires"), c.today) },
  ],
  insurance: [
    { key: "outstanding", label: "Still to receive", warn: true, test: (r) => s(r, "status") === "Requested" },
    { key: "expiring", label: "Expiring soon", warn: true, test: (r, c) => s(r, "status") === "Received" && within(s(r, "expires"), c, c.s.expiryWarnDays) },
    { key: "expired", label: "Expired", warn: true, test: (r, c) => s(r, "status") !== "Not needed" && before(s(r, "expires"), c.today) },
    { key: "low", label: "Cover below minimum", warn: true, test: (r, c) => c.s.minCover > 0 && s(r, "status") === "Received" && s(r, "kind") === "Public liability" && s(r, "currency") === "GBP" && num(r, "cover") > 0 && num(r, "cover") < c.s.minCover },
  ],
  incidents: [
    { key: "open", label: "Open", test: (r) => !isIn(r, "status", ["Settled", "Closed"]) },
    { key: "serious", label: "Serious", warn: true, test: (r) => s(r, "severity") === "Serious" && !isIn(r, "status", ["Settled", "Closed"]) },
    { key: "insurer", label: "Insurer not told", warn: true, test: (r) => !isIn(r, "status", ["Settled", "Closed"]) && s(r, "insurerNotified") !== "Yes" && s(r, "severity") !== "Minor" },
  ],
  neighbours: [
    { key: "todo", label: "Not sent yet", warn: true, test: (r) => s(r, "status") === "To do" },
    { key: "late", label: "Send-by date passed", warn: true, test: (r, c) => s(r, "status") === "To do" && before(s(r, "sendBy"), c.today) },
    { key: "complaints", label: "With complaints", warn: true, test: (r) => num(r, "complaintsReceived") > 0 && s(r, "status") !== "Cleared" },
  ],
  tasks: [
    { key: "overdue", label: "Overdue", warn: true, test: (r, c) => openTask(r) && before(s(r, "due"), c.today) },
    { key: "today", label: "Due today", test: (r, c) => openTask(r) && s(r, "due") === c.today },
    { key: "week", label: "Next 7 days", test: (r, c) => openTask(r) && within(s(r, "due"), c, 7) },
    { key: "high", label: "High priority", warn: true, test: (r) => openTask(r) && isIn(r, "priority", ["High", "Urgent"]) },
    { key: "mine", label: "Not assigned", test: (r) => openTask(r) && !has(r, "assignedTo") },
  ],
};

export function viewsFor(k: TflKey): SmartView[] { return SMART_VIEWS[k] ?? []; }

export function viewCounts(k: TflKey, rows: TflRecord[], c: ViewCtx): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of viewsFor(k)) out[v.key] = rows.filter((r) => v.test(r, c)).length;
  return out;
}

/** Everything that needs attention, across all modules (for the dashboard). */
export function attentionList(data: Partial<Record<TflKey, TflRecord[]>>, c: ViewCtx): { k: TflKey; view: SmartView; count: number }[] {
  const out: { k: TflKey; view: SmartView; count: number }[] = [];
  for (const k of Object.keys(SMART_VIEWS) as TflKey[])
    for (const v of viewsFor(k)) {
      if (!v.warn) continue;
      const count = (data[k] ?? []).filter((r) => v.test(r, c)).length;
      if (count > 0) out.push({ k, view: v, count });
    }
  return out.sort((a, b) => b.count - a.count);
}
