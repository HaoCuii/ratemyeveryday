import { makeDemo } from "./demo";
import type { Entries } from "./lib/types";
import { S, signedIn } from "./state";

let demo: { year: number; entries: Entries } | null = null;

/** Whose grid is on screen right now: a friend's, mine, or the example year when signed out. */
export function visibleEntries(): Entries {
  if (!S.me) {
    if (demo?.year !== S.year) demo = { year: S.year, entries: makeDemo(S.year) };
    return demo.entries;
  }
  return S.days[S.viewing ?? S.me] ?? {};
}

export const canEdit = () => signedIn() && !S.viewing;
