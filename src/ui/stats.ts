import { clampRating, paint } from "../lib/color";
import { fmtDay, keyOf, mondayOf, MONTHS, parseKey } from "../lib/dates";
import { $, h } from "../lib/dom";
import { S } from "../state";
import { visibleEntries } from "../view";

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

/** Highest-averaging bucket with at least 3 rated days. */
function best(groups: Record<string, number[]>) {
  let k: string | null = null, v = 0;
  for (const [key, a] of Object.entries(groups)) {
    if (a.length < 3) continue;
    const m = mean(a);
    if (m > v) { v = m; k = key; }
  }
  return k === null ? null : { k, v };
}

export function renderStats() {
  const entries = visibleEntries();
  const keys = Object.keys(entries).filter(k => k.startsWith(S.year + "-")).sort();
  const vals = keys.map(k => entries[k].r);
  const byWeek: Record<string, number[]> = {}, byMonth: Record<string, number[]> = {};
  for (const k of keys) {
    const d = parseKey(k);
    (byWeek[keyOf(mondayOf(d))] ??= []).push(entries[k].r);
    (byMonth[d.getMonth()] ??= []).push(entries[k].r);
  }
  const avg = vals.length ? mean(vals) : null;
  const bw = best(byWeek), bm = best(byMonth);
  const weekLabel = (k: string) => {
    const d = parseKey(k);
    return `${fmtDay(d)}–${fmtDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6))}`;
  };

  const stat = (name: string, value: string, score: number | null, showScore: boolean) => {
    // .heat lives in the components layer, so an empty-state bg utility would override it: pick one or the other
    const dot = h("span", { class: score ? "heat size-2 shrink-0" : "size-2 shrink-0 bg-empty" });
    if (score) paint(dot, clampRating(score));
    return h("span", { class: "inline-flex items-center gap-1.5" },
      dot, name + " ", h("b", { class: "font-medium text-fg" }, value), showScore && score ? " " + score.toFixed(1) : null);
  };

  $("stats").replaceChildren(
    stat("avg", avg === null ? "–" : avg.toFixed(1), avg, false),
    stat("best week", bw ? weekLabel(bw.k) : "–", bw?.v ?? null, true),
    stat("best month", bm ? MONTHS[+bm.k] : "–", bm?.v ?? null, true),
  );
}
