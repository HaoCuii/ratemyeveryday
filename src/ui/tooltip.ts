import { fmtShort, TODAY } from "../lib/dates";
import { $, h } from "../lib/dom";
import { S } from "../state";
import { canEdit, visibleEntries } from "../view";

/** The hover card: date, rating, and the note (notes are only ever shown here). */
export function showTip(cell: HTMLElement) {
  const k = cell.dataset.k;
  if (!k) return;
  const tip = $("tip");
  const e = visibleEntries()[k];
  const body: (Node | string)[] = [h("div", { class: "font-mono text-[11px] opacity-70" }, fmtShort(k))];
  if (e) {
    body.push(h("div", { class: "font-semibold" }, `${e.r} / 10`));
    // notes are private: never shown on a friend's grid; mine show once unlocked on this device
    if (!S.viewing && e.n) body.push(h("div", { class: "mt-1 whitespace-pre-wrap wrap-anywhere" }, e.n));
    else if (!S.viewing && e.locked) body.push(h("div", { class: "mt-1 opacity-60" }, "Private note · click to unlock"));
  } else {
    const msg = k > TODAY ? "Still ahead" : canEdit() ? "Not rated · click to rate" : "Not rated";
    body.push(h("div", { class: "mt-0.5 opacity-60" }, msg));
  }
  tip.replaceChildren(...body);

  tip.style.left = "0px";
  tip.style.top = "0px";
  tip.classList.add("on");
  const rc = cell.getBoundingClientRect();
  const x = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, rc.left + rc.width / 2 - tip.offsetWidth / 2));
  let y = rc.top - tip.offsetHeight - 8;
  if (y < 8) y = rc.bottom + 8;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}

export const hideTip = () => $("tip").classList.remove("on");
