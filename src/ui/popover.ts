import { $ } from "../lib/dom";

/** Open a popover next to its anchor (or as a bottom sheet on phones — see .sheet in styles.css). */
export function openPop(pop: HTMLElement, anchor?: Element | null) {
  pop.hidden = false;
  $("scrim").hidden = false;
  if (innerWidth <= 560 || !anchor) return;
  const rc = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, ht = pop.offsetHeight;
  const x = Math.max(12, Math.min(innerWidth - w - 12, rc.left + rc.width / 2 - w / 2));
  let y = rc.bottom + 10;
  if (y + ht > innerHeight - 12) y = Math.max(12, rc.top - ht - 10);
  pop.style.left = x + "px";
  pop.style.top = y + "px";
}

export function closePops() {
  if (!$("onboard").hidden) return; // a handle must be chosen before anything else
  $("editor").hidden = true;
  $("friendPop").hidden = true;
  $("scrim").hidden = true;
}

export function bindPopovers() {
  $("scrim").addEventListener("click", closePops);
  addEventListener("keydown", e => { if (e.key === "Escape") closePops(); });
}
