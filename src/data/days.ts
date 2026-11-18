import { sb } from "../lib/supabase";
import { S, emit, setNotice } from "../state";

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

/** Optimistic save: update the grid now, roll back if Supabase refuses. */
export async function saveDay(day: string, rating: number, note: string) {
  if (!S.me) return;
  const mine = (S.days[S.me] ??= {});
  const before = mine[day];
  const n = note.slice(0, 140);
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
  if (!S.me) return;
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
