import { $ } from "../lib/dom";

const anchors = new WeakMap<HTMLElement, Element>();
const watched = new WeakSet<HTMLElement>();

/**
 * Place a popover next to its anchor: below if it fits, otherwise above, otherwise slid up just
 * enough to stay on screen. (On phones it's a bottom sheet instead; see .sheet in styles.css.)
 */
function place(pop: HTMLElement) {
  const anchor = anchors.get(pop);
  if (pop.hidden || innerWidth <= 560 || !anchor) return;
  const rc = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, ht = pop.offsetHeight;
  const x = Math.max(12, Math.min(innerWidth - w - 12, rc.left + rc.width / 2 - w / 2));
  let y = rc.bottom + 10;
  if (y + ht > innerHeight - 12) y = rc.top - ht - 10;          // try above the anchor
  if (y < 12) y = Math.max(12, innerHeight - ht - 12);          // neither fits: keep it on screen
  pop.style.left = x + "px";
  pop.style.top = y + "px";
}

/** Open a popover next to its anchor, and keep it on screen if its contents grow or shrink. */
export function openPop(pop: HTMLElement, anchor?: Element | null) {
  pop.hidden = false;
  $("scrim").hidden = false;
  if (anchor) anchors.set(pop, anchor); else anchors.delete(pop);
  if (!watched.has(pop)) {
    watched.add(pop);
    new ResizeObserver(() => place(pop)).observe(pop); // e.g. the notes passphrase section expanding
  }
  place(pop);
}

export function closePops() {
  if (!$("onboard").hidden) return; // a handle must be chosen before anything else
  $("editor").hidden = true;
  $("friendPop").hidden = true;
  $("sharePop").hidden = true;
  $("signPop").hidden = true;
  $("scrim").hidden = true;
}

export function bindPopovers() {
  $("scrim").addEventListener("click", closePops);
  addEventListener("keydown", e => { if (e.key === "Escape") closePops(); });
}
