import type { User } from "@supabase/supabase-js";
import { THIS_YEAR } from "./lib/dates";
import { prefs } from "./lib/storage";
import type { Entries, Layout, Profile } from "./lib/types";

export interface State {
  me: string | null;              // auth user id; null when signed out
  user: User | null;
  profile: Profile | null;        // my everyday profile; null until a handle is chosen
  days: Record<string, Entries>;  // uid → entries
  loadedYears: Set<string>;       // `${uid}:${year}`
  profiles: Record<string, Profile>;
  friends: string[];
  incoming: string[];             // requests waiting on me
  outgoing: string[];             // requests I've sent
  viewing: string | null;         // a friend's id, or null for me
  year: number;
  layout: Layout;
  nums: boolean;
  notice: string;
}

export const S: State = {
  me: null,
  user: null,
  profile: null,
  days: {},
  loadedYears: new Set(),
  profiles: {},
  friends: [],
  incoming: [],
  outgoing: [],
  viewing: null,
  year: THIS_YEAR,
  layout: { type: "weeks", n: 19, ...prefs.get<Partial<Layout>>("everyday.layout", {}) },
  nums: prefs.get<boolean>("everyday.numbers", true) !== false,
  notice: "",
};

/** Key in S.days for ratings kept in this browser while signed out. */
export const LOCAL = "local";

export const signedIn = () => !!S.me && !!S.profile;
/** Signed out and using the app on this device only. */
export const browserOnly = () => !S.me;

export function resetSession() {
  Object.assign(S, {
    me: null, user: null, profile: null, days: {}, loadedYears: new Set(), profiles: {},
    friends: [], incoming: [], outgoing: [], viewing: null, notice: "",
  } satisfies Partial<State>);
}

// --- change notification: data modules call emit(); main.ts re-renders ---
const listeners = new Set<() => void>();
export const onChange = (fn: () => void) => listeners.add(fn);
export const emit = () => listeners.forEach(fn => fn());

export function setNotice(msg: string) {
  S.notice = msg;
  emit();
}

export const profileOf = (uid: string): Partial<Profile> => S.profiles[uid] ?? {};
export const nameOf = (uid: string | null) =>
  !uid || uid === S.me || uid === LOCAL ? "You" : profileOf(uid).name || "@" + (profileOf(uid).handle ?? "someone");
export const firstName = (uid: string | null) => nameOf(uid).split(" ")[0];
