import { hue, lightness } from "../lib/color";
import { daysIn, keyOf, MONTHS, TODAY } from "../lib/dates";
import type { Entries, Layout } from "../lib/types";
import { geometry } from "../ui/grid";

/*
 * Draws a clean, shareable heatmap: date labels on the side and top, the grid, nothing else.
 * Always the light palette on white, whatever theme the viewer uses, so it looks the same everywhere.
 */

const CELL = 16, GAP = 3, PAD = 28, LABEL_GAP = 8, TOP_H = 14;
const INK = "#9aa09b", EMPTY = "#eceee9", FUTURE = "#f5f6f3", PAPER = "#ffffff";
const MONO = '"Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** oklch rating colours resolved to plain CSS colours once (canvas support for oklch varies). */
let ratingColours: string[] | null = null;
function colours() {
  if (ratingColours) return ratingColours;
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  ratingColours = [];
  for (let r = 1; r <= 10; r++) {
    probe.fillStyle = "#000";
    probe.fillStyle = `oklch(${lightness(r).toFixed(3)} .16 ${hue(r)})`;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    ratingColours[r] = `rgb(${d[0]},${d[1]},${d[2]})`;
  }
  return ratingColours;
}

export interface ExportOptions { entries: Entries; year: number; layout: Layout; numbers: boolean; scale?: number }

export async function renderHeatmap({ entries, year, layout, numbers, scale = 3 }: ExportOptions) {
  // make sure the label font is ready, or the canvas silently falls back to a system face
  try { await document.fonts.load(`500 11px ${MONO}`); } catch { /* fallback font is fine */ }

  const g0 = geometry(year, layout);
  const left: { text: string; row: number }[] = [];
  const top: { text: string; col: number }[] = [];
  if (g0.colMajor) {
    let last = -9;
    for (let m = 0; m < 12; m++) {
      const d = new Date(year, m, 1);
      const i = Math.round((+d - +new Date(year, 0, 1)) / 864e5);
      const { c } = g0.place(i, d);
      if (c - last < 3) continue;
      top.push({ text: MONTHS[m], col: c });
      last = c;
    }
    if (g0.weeks) [["Mon", 0], ["Wed", 2], ["Fri", 4]].forEach(([text, row]) => left.push({ text: text as string, row: row as number }));
  } else {
    [1, 5, 10, 15, 20, 25, 30].forEach(d => top.push({ text: String(d), col: d - 1 }));
    MONTHS.forEach((text, row) => left.push({ text, row }));
  }

  const leftW = left.length ? (g0.weeks ? 26 : 26) + LABEL_GAP : 0;
  const gridW = g0.cols * CELL + (g0.cols - 1) * GAP;
  const gridH = g0.rows * CELL + (g0.rows - 1) * GAP;
  const W = PAD * 2 + leftW + gridW;
  const H = PAD * 2 + TOP_H + LABEL_GAP + gridH;

  const cv = document.createElement("canvas");
  cv.width = Math.round(W * scale);
  cv.height = Math.round(H * scale);
  const g = cv.getContext("2d")!;
  g.scale(scale, scale);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);

  const gx = PAD + leftW, gy = PAD + TOP_H + LABEL_GAP;
  const cellX = (c: number) => gx + c * (CELL + GAP);
  const cellY = (r: number) => gy + r * (CELL + GAP);

  // labels
  g.fillStyle = INK;
  g.font = `400 10.5px ${MONO}`;
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  for (const l of top) g.fillText(l.text, cellX(l.col), PAD + TOP_H - 3);
  g.textAlign = "right";
  g.textBaseline = "middle";
  for (const l of left) g.fillText(l.text, gx - LABEL_GAP, cellY(l.row) + CELL / 2 + 0.5);

  // cells
  const pal = colours();
  g.textAlign = "center";
  g.font = `500 ${CELL * 0.5}px ${MONO}`;
  for (let i = 0; i < daysIn(year); i++) {
    const d = new Date(year, 0, 1 + i);
    const k = keyOf(d);
    const { c, r } = g0.place(i, d);
    const e = entries[k];
    const x = cellX(c), y = cellY(r);
    g.fillStyle = k > TODAY ? FUTURE : e ? pal[e.r] : EMPTY;
    g.fillRect(x, y, CELL, CELL);
    if (numbers && e) {
      g.fillStyle = "rgba(0,0,0,.62)";
      g.fillText(String(e.r), x + CELL / 2, y + CELL / 2 + 0.5);
    }
  }
  return { canvas: cv, width: W, height: H };
}
