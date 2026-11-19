import { cacheKey, createKey, forgetKey, loadCachedKey, open, seal, unlockKey, type Sealed } from "../lib/notecrypt";
import { prefs } from "../lib/storage";
import { sb } from "../lib/supabase";
import { S, emit, setNotice } from "../state";

/*
 * My notes, end-to-end encrypted. Ratings live in everyday.days (friends can read them); notes live
 * only in everyday.notes as ciphertext that only my browser can open with my passphrase-derived key.
 */

let key: CryptoKey | null = null;
let setUp: boolean | null = null;            // has this account chosen a notes passphrase? null = not known yet
const sealed: Record<string, Sealed> = {};   // my encrypted notes, by day
const PENDING = "everyday.pendingNotes";     // notes written signed-out, waiting to be encrypted into the account

export type NotesState = "unlocked" | "locked" | "none" | "unknown";
export const notesState = (): NotesState => (key ? "unlocked" : setUp === true ? "locked" : setUp === false ? "none" : "unknown");

/** After sign-in: pick up this device's remembered key, and learn whether a passphrase exists. */
export async function initNotes() {
  key = null;
  setUp = null;
  for (const d of Object.keys(sealed)) delete sealed[d];
  if (!S.me) return;
  const { data } = await sb.from("note_keys").select("user_id").maybeSingle();
  setUp = !!data;
  if (setUp) key = await loadCachedKey(S.me);
  if (key) await afterUnlock();
  emit();
}

/** Load my encrypted notes for a year and open them if unlocked (otherwise mark those days as locked). */
export async function loadNotesForYear(year: number) {
  if (!S.me) return;
  const { data, error } = await sb.from("notes").select("day,ct,iv").gte("day", `${year}-01-01`).lte("day", `${year}-12-31`);
  if (error) return;
  for (const row of data) sealed[row.day] = { ct: row.ct, iv: row.iv };
  await applyNotes();
}

async function applyNotes() {
  if (!S.me) return;
  const mine = (S.days[S.me] ??= {});
  for (const [day, s] of Object.entries(sealed)) {
    const e = mine[day];
    if (!e) continue;
    if (!key) { e.locked = true; delete e.n; continue; }
    try { e.n = await open(key, s); delete e.locked; }
    catch { e.locked = true; } // can't open: leave it locked rather than show garbage
  }
  emit();
}

/** First time: choose a passphrase. */
export async function setPassphrase(pass: string): Promise<string | null> {
  if (!S.me) return "Sign in first.";
  const made = await createKey(pass);
  const { error } = await sb.from("note_keys").insert({
    user_id: S.me, salt: made.salt, check_ct: made.check.ct, check_iv: made.check.iv,
  });
  if (error) return error.code === "23505" ? "A passphrase is already set. Use Unlock instead." : "Couldn’t save. Try again.";
  setUp = true;
  key = made.key;
  await cacheKey(S.me, key);
  await afterUnlock();
  return null;
}

/** Later, or on another device: unlock with the passphrase. Returns false if it's wrong. */
export async function unlockNotes(pass: string): Promise<boolean> {
  if (!S.me) return false;
  const { data } = await sb.from("note_keys").select("salt,check_ct,check_iv").maybeSingle();
  if (!data) return false;
  const k = await unlockKey(pass, data.salt, { ct: data.check_ct, iv: data.check_iv });
  if (!k) return false;
  key = k;
  await cacheKey(S.me, k);
  await afterUnlock();
  return true;
}

/** On sign-out: forget the key on this device. */
export async function lockNotes() {
  if (S.me) await forgetKey(S.me);
  key = null;
}

/** Once a key is available: open notes, and encrypt any notes that were still plaintext. */
async function afterUnlock() {
  if (!S.me || !key) return;
  // 1. notes written before encryption existed (plaintext in days.note): encrypt, store, then wipe
  const { data: legacy } = await sb.rpc("my_legacy_notes");
  for (const row of legacy ?? []) {
    if (await putNote(row.day, row.note)) {
      await sb.from("days").update({ note: null }).eq("user_id", S.me).eq("day", row.day);
    }
  }
  // 2. notes written while signed out in this browser: encrypt into the account (an existing note wins)
  const pending = prefs.get<Record<string, string>>(PENDING, {});
  const left: Record<string, string> = {};
  for (const [day, text] of Object.entries(pending)) {
    if (sealed[day]) continue;
    if (!(await putNote(day, text))) left[day] = text;
  }
  prefs.set(PENDING, left);
  await applyNotes();
}

async function putNote(day: string, text: string): Promise<boolean> {
  if (!S.me || !key) return false;
  const s = await seal(key, text.slice(0, 140));
  const { error } = await sb.from("notes").upsert({ user_id: S.me, day, ct: s.ct, iv: s.iv, updated_at: new Date().toISOString() });
  if (error) return false;
  sealed[day] = s;
  return true;
}

/** Save (or clear, with empty text) my note for a day. Needs the notes to be unlocked. */
export async function saveNote(day: string, text: string) {
  if (!S.me || !key) return;
  if (text) {
    if (!(await putNote(day, text))) setNotice("Your note didn’t save. Try again.");
  } else {
    await deleteNote(day);
  }
}

export async function deleteNote(day: string) {
  if (!S.me) return;
  await sb.from("notes").delete().eq("user_id", S.me).eq("day", day);
  delete sealed[day];
}

/** Notes rated signed-out wait here until the account's notes are unlocked. */
export function queuePendingNotes(notes: Record<string, string>) {
  if (!Object.keys(notes).length) return;
  prefs.set(PENDING, { ...prefs.get<Record<string, string>>(PENDING, {}), ...notes });
}
