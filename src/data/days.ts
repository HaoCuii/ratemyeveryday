import { prefs } from "../lib/storage";
import { sb } from "../lib/supabase";
import type { Entries } from "../lib/types";
import { LOCAL, S, emit, setNotice } from "../state";
import { deleteNote, loadNotesForYear, notesState, queuePendingNotes, saveNote } from "./notes";

const PAGE = 1000; // matches the project's PostgREST max_rows

/** Load one year of days for these people, unless already loaded. */
export async function ensureYear(ids: string[], year: number) {
  const need = ids.filter(id => !S.loadedYears.has(`${id}:${year}`));
  if (need.length) await fetchDays(need, year);
}

/** Ratings only: notes are never readable here (friends can't, and mine come encrypted from notes.ts). */
export async function fetchDays(ids: string[], year: number) {
  if (!ids.length) return;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("days")
      .select("user_id,day,rating")
      .in("user_id", ids)
      .gte("day", `${year}-01-01`)
      .lte("day", `${year}-12-31`)
      .order("user_id")
      .order("day")
      .range(from, from + PAGE - 1);
    if (error) return setNotice("Couldn’t load some days. Refresh to try again.");
    for (const row of data) (S.days[row.user_id] ??= {})[row.day] = { r: row.rating };
    if (data.length < PAGE) break;
  }
  for (const id of ids) {
    S.loadedYears.add(`${id}:${year}`);
    S.days[id] ??= {};
  }
  if (S.me && ids.includes(S.me)) await loadNotesForYear(year);
  emit();
}

// ---------- signed out: days live in this browser ----------

const LOCAL_KEY = "everyday.localDays";

export function loadLocalDays() {
  S.days[LOCAL] = prefs.get<Entries>(LOCAL_KEY, {});
}
const saveLocal = () => prefs.set(LOCAL_KEY, S.days[LOCAL] ?? {});

/**
 * After signing in, move anything rated in this browser into the account. Days already in the
 * account win (nothing there is overwritten). Notes go into a queue and are encrypted into the
 * account once the notes passphrase is set or unlocked. Returns how many days were moved.
 */
export async function moveLocalDaysToAccount(): Promise<number> {
  const local = prefs.get<Entries>(LOCAL_KEY, {});
  if (!S.me || !Object.keys(local).length) return 0;
  const rows = Object.entries(local).map(([day, e]) => ({ user_id: S.me!, day, rating: e.r, updated_at: new Date().toISOString() }));
  const { error } = await sb.from("days").upsert(rows, { onConflict: "user_id,day", ignoreDuplicates: true });
  if (error) return 0; // keep them in the browser and try again next sign-in
  queuePendingNotes(Object.fromEntries(Object.entries(local).filter(([, e]) => e.n).map(([day, e]) => [day, e.n!])));
  prefs.set(LOCAL_KEY, {});
  for (const k of [...S.loadedYears]) if (k.startsWith(S.me + ":")) S.loadedYears.delete(k);
  return rows.length;
}

/**
 * Optimistic save: update the grid now, roll back if Supabase refuses. Signed out, it saves in the
 * browser. `note` null means "leave the note as it is" (used while notes are locked).
 */
export async function saveDay(day: string, rating: number, note: string | null) {
  const n = note === null ? null : note.slice(0, 140);
  if (!S.me) {
    (S.days[LOCAL] ??= {})[day] = n ? { r: rating, n } : { r: rating };
    saveLocal();
    return emit();
  }
  const mine = (S.days[S.me] ??= {});
  const before = mine[day];
  mine[day] = n === null ? { ...before, r: rating } : n ? { r: rating, n } : { r: rating };
  emit();
  const { error } = await sb.from("days").upsert({ user_id: S.me, day, rating, updated_at: new Date().toISOString() });
  if (error) {
    if (before) mine[day] = before;
    else delete mine[day];
    return setNotice("That rating didn’t save. Check your connection and try again.");
  }
  if (n !== null && notesState() === "unlocked" && n !== (before?.n ?? "")) await saveNote(day, n);
}

export async function clearDay(day: string) {
  if (!S.me) {
    delete S.days[LOCAL]?.[day];
    saveLocal();
    return emit();
  }
  const mine = S.days[S.me] ?? {};
  const before = mine[day];
  delete mine[day];
  emit();
  const { error } = await sb.from("days").delete().eq("user_id", S.me).eq("day", day);
  if (error) {
    if (before) mine[day] = before;
    return setNotice("Couldn’t clear that day. Try again.");
  }
  await deleteNote(day);
}
