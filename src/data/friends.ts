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

/** Find people by handle prefix or name substring. Input is reduced to [a-z0-9_] so it can't break the filter. */
export async function searchProfiles(raw: string): Promise<Profile[]> {
  const q = raw.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_ ]/g, "").trim().split(/\s+/)[0] ?? "";
  if (q.length < 2 || !S.me) return [];
  const { data } = await sb
    .from("profiles")
    .select(PROFILE_COLS)
    .or(`handle.ilike.${q}*,name.ilike.*${q}*`)
    .neq("id", S.me)
    .limit(8);
  for (const p of data ?? []) S.profiles[p.id] = p;
  return data ?? [];
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
