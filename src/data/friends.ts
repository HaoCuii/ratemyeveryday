import { THIS_YEAR } from "../lib/dates";
import { sb } from "../lib/supabase";
import type { Profile } from "../lib/types";
import { S, emit, setNotice } from "../state";
import { fetchDays } from "./days";

const PROFILE_COLS = "id,handle,name,avatar_url";

/** Re-read my friendships (RLS only returns ones I'm part of), their profiles, and this year's days for friends. */
export async function loadFriendships() {
  if (!S.me) return;
  const { data, error } = await sb.from("friendships").select("requester,addressee,status");
  if (error) return setNotice("Couldn’t load friends. Refresh to try again.");
  const me = S.me;
  const other = (f: { requester: string; addressee: string }) => (f.requester === me ? f.addressee : f.requester);
  S.friends = data.filter(f => f.status === "accepted").map(other);
  S.incoming = data.filter(f => f.status === "pending" && f.addressee === me).map(f => f.requester);
  S.outgoing = data.filter(f => f.status === "pending" && f.requester === me).map(f => f.addressee);
  if (S.viewing && !S.friends.includes(S.viewing)) S.viewing = null;
  await loadProfiles([...S.friends, ...S.incoming, ...S.outgoing]);
  await fetchDays(S.friends.filter(id => !S.loadedYears.has(`${id}:${THIS_YEAR}`)), THIS_YEAR);
  emit();
}

export async function loadProfiles(ids: string[]) {
  const need = [...new Set(ids)].filter(id => !S.profiles[id]);
  if (!need.length) return;
  const { data } = await sb.from("profiles").select(PROFILE_COLS).in("id", need);
  for (const p of data ?? []) S.profiles[p.id] = p;
}

/** Turn what was typed into a handle, or null if it can't be one ("@Hao_Cui " → "hao_cui"). */
export function toHandle(raw: string): string | null {
  const q = raw.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{3,20}$/.test(q) ? q : null;
}

/** Look someone up by their exact handle only, so nobody can browse the list of people by typing a few letters. */
export async function findByHandle(raw: string): Promise<Profile | null> {
  const handle = toHandle(raw);
  if (!handle || !S.me || handle === S.profile?.handle) return null;
  const { data } = await sb.from("profiles").select(PROFILE_COLS).eq("handle", handle).maybeSingle();
  if (data) S.profiles[data.id] = data;
  return data;
}

export async function requestFriend(id: string) {
  if (!S.me) return;
  const { error } = await sb.from("friendships").insert({ requester: S.me, addressee: id });
  if (error && error.code !== "23505") return setNotice("Couldn’t send that request. Try again.");
  if (error) {
    // A row already exists. If they asked me first, accepting is what the person meant.
    await loadFriendships();
    if (S.incoming.includes(id)) return acceptFriend(id);
  }
  S.outgoing = [...new Set([...S.outgoing, id])];
  emit();
}

export async function acceptFriend(id: string) {
  if (!S.me) return;
  const { error } = await sb.from("friendships").update({ status: "accepted" }).eq("requester", id).eq("addressee", S.me);
  if (error) return setNotice("Couldn’t accept that request. Try again.");
  await loadFriendships();
}

/** Decline, cancel, or unfriend — whichever direction the row runs. */
export async function removeFriend(id: string) {
  if (!S.me) return;
  const me = S.me;
  const { error } = await sb
    .from("friendships")
    .delete()
    .or(`and(requester.eq.${me},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${me})`);
  if (error) return setNotice("Couldn’t update that friendship. Try again.");
  if (S.viewing === id) S.viewing = null;
  delete S.days[id];
  for (const k of [...S.loadedYears]) if (k.startsWith(id + ":")) S.loadedYears.delete(k);
  await loadFriendships();
}

// ---------- live updates ----------
// When someone sends, accepts, declines or removes a friendship with me, Supabase Realtime pushes the
// change and the page reloads friendships straight away. A slow poll backs it up in case the realtime
// connection drops (it reconnects on its own, but changes made while it was down would be missed).

let channel: ReturnType<typeof sb.channel> | null = null;
let poll: number | undefined;
let pending: number | undefined;

const refreshSoon = () => {
  clearTimeout(pending); // several changes can arrive together (e.g. an accept); reload once
  pending = window.setTimeout(() => void loadFriendships(), 250);
};

export function watchFriendships() {
  unwatchFriendships();
  if (!S.me) return;
  const me = S.me;
  channel = sb
    .channel(`friendships:${me}`)
    .on("postgres_changes", { event: "*", schema: "everyday", table: "friendships", filter: `addressee=eq.${me}` }, refreshSoon)
    .on("postgres_changes", { event: "*", schema: "everyday", table: "friendships", filter: `requester=eq.${me}` }, refreshSoon)
    .subscribe();
  poll = window.setInterval(() => { if (document.visibilityState === "visible") void loadFriendships(); }, 30_000);
}

export function unwatchFriendships() {
  if (channel) void sb.removeChannel(channel);
  channel = null;
  clearInterval(poll);
  clearTimeout(pending);
}
