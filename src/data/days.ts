import { prefs } from "../lib/storage";
import { sb } from "../lib/supabase";
import type { Entries } from "../lib/types";
import { LOCAL, S, emit, setNotice } from "../state";

const PAGE = 1000; // matches the project's PostgREST max_rows

/** Load one year of days for these people, unless already loaded. */
export async function ensureYear(ids: string[], year: number) {
  const need = ids.filter(id => !S.loadedYears.has(`${id}:${year}`));
  if (need.length) await fetchDays(need, year);
}

export async function fetchDays(ids: string[], year: number) {
  if (!ids.length) return;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("days")
      .select("user_id,day,rating,note")
      .in("user_id", ids)
      .gte("day", `${year}-01-01`)
      .lte("day", `${year}-12-31`)
      .order("user_id")
      .order("day")
      .range(from, from + PAGE - 1);
    if (error) return setNotice("Couldn’t load some days. Refresh to try again.");
    for (const row of data) {
      const mine = (S.days[row.user_id] ??= {});
      mine[row.day] = row.note ? { r: row.rating, n: row.note } : { r: row.rating };
    }
    if (data.length < PAGE) break;
  }
  for (const id of ids) {
    S.loadedYears.add(`${id}:${year}`);
    S.days[id] ??= {};
  }
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
 * account win (nothing there is overwritten). Returns how many days were moved.
 */
export async function moveLocalDaysToAccount(): Promise<number> {
  const local = prefs.get<Entries>(LOCAL_KEY, {});
  const rows = Object.entries(local).map(([day, e]) => ({
    user_id: S.me!, day, rating: e.r, note: e.n ?? null, updated_at: new Date().toISOString(),
  }));
  if (!rows.length || !S.me) return 0;
  const { error } = await sb.from("days").upsert(rows, { onConflict: "user_id,day", ignoreDuplicates: true });
  if (error) return 0; // keep them in the browser and try again next sign-in
  prefs.set(LOCAL_KEY, {});
  for (const k of [...S.loadedYears]) if (k.startsWith(S.me + ":")) S.loadedYears.delete(k);
  return rows.length;
}

/** Optimistic save: update the grid now, roll back if Supabase refuses. Signed out, it saves in the browser. */
export async function saveDay(day: string, rating: number, note: string) {
  const n = note.slice(0, 140);
  if (!S.me) {
    (S.days[LOCAL] ??= {})[day] = n ? { r: rating, n } : { r: rating };
    saveLocal();
    return emit();
  }
  const mine = (S.days[S.me] ??= {});
  const before = mine[day];
  mine[day] = n ? { r: rating, n } : { r: rating };
  emit();
  const { error } = await sb.from("days").upsert({
    user_id: S.me, day, rating, note: n || null, updated_at: new Date().toISOString(),
  });
  if (error) {
    if (before) mine[day] = before;
    else delete mine[day];
    setNotice("That rating didn’t save. Check your connection and try again.");
  }
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
    setNotice("Couldn’t clear that day. Try again.");
  }
}
