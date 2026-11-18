import { createProfile, suggestHandle } from "../data/auth";
import { $ } from "../lib/dom";
import { S, emit } from "../state";

const input = () => $<HTMLInputElement>("obHandle");
let onDone: () => void = () => {};

/** Modal shown once, right after a person's first Google sign-in. */
export function openOnboarding(done: () => void) {
  if (!S.user) return;
  onDone = done;
  input().value = suggestHandle(S.user);
  $("obErr").hidden = true;
  $("onboard").hidden = false;
  $("scrim").hidden = false;
  $("scrim").classList.add("dim");
  setTimeout(() => input().select(), 0);
}

export function closeOnboarding() {
  $("onboard").hidden = true;
  $("scrim").hidden = true;
  $("scrim").classList.remove("dim");
}

export function bindOnboarding() {
  input().addEventListener("input", () => { input().value = input().value.toLowerCase().replace(/[^a-z0-9_]/g, ""); });
  input().addEventListener("keydown", e => { if (e.key === "Enter") $("obSave").click(); });
  $("obSave").addEventListener("click", async () => {
    const handle = input().value.trim();
    const fail = (msg: string) => { $("obErr").textContent = msg; $("obErr").hidden = false; };
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) return fail("Use 3 to 20 lowercase letters, numbers or underscores.");
    if (!S.user) return;
    const btn = $<HTMLButtonElement>("obSave");
    btn.disabled = true;
    const { data, error } = await createProfile(S.user, handle);
    btn.disabled = false;
    if (error) return fail(error.code === "23505" ? `@${handle} is taken. Try another.` : "Couldn’t save your handle. Try again.");
    S.profile = data;
    S.profiles[data.id] = data;
    closeOnboarding();
    emit();
    onDone();
  });
}
