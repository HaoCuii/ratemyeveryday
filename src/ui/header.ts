import { ensureYear } from "../data/days";
import { removeFriend } from "../data/friends";
import { cssColor } from "../lib/color";
import { keyOf, NOW, THIS_YEAR } from "../lib/dates";
import { $, avatar, h } from "../lib/dom";
import { prefs } from "../lib/storage";
import type { Entries, LayoutType } from "../lib/types";
import { LOCAL, S, browserOnly, emit, firstName, nameOf, profileOf, signedIn } from "../state";
import { openFriends } from "./friends-panel";
import { openSignIn } from "./signin";
import { hideTip } from "./tooltip";

export function renderHeader() {
  // layout + account controls
  document.querySelectorAll<HTMLButtonElement>("[data-lay]").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.lay === S.layout.type)));
  $("customWrap").hidden = S.layout.type !== "custom";
  const n = $<HTMLInputElement>("customN");
  if (document.activeElement !== n) n.value = String(S.layout.n);
  $<HTMLInputElement>("numToggle").checked = S.nums;
  $("acct").hidden = !signedIn();
  $("signInTop").hidden = !browserOnly();
  if (S.profile) {
    $("acctHandle").textContent = "@" + S.profile.handle;
    const img = $<HTMLImageElement>("acctImg");
    img.hidden = !S.profile.avatar_url;
    if (S.profile.avatar_url) img.src = S.profile.avatar_url;
  }

  // title + year
  $("title").replaceChildren(S.viewing ? `${firstName(S.viewing)}’s ` : "Your ", h("b", {}, String(S.year)));
  $("yearLabel").textContent = String(S.year);
  $<HTMLButtonElement>("nextYear").disabled = S.year >= THIS_YEAR;
  $<HTMLButtonElement>("prevYear").disabled = S.year <= 2000;

  // status line
  $("notice").hidden = !S.notice;
  $("notice").textContent = S.notice;

  renderPeople();
}

/** Last seven days as a tiny strip of squares. */
function miniStrip(entries: Entries) {
  const cells = Array.from({ length: 7 }, (_, i) => {
    const e = entries[keyOf(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - (6 - i)))];
    const c = h("i", { class: "size-[5px] bg-empty" });
    if (e) c.style.background = cssColor(e.r);
    return c;
  });
  return h("span", { class: "inline-grid grid-cols-[repeat(7,5px)] gap-[1.5px]", "aria-hidden": "true" }, ...cells);
}

const chipCls = "inline-flex max-w-full items-center gap-2 border border-line bg-surface py-[5px] pr-2.5 pl-[5px] text-[13px] aria-pressed:border-fg aria-pressed:shadow-[inset_0_0_0_1px_var(--fg)]";

function chip(uid: string) {
  const isMe = uid === S.me || uid === LOCAL;
  const b = h("button", { type: "button", class: chipCls, "aria-pressed": String(isMe ? !S.viewing : S.viewing === uid) },
    avatar(isMe ? S.profile?.avatar_url : profileOf(uid).avatar_url),
    h("span", { class: "max-w-[140px] truncate" }, nameOf(uid)),
    miniStrip(S.days[uid] ?? {}));
  b.addEventListener("click", async () => {
    S.viewing = isMe ? null : uid;
    hideTip();
    emit();
    if (uid !== LOCAL) await ensureYear([uid], S.year);
  });
  return b;
}

const addCls = "inline-flex items-center gap-2 border border-dashed border-line bg-surface px-3 py-[5px] text-[13px] text-muted hover:text-fg";

function renderPeople() {
  const el = $("people");
  // signed out: your browser grid, plus a Friends button that asks you to sign in
  if (browserOnly()) {
    el.hidden = false;
    const add = h("button", { type: "button", id: "addFriend", class: addCls }, "+ Friends");
    add.addEventListener("click", () => openSignIn());
    return el.replaceChildren(chip(LOCAL), add);
  }
  el.hidden = !signedIn();
  if (!signedIn() || !S.me) return el.replaceChildren();

  const add = h("button", { type: "button", id: "addFriend", class: addCls },
    "+ Friends",
    S.incoming.length ? h("span", { class: "bg-fg px-1.5 font-mono text-[11px] text-bg" }, String(S.incoming.length)) : null);
  add.addEventListener("click", () => openFriends(add));

  const remove = S.viewing ? h("button", { type: "button", class: "px-0.5 py-1 text-[13px] text-muted underline decoration-line underline-offset-3 hover:text-fg" }, `Remove ${firstName(S.viewing)}`) : null;
  const viewing = S.viewing;
  remove?.addEventListener("click", () => { if (viewing) void removeFriend(viewing); });

  el.replaceChildren(chip(S.me), ...S.friends.map(chip), add, ...(remove ? [remove] : []));
}

export function bindHeader(changeYear: (dir: 1 | -1) => void) {
  document.querySelectorAll<HTMLButtonElement>("[data-lay]").forEach(b =>
    b.addEventListener("click", () => {
      S.layout.type = b.dataset.lay as LayoutType;
      prefs.set("everyday.layout", S.layout);
      emit();
    }));
  $<HTMLInputElement>("customN").addEventListener("change", e => {
    const input = e.target as HTMLInputElement;
    S.layout.n = Math.max(3, Math.min(60, parseInt(input.value, 10) || 19));
    prefs.set("everyday.layout", S.layout);
    emit();
  });
  $<HTMLInputElement>("numToggle").addEventListener("change", e => {
    S.nums = (e.target as HTMLInputElement).checked;
    prefs.set("everyday.numbers", S.nums);
    emit();
  });
  $("prevYear").addEventListener("click", () => changeYear(-1));
  $("nextYear").addEventListener("click", () => { if (S.year < THIS_YEAR) changeYear(1); });

  // brand mark: nine little rating squares
  $("brandMark").replaceChildren(...[2, 5, 9, 7, 10, 4, 8, 6, 9].map(r => {
    const i = h("i", { class: "size-1.5" });
    i.style.background = cssColor(r);
    return i;
  }));
}
