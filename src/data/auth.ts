import type { User } from "@supabase/supabase-js";
import { sb } from "../lib/supabase";
import type { Profile } from "../lib/types";

export async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + location.pathname },
  });
  return error;
}

export const signOut = () => sb.auth.signOut();

/** Fires with the signed-in user, or null — only when that actually changes. */
export function onUserChange(fn: (user: User | null) => void) {
  let current: string | null | undefined;
  sb.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    if ((user?.id ?? null) === current) return;
    current = user?.id ?? null;
    // Supabase calls made inside this callback can deadlock; hop out of it first.
    setTimeout(() => fn(user), 0);
  });
}

export async function getMyProfile(uid: string) {
  return sb.from("profiles").select("id,handle,name,avatar_url").eq("id", uid).maybeSingle();
}

export async function createProfile(user: User, handle: string) {
  const md = user.user_metadata ?? {};
  const row: Profile = {
    id: user.id,
    handle,
    name: String(md.full_name ?? md.name ?? "").slice(0, 60),
    avatar_url: (md.avatar_url ?? md.picture ?? null) as string | null,
  };
  return sb.from("profiles").insert(row).select("id,handle,name,avatar_url").single();
}

/** "Hao Cui" → "hao_cui42". Always satisfies the database's handle rule. */
export function suggestHandle(user: User) {
  const md = user.user_metadata ?? {};
  const base =
    String(md.full_name ?? md.name ?? user.email?.split("@")[0] ?? "friend")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 16) || "friend";
  return (base.length < 3 ? base + "_day" : base) + Math.floor(10 + Math.random() * 89);
}
