/**
 * Page enhancer — runs inside <main> after every render.
 *
 * 1. Wide tables (4+ columns) get `data-rt` and a `data-label` on every cell, so on a phone
 *    CSS (styles/clean.css) can lay each row out as a stacked card. Nothing scrolls sideways.
 * 2. A page title that repeats the title already shown in the header bar is marked `rt-dup`
 *    and hidden, so the name of the module is never printed twice.
 */
export function enhancePage(root: HTMLElement, titles: string[]): void {
  const wanted = titles.map((t) => t.trim().toLowerCase()).filter(Boolean);

  root.querySelectorAll("table").forEach((table) => {
    const heads = Array.from(table.querySelectorAll("thead th"));
    if (heads.length < 4) {
      if (table.hasAttribute("data-rt")) table.removeAttribute("data-rt");
      return;
    }
    if (!table.hasAttribute("data-rt")) table.setAttribute("data-rt", "1");
    const labels = heads.map((h) => (h.textContent ?? "").trim());
    table.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
      let col = 0;
      Array.from(tr.children).forEach((cell) => {
        if (cell.tagName !== "TD" && cell.tagName !== "TH") return;
        const span = (cell as HTMLTableCellElement).colSpan || 1;
        const label = labels[col] ?? "";
        if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
        col += span;
      });
    });
  });

  const h1 = root.querySelector("h1");
  if (h1) {
    const text = (h1.textContent ?? "").trim().toLowerCase();
    const dup = wanted.includes(text);
    if (dup !== h1.classList.contains("rt-dup")) h1.classList.toggle("rt-dup", dup);
  }
}
