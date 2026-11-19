import { clearDay, saveDay } from "../data/days";
import { notesState, setPassphrase, unlockNotes } from "../data/notes";
import { paint } from "../lib/color";
import { fmtLong, TODAY } from "../lib/dates";
import { $, h } from "../lib/dom";
import { S } from "../state";
import { visibleEntries } from "../view";
import { closePops, openPop } from "./popover";

let day = "";
let rating: number | null = null;
let lockOpen = false;

const note = () => $<HTMLTextAreaElement>("edNote");
const pass1 = () => $<HTMLInputElement>("edPass1");
const pass2 = () => $<HTMLInputElement>("edPass2");

/**
 * How the note field behaves: signed out it's a plain browser note; signed in it's end-to-end
 * encrypted, so it needs a passphrase (set once, then unlocked once per device).
 */
type NoteMode = "plain" | "setup" | "unlock";
function noteMode(): NoteMode {
  if (!S.me) return "plain";
  const s = notesState();
  return s === "unlocked" ? "plain" : s === "none" ? "setup" : "unlock";
}

export function openEditor(k: string, anchor: Element) {
  const e = visibleEntries()[k];
  day = k;
  rating = e?.r ?? null;
  lockOpen = !!e?.locked; // a locked note on this day: go straight to unlocking
  $("edTitle").textContent = fmtLong(k);
  $("edSub").textContent = k === TODAY ? "today" : e ? "rated" : "not rated yet";
  note().value = e?.n ?? "";
  $("edClear").hidden = !e;
  renderNote();
  renderScale();
  openPop($("editor"), anchor);
  setTimeout(() => (rating ? (noteMode() === "plain" ? note() : $("edSave")) : $("edScale").querySelector("button"))?.focus(), 0);
}

function renderNote() {
  const mode = noteMode();
  const plain = mode === "plain";
  note().hidden = !plain;
  $("edCount").hidden = !plain;
  $("edLockOpen").hidden = plain || lockOpen;
  $("edLockOpen").textContent = visibleEntries()[day]?.locked ? "Unlock this day’s note" : "Add a private note";
  $("edLock").hidden = plain || !lockOpen;
  $("edLockErr").textContent = "";
  pass1().value = pass2().value = "";
  pass2().hidden = mode !== "setup";
  pass1().autocomplete = mode === "setup" ? "new-password" : "current-password";
  $("edLockMsg").textContent = mode === "setup"
    ? "Notes are end-to-end encrypted: only you can read them. Not your friends, and not whoever runs ratemyeveryday. Choose a passphrase (8+ characters). If you forget it, your notes can’t be recovered."
    : "Your notes are encrypted. Enter your notes passphrase to read and write them on this device.";
  $("edLockBtn").textContent = mode === "setup" ? "Set passphrase" : "Unlock";
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

async function submitLock() {
  const mode = noteMode();
  const err = (m: string) => { $("edLockErr").textContent = m; };
  const p = pass1().value;
  if (mode === "setup") {
    if (p.length < 8) return err("Use at least 8 characters.");
    if (p !== pass2().value) return err("Those don’t match.");
  } else if (!p) return err("Enter your passphrase.");
  const btn = $<HTMLButtonElement>("edLockBtn");
  btn.disabled = true;
  btn.textContent = "Working…"; // key derivation takes about a second on purpose (it slows down guessing)
  const problem = mode === "setup" ? await setPassphrase(p) : (await unlockNotes(p)) ? null : "That passphrase isn’t right.";
  btn.disabled = false;
  if (problem) { renderNote(); return err(problem); }
  lockOpen = false;
  note().value = visibleEntries()[day]?.n ?? "";
  renderNote();
  renderScale();
  note().focus();
}

export function bindEditor() {
  note().addEventListener("input", () => { $("edCount").textContent = `${note().value.length}/140`; });
  $("edLockOpen").addEventListener("click", () => { lockOpen = true; renderNote(); pass1().focus(); });
  $("edLockBtn").addEventListener("click", () => void submitLock());
  for (const input of [pass1(), pass2()]) {
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); void submitLock(); } });
  }
  $("edSave").addEventListener("click", () => {
    if (!rating) return;
    // while notes are locked, save the rating and leave any existing note untouched
    void saveDay(day, rating, noteMode() === "plain" ? note().value.trim() : null);
    closePops();
  });
  $("edClear").addEventListener("click", () => { void clearDay(day); closePops(); });
  $("editor").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && (e.target as HTMLElement).tagName !== "INPUT") { e.preventDefault(); $("edSave").click(); return; }
    // number keys pick a rating (0 = 10) unless typing
    const tag = (e.target as HTMLElement).tagName;
    if (tag !== "TEXTAREA" && tag !== "INPUT" && /^[0-9]$/.test(e.key)) {
      rating = e.key === "0" ? 10 : Number(e.key);
      renderScale();
    }
  });
}
