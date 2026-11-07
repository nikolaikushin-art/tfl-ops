import { ArrowDown, ArrowUp, ChevronsUpDown, Kanban, List as ListIcon, MoreHorizontal, Table2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { loadValue, saveValue } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { PillTone } from "@/components/ios";

/**
 * One view layer for every record module: List, Table and Pipeline.
 *
 *   List      the iOS inset-grouped list each module already had (passed in as `renderList`)
 *   Table     sortable columns, sticky header, horizontal scroll on phones
 *   Pipeline  stage columns of cards, scroll-snapped on phones, optional drag / "Move to" between stages
 *
 * Each module chooses which of the three it offers and which one opens first; the last choice is
 * remembered per module in the browser.
 */
/** Keep a popup menu inside the viewport: flip above its anchor when it would run off the bottom, scroll inside if it still does not fit. */
function fitMenu(el: HTMLDivElement | null) {
  if (!el) return;
  const vh = window.innerHeight; const vw = window.innerWidth;
  el.style.top = ""; el.style.bottom = ""; el.style.maxHeight = ""; el.style.overflowY = "";
  let r = el.getBoundingClientRect();
  if (r.bottom > vh - 8) {
    const anchor = el.parentElement?.getBoundingClientRect();
    if (anchor && anchor.top - r.height - 4 >= 8) { el.style.top = "auto"; el.style.bottom = "calc(100% + 4px)"; }
    else { el.style.maxHeight = Math.max(160, vh - r.top - 12) + "px"; el.style.overflowY = "auto"; }
  }
  r = el.getBoundingClientRect();
  if (r.left < 8) el.style.right = Math.min(0, r.left - 8) + "px";
  void vw;
}

export type ViewMode = "list" | "table" | "pipeline";

const MODE_META: Record<ViewMode, { label: string; icon: typeof ListIcon }> = {
  list: { label: "List", icon: ListIcon },
  table: { label: "Table", icon: Table2 },
  pipeline: { label: "Pipeline", icon: Kanban },
};

export function useViewMode(id: string, modes: ViewMode[], fallback: ViewMode): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    const saved = loadValue<ViewMode>(`view.${id}`);
    return saved && modes.includes(saved) ? saved : fallback;
  });
  const set = useCallback((m: ViewMode) => { setMode(m); saveValue(`view.${id}`, m); }, [id]);
  return [modes.includes(mode) ? mode : fallback, set];
}

export function ViewSwitcher({ modes, value, onChange, className }: { modes: ViewMode[]; value: ViewMode; onChange: (m: ViewMode) => void; className?: string }) {
  if (modes.length < 2) return null;
  return (
    <div className={cn("rv-switch", className)} role="tablist" aria-label="View">
      {modes.map((m) => {
        const { label, icon: Icon } = MODE_META[m];
        return (
          <button key={m} type="button" role="tab" aria-selected={value === m} data-active={value === m} onClick={() => onChange(m)} className="rv-switch-item brand-focus">
            <Icon className="h-[15px] w-[15px]" strokeWidth={2.2} aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Table ───────────────────────────── */

export interface Column<T> {
  id: string;
  label: string;
  render: (item: T) => ReactNode;
  /** Makes the header sortable. */
  sort?: (item: T) => string | number;
  align?: "left" | "right";
  width?: string;
  /** Hidden below 640px so the table stays readable on a phone. */
  secondary?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, onOpen, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (item: T) => string; onOpen?: (item: T) => void; empty?: ReactNode }) {
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    const col = sort ? columns.find((c) => c.id === sort.id) : undefined;
    if (!sort || !col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
      return r * sort.dir;
    });
  }, [rows, columns, sort]);

  /* A table never scrolls sideways. It measures itself and, while it is too wide, drops the least
     important column — secondary ones first from the right, then middle ones — never the first
     (what the row is) nor the last (usually the amount). If it still does not fit, cells wrap. */
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [drop, setDrop] = useState(0);
  const [tight, setTight] = useState(false);
  const [width, setWidth] = useState(0);
  const sig = columns.map((c) => c.id).join("|");
  const order = useMemo(() => {
    const idx = columns.map((_, i) => i);
    const secondary = idx.filter((i) => columns[i].secondary).reverse();
    const middle = idx.filter((i) => !columns[i].secondary && i !== 0 && i !== columns.length - 1).reverse();
    return [...secondary, ...middle];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const hidden = useMemo(() => new Set(order.slice(0, drop)), [order, drop]);
  const visible = columns.filter((_, i) => !hidden.has(i));

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const keyRef = useRef("");
  useLayoutEffect(() => {
    const el = wrapRef.current, t = tableRef.current;
    if (!el || !t) return;
    const k = `${sig}|${rows.length}|${width}`;
    if (keyRef.current !== k) {
      keyRef.current = k;
      // Something that changes the available room: start again from the full set of columns.
      if (drop !== 0 || tight) { setDrop(0); setTight(false); return; }
    }
    if (t.scrollWidth > el.clientWidth + 1) {
      if (drop < order.length) setDrop(drop + 1);
      else if (!tight) setTight(true);
    }
  }, [drop, tight, width, order.length, sig, rows.length, sorted]);

  const toggle = (c: Column<T>) => {
    if (!c.sort) return;
    setSort((cur) => (!cur || cur.id !== c.id ? { id: c.id, dir: 1 } : cur.dir === 1 ? { id: c.id, dir: -1 } : null));
  };
  const key = (item: T) => (e: KeyboardEvent) => { if (onOpen && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(item); } };

  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="rv-table-wrap" ref={wrapRef}>
      <table className="rv-table" ref={tableRef} data-tight={tight || undefined}>
        <thead>
          <tr>
            {visible.map((c) => {
              const active = sort?.id === c.id;
              return (
                <th key={c.id} scope="col" style={c.width ? { width: c.width } : undefined} data-align={c.align ?? "left"} aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}>
                  {c.sort ? (
                    <button type="button" className="rv-th-btn brand-focus" onClick={() => toggle(c)}>
                      {c.label}
                      {active ? (sort!.dir === 1 ? <ArrowUp className="h-3 w-3" strokeWidth={2.6} /> : <ArrowDown className="h-3 w-3" strokeWidth={2.6} />) : <ChevronsUpDown className="h-3 w-3 opacity-40" strokeWidth={2.2} />}
                    </button>
                  ) : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <tr key={rowKey(item)} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen ? () => onOpen(item) : undefined} onKeyDown={key(item)} data-clickable={onOpen ? true : undefined}>
              {visible.map((c) => (
                <td key={c.id} data-align={c.align ?? "left"}>{c.render(item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────────── Pipeline ───────────────────────────── */

export interface Stage { id: string; label: string; tone?: PillTone; hint?: string }
export interface CardData {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned figure, usually an amount. */
  value?: ReactNode;
  /** Small grey line at the bottom (date, owner…). */
  meta?: ReactNode;
  /** Pills / chips under the title. */
  pills?: ReactNode;
}

const TONE_VAR: Record<PillTone, string> = {
  neutral: "var(--tile-neutral)",
  accent: "var(--accent-fill)",
  success: "var(--success)",
  danger: "var(--danger)",
  caution: "var(--warning)",
};

export function PipelineBoard<T>({
  stages, items, stageOf, card, rowKey, onOpen, onMove, stageTotal, hideEmpty,
}: {
  stages: Stage[];
  items: T[];
  stageOf: (item: T) => string | null | undefined;
  card: (item: T) => CardData;
  rowKey: (item: T) => string;
  onOpen?: (item: T) => void;
  /** When given, cards can be dragged (pointer devices) or moved with the ⋯ menu (touch / keyboard). */
  onMove?: (item: T, toStage: string) => void;
  /** A figure shown in each column header, e.g. the summed value. */
  stageTotal?: (items: T[], stage: Stage) => ReactNode;
  /** Do not draw columns that hold nothing (useful for rare terminal stages). */
  hideEmpty?: string[];
}) {
  const by = useMemo(() => {
    const m = new Map<string, T[]>(stages.map((s) => [s.id, []]));
    for (const it of items) { const s = stageOf(it); if (s && m.has(s)) m.get(s)!.push(it); }
    return m;
  }, [stages, items, stageOf]);
  const shown = stages.filter((s) => !(hideEmpty?.includes(s.id) && (by.get(s.id)?.length ?? 0) === 0));

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);

  useEffect(() => {
    if (!menuKey) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest?.("[data-rv-menu]")) setMenuKey(null); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setMenuKey(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [menuKey]);

  const find = (k: string) => items.find((i) => rowKey(i) === k);
  const drop = (e: DragEvent, stage: string) => {
    e.preventDefault();
    const k = dragRef.current ?? e.dataTransfer.getData("text/plain");
    dragRef.current = null;
    const it = k ? find(k) : undefined;
    setDragKey(null); setOverStage(null);
    if (it && stageOf(it) !== stage) onMove?.(it, stage);
  };

  return (
    <div className="rv-board" ref={boardRef}>
      {shown.map((s) => {
        const col = by.get(s.id) ?? [];
        const total = stageTotal?.(col, s);
        return (
          <section key={s.id} className="rv-col" data-over={overStage === s.id || undefined} aria-label={`${s.label}, ${col.length}`}
            onDragOver={onMove ? (e) => { e.preventDefault(); if (overStage !== s.id) setOverStage(s.id); } : undefined}
            onDragLeave={onMove ? (e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOverStage(null); } : undefined}
            onDrop={onMove ? (e) => drop(e, s.id) : undefined}>
            <header className="rv-col-head">
              <span className="rv-dot" style={{ background: `rgb(${TONE_VAR[s.tone ?? "neutral"]})` }} aria-hidden />
              <span className="rv-col-title">{s.label}</span>
              <span className="rv-col-count tnum">{col.length}</span>
              {total ? <span className="rv-col-total tnum">{total}</span> : null}
            </header>
            <div className="rv-col-body">
              {col.map((it) => {
                const k = rowKey(it);
                const c = card(it);
                return (
                  <div key={k} className="rv-card" data-dragging={dragKey === k || undefined} data-clickable={onOpen ? true : undefined}
                    role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined}
                    draggable={Boolean(onMove)}
                    onDragStart={onMove ? (e) => { e.dataTransfer.setData("text/plain", k); e.dataTransfer.effectAllowed = "move"; dragRef.current = k; /* restyle after the browser has taken its drag image, or Chrome cancels the drag */ window.setTimeout(() => setDragKey(k), 0); } : undefined}
                    onDragEnd={onMove ? () => { dragRef.current = null; setDragKey(null); setOverStage(null); } : undefined}
                    onClick={onOpen ? () => onOpen(it) : undefined}
                    onKeyDown={onOpen ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(it); } } : undefined}>
                    <div className="rv-card-top">
                      <span className="rv-card-title">{c.title}</span>
                      {c.value !== undefined ? <span className="rv-card-value tnum">{c.value}</span> : null}
                      {onMove ? (
                        <span className="rv-menu-anchor" data-rv-menu onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="rv-more brand-focus" aria-label="Move to stage" aria-haspopup="menu" aria-expanded={menuKey === k} onClick={() => setMenuKey(menuKey === k ? null : k)}>
                            <MoreHorizontal className="h-4 w-4" strokeWidth={2.4} />
                          </button>
                          {menuKey === k ? (
                            <div className="rv-menu" role="menu" ref={fitMenu}>
                              <div className="rv-menu-label">Move to</div>
                              {stages.map((st) => (
                                <button key={st.id} type="button" role="menuitem" className="rv-menu-item brand-focus" disabled={st.id === stageOf(it)}
                                  onClick={() => { setMenuKey(null); onMove(it, st.id); }}>
                                  <span className="rv-dot" style={{ background: `rgb(${TONE_VAR[st.tone ?? "neutral"]})` }} aria-hidden />
                                  {st.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                    {c.subtitle ? <div className="rv-card-sub">{c.subtitle}</div> : null}
                    {c.pills ? <div className="rv-card-pills">{c.pills}</div> : null}
                    {c.meta ? <div className="rv-card-meta">{c.meta}</div> : null}
                  </div>
                );
              })}
              {col.length === 0 ? <div className="rv-col-empty">{onMove ? "Drop here" : "Nothing here"}</div> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── The module wrapper ───────────────────────────── */

export function RecordViews<T>({
  id, modes, defaultMode, items, pipelineItems, rowKey, onOpen, label, renderList, columns, stages, stageOf, card, onMove, stageTotal, hideEmpty, empty, leading, onModeChange, tableHead,
}: {
  /** Module id — the chosen view is remembered under it. */
  id: string;
  modes: ViewMode[];
  defaultMode: ViewMode;
  items: T[];
  /** Pipeline shows every stage, so a stage filter that hides stages must not apply to it: pass the list without it. */
  pipelineItems?: T[];
  rowKey: (item: T) => string;
  onOpen?: (item: T) => void;
  /** Plural noun for the count, e.g. "orders". */
  label: string;
  /** The module's existing list markup. */
  renderList: () => ReactNode;
  columns?: Column<T>[];
  stages?: Stage[];
  stageOf?: (item: T) => string | null | undefined;
  card?: (item: T) => CardData;
  onMove?: (item: T, toStage: string) => void;
  stageTotal?: (items: T[], stage: Stage) => ReactNode;
  hideEmpty?: string[];
  empty?: ReactNode;
  leading?: ReactNode;
  /** Called with the active view mode whenever it changes (and on first render). */
  onModeChange?: (m: ViewMode) => void;
  /** Rendered above the Table view only, e.g. a select-all checkbox. */
  tableHead?: ReactNode;
}) {
  const available = (["list", "table", "pipeline"] as ViewMode[]).filter((m) => modes.includes(m) && (m === "table" ? columns : m === "pipeline" ? stages && stageOf && card : true));
  const [mode, setMode] = useViewMode(id, available, available.includes(defaultMode) ? defaultMode : available[0]);
  useEffect(() => { onModeChange?.(mode); }, [mode, onModeChange]);
  const shown = mode === "pipeline" && pipelineItems ? pipelineItems : items;
  const n = shown.length;

  return (
    <div className="rv" data-mode={mode}>
      <div className="rv-bar">
        <span className="rv-count">{leading}{n} {n === 1 ? label.replace(/s$/, "") : label}</span>
        <ViewSwitcher modes={available} value={mode} onChange={setMode} />
      </div>
      {n === 0 && empty ? empty
        : n === 0 && mode !== "list" ? <div className="rv-empty">No {label} to show.</div>
        : mode === "table" && columns ? <>{tableHead}<DataTable columns={columns} rows={items} rowKey={rowKey} onOpen={onOpen} empty={empty} /></>
        : mode === "pipeline" && stages && stageOf && card ? <PipelineBoard stages={stages} items={shown} stageOf={stageOf} card={card} rowKey={rowKey} onOpen={onOpen} onMove={onMove} stageTotal={stageTotal} hideEmpty={hideEmpty} />
        : renderList()}
    </div>
  );
}
