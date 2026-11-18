import { signInWithGoogle } from "../data/auth";
import { $ } from "../lib/dom";
import { closePops } from "./popover";

/**
 * The sign-in prompt. Signing in is optional: it's only needed for friends (and to keep days across
 * devices). Opened from the Friends button or the header's "Sign in" link.
 */
export function openSignIn(reason: "friends" | "account" = "friends") {
  $("spTitle").textContent = reason === "friends" ? "Sign in to add friends" : "Sign in";
  $("spErr").hidden = true;
  $("signPop").hidden = false;
  $("scrim").hidden = false;
  setTimeout(() => $("google").focus(), 0);
}

export function bindSignIn() {
  $("signInTop").addEventListener("click", () => openSignIn("account"));
  $("spLater").addEventListener("click", closePops);
  $("google").addEventListener("click", async () => {
    const error = await signInWithGoogle(); // leaves the page for Google on success
    if (error) {
      $("spErr").textContent = "Google sign-in isn’t available right now. Your days are still saved in this browser.";
      $("spErr").hidden = false;
    }
  });
}
