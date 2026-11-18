import { acceptFriend, findByHandle, loadFriendships, removeFriend, requestFriend, toHandle } from "../data/friends";
import { $, avatar, h } from "../lib/dom";
import type { Profile } from "../lib/types";
import { S, onChange, profileOf } from "../state";
import { openPop } from "./popover";

type Action = [label: string, run: () => Promise<unknown>, primary?: boolean];

let hits: Profile[] = [];
let seq = 0;
const search = () => $<HTMLInputElement>("friendSearch");

export function openFriends(anchor: Element) {
  search().value = "";
  hits = [];
  $("myHandleLine").textContent = S.profile ? `Your handle: @${S.profile.handle}` : "";
  renderList();
  openPop($("friendPop"), anchor);
  setTimeout(() => search().focus(), 0);
  void loadFriendships().then(() => { if (!$("friendPop").hidden) renderList(); });
}

function row(id: string, sub: string | null, actions: Action[]) {
  const p = profileOf(id);
  const btns = actions.map(([text, run, primary]) => {
    const b = h("button", {
      type: "button",
      class: primary ? "border border-fg bg-fg px-3 py-1.5 text-[13px] text-bg" : "border border-line bg-surface px-3 py-1.5 text-[13px]",
    }, text);
    b.addEventListener("click", async () => { b.disabled = true; await run(); renderList(); });
    return b;
  });
  return h("div", { class: "flex items-center gap-2.5 p-1.5 hover:bg-bg" },
    avatar(p.avatar_url, "size-[26px] shrink-0"),
    h("div", { class: "min-w-0 flex-1" },
      h("div", { class: "truncate" }, p.name || "@" + (p.handle ?? "someone")),
      h("small", { class: "font-mono text-[11.5px] text-muted" }, sub ?? (p.handle ? "@" + p.handle : ""))),
    h("div", { class: "flex gap-1.5" }, ...btns));
}

const heading = (t: string) => h("div", { class: "px-1.5 pt-1.5 pb-0.5 text-[11px] tracking-[.06em] text-faint uppercase" }, t);
const empty = (t: string) => h("div", { class: "p-1.5 text-[12.5px] text-muted" }, t);

function renderList() {
  const out: Node[] = [];
  const q = search().value.trim();
  if (q) {
    out.push(heading("Result"));
    if (!hits.length) out.push(empty(toHandle(q) ? `No one has the handle @${toHandle(q)}.` : "Type their full @handle."));
    for (const { id } of hits) {
      if (S.friends.includes(id)) out.push(row(id, "Friends", []));
      else if (S.outgoing.includes(id)) out.push(row(id, "Request sent", [["Cancel", () => removeFriend(id)]]));
      else if (S.incoming.includes(id)) out.push(row(id, "Wants to be friends", [["Accept", () => acceptFriend(id), true]]));
      else out.push(row(id, null, [["Add", () => requestFriend(id), true]]));
    }
  } else {
    if (S.incoming.length) {
      out.push(heading("Requests"));
      for (const id of S.incoming) out.push(row(id, null, [["Decline", () => removeFriend(id)], ["Accept", () => acceptFriend(id), true]]));
    }
    if (S.outgoing.length) {
      out.push(heading("Sent"));
      for (const id of S.outgoing) out.push(row(id, "Waiting for them to accept", [["Cancel", () => removeFriend(id)]]));
    }
    out.push(heading("Friends"));
    if (S.friends.length) for (const id of S.friends) out.push(row(id, null, [["Remove", () => removeFriend(id)]]));
    else out.push(empty("No friends yet. Search for someone’s @handle above, or send them yours."));
  }
  $("friendList").replaceChildren(...out);
}

export function bindFriendsPanel() {
  // live updates (an accept, a new request) refresh the open panel, unless someone is mid-search
  onChange(() => { if (!$("friendPop").hidden && !search().value.trim()) renderList(); });
  search().addEventListener("input", async () => {
    const mine = ++seq;
    // wait for a pause in typing so a partial handle that happens to exist doesn't flash up mid-word
    await new Promise(r => setTimeout(r, 400));
    if (mine !== seq) return;
    const found = await findByHandle(search().value);
    if (mine !== seq) return; // a newer keystroke already answered
    hits = found ? [found] : [];
    renderList();
  });
}
