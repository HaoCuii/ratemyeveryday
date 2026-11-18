import { clearDay, saveDay } from "../data/days";
import { paint } from "../lib/color";
import { fmtLong, TODAY } from "../lib/dates";
import { $, h } from "../lib/dom";
import { visibleEntries } from "../view";
import { closePops, openPop } from "./popover";

let day = "";
let rating: number | null = null;

const note = () => $<HTMLTextAreaElement>("edNote");

export function openEditor(k: string, anchor: Element) {
  const e = visibleEntries()[k];
  day = k;
  rating = e?.r ?? null;
  $("edTitle").textContent = fmtLong(k);
  $("edSub").textContent = k === TODAY ? "today" : e ? "rated" : "not rated yet";
  note().value = e?.n ?? "";
  $("edClear").hidden = !e;
  renderScale();
  openPop($("editor"), anchor);
  setTimeout(() => (rating ? note() : $("edScale").querySelector("button"))?.focus(), 0);
}

function renderScale() {
  const buttons = Array.from({ length: 10 }, (_, i) => {
    const r = i + 1;
    const b = h("button", {
      type: "button",
      class: "heat h-[34px] w-full font-mono text-xs font-medium text-black/60 transition-transform hover:-translate-y-0.5 aria-pressed:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--fg)]",
      "aria-pressed": String(rating === r),
      "aria-label": `${r} of 10`,
    }, String(r));
    paint(b, r);
    b.addEventListener("click", () => { rating = r; renderScale(); });
    return b;
  });
  $("edScale").replaceChildren(...buttons);
  $<HTMLButtonElement>("edSave").disabled = !rating;
  $("edCount").textContent = `${note().value.length}/140`;
}

export function bindEditor() {
  note().addEventListener("input", () => { $("edCount").textContent = `${note().value.length}/140`; });
  $("edSave").addEventListener("click", () => {
    if (!rating) return;
    void saveDay(day, rating, note().value.trim());
    closePops();
  });
  $("edClear").addEventListener("click", () => { void clearDay(day); closePops(); });
  $("editor").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("edSave").click(); return; }
    // number keys pick a rating (0 = 10) unless typing a note
    if ((e.target as HTMLElement).tagName !== "TEXTAREA" && /^[0-9]$/.test(e.key)) {
      rating = e.key === "0" ? 10 : Number(e.key);
      renderScale();
    }
  });
}
