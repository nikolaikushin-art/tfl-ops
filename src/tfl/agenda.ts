// The Calendar: every date that matters, pulled from all modules into one list. Pure and unit-tested.
import type { TflKey, TflRecord } from "./model";
import { addDays } from "./settings";

export type AgendaItem = {
  date: string; k: TflKey; id: string; what: string; title: string; late: boolean;
};
type Src = { k: TflKey; field: string; what: string; open: (r: TflRecord) => boolean };
const st = (r: TflRecord) => String(r.status ?? "");

export const AGENDA_SOURCES: Src[] = [
  { k: "bookings", field: "startDate", what: "Shoot starts", open: (r) => ["Hold", "Confirmed"].includes(st(r)) },
  { k: "bookings", field: "endDate", what: "Shoot wraps", open: (r) => st(r) === "Confirmed" },
  { k: "scouting", field: "date", what: "Site visit", open: (r) => st(r) === "Planned" },
  { k: "enquiries", field: "followUp", what: "Enquiry follow-up", open: (r) => ["New", "Scouting", "Shortlisted", "Quoted"].includes(st(r)) },
  { k: "registrations", field: "followUp", what: "Registration follow-up", open: (r) => !["Listed", "Declined"].includes(st(r)) },
  { k: "quotes", field: "validUntil", what: "Quote runs out", open: (r) => st(r) === "Sent" },
  { k: "invoices", field: "due", what: "Invoice due", open: (r) => !["Paid", "Draft"].includes(st(r)) },
  { k: "permits", field: "expires", what: "Permit expires", open: (r) => st(r) === "Approved" },
  { k: "insurance", field: "expires", what: "Insurance expires", open: (r) => st(r) === "Received" },
  { k: "contracts", field: "expires", what: "Contract expires", open: (r) => st(r) === "Signed" },
  { k: "neighbours", field: "sendBy", what: "Neighbour notice due", open: (r) => st(r) === "To do" },
  { k: "tasks", field: "due", what: "Task due", open: (r) => !["Done", "Cancelled"].includes(st(r)) },
];

/** Title shown for a record: the module's title field, resolved by the caller. */
export function buildAgenda(
  data: Partial<Record<TflKey, TflRecord[]>>, today: string, days: number, titleOf: (k: TflKey, r: TflRecord) => string,
): { overdue: AgendaItem[]; upcoming: AgendaItem[] } {
  const last = addDays(today, days);
  const overdue: AgendaItem[] = [];
  const upcoming: AgendaItem[] = [];
  for (const src of AGENDA_SOURCES)
    for (const r of data[src.k] ?? []) {
      const date = String(r[src.field] ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !src.open(r)) continue;
      // A shoot that has already started is not overdue: only things still waiting for action are.
      const item: AgendaItem = { date, k: src.k, id: r.id, what: src.what, title: titleOf(src.k, r), late: date < today };
      if (date < today) { if (src.k !== "bookings") overdue.push(item); }
      else if (date <= last) upcoming.push(item);
    }
  const by = (a: AgendaItem, b: AgendaItem) => a.date.localeCompare(b.date) || a.what.localeCompare(b.what);
  return { overdue: overdue.sort(by), upcoming: upcoming.sort(by) };
}
