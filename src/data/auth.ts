import type { User } from "@supabase/supabase-js";
import { sb } from "../lib/supabase";
import type { Profile } from "../lib/types";

/** Fallback sign-in: a full-page redirect through Supabase (Google's screen then shows the Supabase address). */
export async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + location.pathname },
  });
  return error;
}

// ---------- Google's own sign-in button ----------
// Google signs the person in on our domain and hands back an ID token, which Supabase exchanges for a
// session. Google's screen then shows ratemyeveryday instead of the Supabase project address.

interface GoogleId {
  initialize(o: Record<string, unknown>): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
}
declare global { interface Window { google?: { accounts: { id: GoogleId } } } }

let gisLoad: Promise<GoogleId> | null = null;
function loadGoogleIdentity(): Promise<GoogleId> {
  return (gisLoad ??= new Promise((ok, fail) => {
    if (window.google?.accounts?.id) return ok(window.google.accounts.id);
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? ok(window.google.accounts.id) : fail(new Error("Google sign-in unavailable")));
    s.onerror = () => fail(new Error("Google sign-in couldn’t load"));
    document.head.append(s);
  }));
}

const sha256hex = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map(b => b.toString(16).padStart(2, "0")).join("");

/**
 * Render Google's button into `el`. Resolves true if it rendered; false means use the redirect fallback.
 * `onDone` gets null on success, or an error message.
 */
export async function mountGoogleButton(el: HTMLElement, clientId: string, onDone: (err: string | null) => void) {
  try {
    const gis = await loadGoogleIdentity();
    // a fresh nonce ties Google's token to this attempt; Google gets the hash, Supabase checks the raw value
    const raw = crypto.randomUUID();
    gis.initialize({
      client_id: clientId,
      nonce: await sha256hex(raw),
      ux_mode: "popup",
      use_fedcm_for_button: true,
      callback: async (res: { credential?: string }) => {
        if (!res.credential) return onDone("Google didn’t return a sign-in. Try again.");
        const { error } = await sb.auth.signInWithIdToken({ provider: "google", token: res.credential, nonce: raw });
        onDone(error ? "Couldn’t finish signing in. Try again." : null);
      },
    });
    el.replaceChildren();
    gis.renderButton(el, { type: "standard", theme: "filled_black", size: "large", text: "continue_with", shape: "rectangular", logo_alignment: "left" });
    return true;
  } catch {
    return false;
  }
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
