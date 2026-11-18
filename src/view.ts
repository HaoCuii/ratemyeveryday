import type { Entries } from "./lib/types";
import { LOCAL, S, browserOnly, signedIn } from "./state";

/** Whose grid is on screen right now: a friend's, mine in my account, or mine in this browser. */
export function visibleEntries(): Entries {
  if (!S.me) return S.days[LOCAL] ?? {};
  return S.days[S.viewing ?? S.me] ?? {};
}

/** You can rate your own grid, signed in or not (but not while picking a handle, or on a friend's). */
export const canEdit = () => !S.viewing && (browserOnly() || signedIn());
