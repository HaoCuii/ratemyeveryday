import { paint } from "../lib/color";
import { daysIn, fmtShort, keyOf, MONTHS, TODAY } from "../lib/dates";
import { $, h } from "../lib/dom";
import type { Layout } from "../lib/types";
import { S } from "../state";
import { canEdit, visibleEntries } from "../view";

interface Geometry {
  days: number;
  cols: number;
  rows: number;
  /** cells fill top-to-bottom, then the next column */
  colMajor: boolean;
  weeks?: boolean;
  place: (dayIndex: number, date: Date) => { c: number; r: number };
}

export function geometry(year: number, layout: Layout): Geometry {
  const days = daysIn(year);
  if (layout.type === "months") {
    return { days, cols: 31, rows: 12, colMajor: false, place: (_i, d) => ({ c: d.getDate() - 1, r: d.getMonth() }) };
  }
  if (layout.type === "custom") {
    const n = Math.max(3, Math.min(60, Math.trunc(layout.n) || 19));
    return { days, cols: Math.ceil(days / n), rows: n, colMajor: true, place: i => ({ c: Math.floor(i / n), r: i % n }) };
  }
  const off = (new Date(year, 0, 1).getDay() + 6) % 7; // weeks start Monday
  return {
    days, cols: Math.ceil((days + off) / 7), rows: 7, colMajor: true, weeks: true,
    place: i => ({ c: Math.floor((i + off) / 7), r: (i + off) % 7 }),
  };
}

const label = (text: string, col?: string) => {
  const s = h("span", { class: "flex items-center justify-end font-mono text-[10.5px] leading-none whitespace-nowrap text-faint" }, text);
  if (col) { s.style.gridColumn = col; s.classList.remove("justify-end"); }
  return s;
};

export function renderGrid() {
  const g = geometry(S.year, S.layout);
  const entries = visibleEntries();
  const board = $("board"), cells = $("cells"), top = $("topLab"), left = $("leftLab");
  board.style.setProperty("--cols", String(g.cols));
  board.style.setProperty("--rows", String(g.rows));

  // axis labels
  top.replaceChildren();
  left.replaceChildren();
  if (g.colMajor) {
    let last = -9;
    for (let m = 0; m < 12; m++) {
      const i = Math.round((+new Date(S.year, m, 1) - +new Date(S.year, 0, 1)) / 864e5);
      const { c } = g.place(i, new Date(S.year, m, 1));
      if (c - last < 3) continue; // don't let month names collide
      top.append(label(MONTHS[m], `${c + 1} / span 3`));
      last = c;
    }
    if (g.weeks) ["Mon", "", "Wed", "", "Fri", "", ""].forEach(t => left.append(label(t)));
  } else {
    [1, 5, 10, 15, 20, 25, 30].forEach(d => top.append(label(String(d), `${d} / span 3`)));
    MONTHS.forEach(t => left.append(label(t)));
  }
  left.hidden = !left.childElementCount;

  // day cells
  cells.classList.toggle("ro", !canEdit());
  cells.classList.toggle("nums", S.nums);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < g.days; i++) {
    const d = new Date(S.year, 0, 1 + i);
    const k = keyOf(d);
    const { c, r } = g.place(i, d);
    const e = entries[k];
    const b = h("button", { type: "button", class: "cell", "data-k": k, "aria-label": `${fmtShort(k)}${e ? `, rated ${e.r}` : ""}` });
    b.style.gridColumn = String(c + 1);
    b.style.gridRow = String(r + 1);
    if (k > TODAY) { b.classList.add("future"); b.disabled = true; }
    else if (e) paint(b, e.r);
    if (k === TODAY) b.classList.add("is-today");
    frag.append(b);
  }
  cells.replaceChildren(frag);
  sizeCells();
}

/** Fit the grid to the panel width, within readable bounds; narrow screens scroll sideways instead. */
export function sizeCells() {
  const g = geometry(S.year, S.layout);
  const left = $("leftLab");
  const leftW = left.hidden ? 0 : (left.offsetWidth || 28) + 8;
  const gap = g.cols > 60 ? 2 : 3;
  const avail = $("boardWrap").clientWidth - leftW - 8;
  const size = Math.max(10, Math.min(28, Math.floor((avail - gap * (g.cols - 1)) / g.cols)));
  $("board").style.setProperty("--cell", size + "px");
  $("board").style.setProperty("--gap", gap + "px");
}
