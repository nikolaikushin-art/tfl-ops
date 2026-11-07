import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useSideExtra } from "@/lib/sideExtra";
import { formatUkDate } from "@/lib/tflRecords";
import { MODULES, type TflKey } from "./model";
import { buildAgenda, AGENDA_SOURCES } from "./agenda";
import { CALENDAR_RANGES, todayIso } from "./settings";
import { refLabel, tflNav, useTfl, useTflSettings } from "./useTfl";

const KINDS = Array.from(new Set(AGENDA_SOURCES.map((s) => s.k)));

/** Every date that matters across all modules, in one list. */
export function TflCalendar() {
  const data = useTfl();
  const settings = useTflSettings();
  const [days, setDays] = useState(settings.calendarDays);
  const [hidden, setHidden] = useState<TflKey[]>([]);
  const today = todayIso();
  const titleOf = (k: TflKey, r: Record<string, string | number>) => {
    const t = String(r[MODULES[k].titleKey] ?? "");
    const f = MODULES[k].fields.find((x) => x.key === MODULES[k].titleKey);
    return f?.ref ? refLabel(data, f.ref, r[f.key]) : t;
  };
  const agenda = useMemo(() => buildAgenda(data, today, days, titleOf), // eslint-disable-line react-hooks/exhaustive-deps
    [data, today, days]);
  const show = (i: { k: TflKey }) => !hidden.includes(i.k);
  const overdue = agenda.overdue.filter(show);
  const upcoming = agenda.upcoming.filter(show);
  const counts = (k: TflKey) => agenda.overdue.filter((i) => i.k === k).length + agenda.upcoming.filter((i) => i.k === k).length;

  useSideExtra({
    sections: [
      { id: "range", label: "Look ahead", items: CALENDAR_RANGES.map((n) => ({ key: `range:${n}`, label: `${n} days` })) },
      { id: "kinds", label: "Show", collapsible: true, items: KINDS.map((k) => ({ key: `kind:${k}`, label: MODULES[k].title, count: counts(k) || undefined })) },
    ],
    active: [`range:${days}`, ...KINDS.filter((k) => !hidden.includes(k)).map((k) => `kind:${k}`)],
    onPick: (key) => {
      if (key.startsWith("range:")) setDays(Number(key.slice(6)));
      else if (key.startsWith("kind:")) { const k = key.slice(5) as TflKey; setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k])); }
    },
  });

  const byDate = new Map<string, typeof upcoming>();
  for (const i of upcoming) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i]);
  const row = (i: (typeof upcoming)[number]) => (
    <button key={`${i.k}:${i.id}:${i.what}`} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/30" onClick={() => tflNav.open(i.k, i.id)}>
      <span className="min-w-0 truncate">{i.title || "(untitled)"} <span className="text-muted-foreground">· {i.what}</span></span>
      <span className="shrink-0 text-xs text-muted-foreground">{MODULES[i.k].title}</span>
    </button>
  );
  return (
    <div>
      <h1 className="font-heading text-3xl">Calendar</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">Shoots, visits, follow-ups, due dates and expiries from every module, next {days} days.</p>
      {overdue.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-heading text-lg text-[#C6A15B]">Overdue ({overdue.length})</h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            {overdue.map((i) => <div key={`${i.k}:${i.id}:${i.what}`} className="flex items-center"><span className="w-28 shrink-0 pl-4 font-mono text-xs">{formatUkDate(i.date)}</span><div className="min-w-0 flex-1">{row(i)}</div></div>)}
          </div>
        </section>
      )}
      {byDate.size === 0 && overdue.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border p-10 text-sm text-muted-foreground"><CalendarDays className="h-6 w-6" />Nothing scheduled in the next {days} days.</div>
      )}
      {[...byDate.entries()].map(([date, items]) => (
        <section key={date} className="mb-4">
          <h2 className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">{date === today ? "Today · " : ""}{formatUkDate(date)}</h2>
          <div className="divide-y divide-border rounded-lg border border-border">{items.map(row)}</div>
        </section>
      ))}
    </div>
  );
}
