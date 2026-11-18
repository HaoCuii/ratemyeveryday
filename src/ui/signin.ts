import { GOOGLE_CLIENT_ID } from "../config";
import { mountGoogleButton, signInWithGoogle } from "../data/auth";
import { $ } from "../lib/dom";
import { closePops } from "./popover";

/**
 * The sign-in prompt. Signing in is optional: it's only needed for friends (and to keep days across
 * devices). Opened from the Friends button or the header's "Sign in" link.
 *
 * It shows Google's own button (Google's screen then names our site). If Google's script can't load
 * (blocked, offline), it falls back to the redirect button.
 */
let mounted = false;

function showError(msg: string | null) {
  $("spErr").textContent = msg ?? "";
  $("spErr").hidden = !msg;
}

export async function openSignIn(reason: "friends" | "account" = "friends") {
  $("spTitle").textContent = reason === "friends" ? "Sign in to add friends" : "Sign in";
  showError(null);
  $("signPop").hidden = false;
  $("scrim").hidden = false;
  if (!mounted) {
    mounted = await mountGoogleButton($("gbtn"), GOOGLE_CLIENT_ID, err => {
      if (err) showError(err);
      else closePops(); // the auth listener takes it from here
    });
    $("google").hidden = mounted;
    $("gbtn").hidden = !mounted;
  }
  if (!mounted) setTimeout(() => $("google").focus(), 0);
}

export function bindSignIn() {
  $("signInTop").addEventListener("click", () => void openSignIn("account"));
  $("spLater").addEventListener("click", closePops);
  $("google").addEventListener("click", async () => {
    const error = await signInWithGoogle(); // leaves the page for Google on success
    if (error) showError("Google sign-in isn’t available right now. Your days are still saved in this browser.");
  });
}
