/*
 * End-to-end encryption for notes, using the browser's built-in Web Crypto.
 *
 *   passphrase ──PBKDF2-SHA256 (600k rounds, per-person salt)──▶ AES-256-GCM key
 *
 * The key is created non-extractable: page code can use it but never read its bytes. It's cached in
 * this device's IndexedDB so the passphrase is needed once per device. The passphrase, the key, and
 * plaintext notes never leave the browser; the database only sees ciphertext.
 */

const ITERATIONS = 600_000;
const CHECK_TEXT = "ratemyeveryday:notes-key-ok";

const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export interface Sealed { ct: string; iv: string }

export async function deriveKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations: ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
}

export async function seal(key: CryptoKey, text: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  return { ct: toB64(ct), iv: toB64(iv) };
}

/** Throws if the key is wrong or the data was tampered with (AES-GCM authenticates). */
export async function open(key: CryptoKey, s: Sealed): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(s.iv) }, key, fromB64(s.ct));
  return dec.decode(pt);
}

/** New key material for someone setting their passphrase for the first time. */
export async function createKey(passphrase: string) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, salt);
  const check = await seal(key, CHECK_TEXT);
  return { key, salt, check };
}

/** Returns the key if the passphrase is right, or null if it's wrong. */
export async function unlockKey(passphrase: string, salt: string, check: Sealed): Promise<CryptoKey | null> {
  const key = await deriveKey(passphrase, salt);
  try {
    return (await open(key, check)) === CHECK_TEXT ? key : null;
  } catch {
    return null;
  }
}

// ---------- remember the key on this device (IndexedDB stores CryptoKey objects as-is) ----------

const DB = "ratemyeveryday", STORE = "noteKeys";

function idb(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((ok, fail) => {
    const r = run(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}

export async function loadCachedKey(uid: string): Promise<CryptoKey | null> {
  try { return ((await tx("readonly", s => s.get(uid))) as CryptoKey | undefined) ?? null; } catch { return null; }
}
export async function cacheKey(uid: string, key: CryptoKey) {
  try { await tx("readwrite", s => s.put(key, uid)); } catch { /* private mode: unlock again next visit */ }
}
export async function forgetKey(uid: string) {
  try { await tx("readwrite", s => s.delete(uid)); } catch { /* nothing cached */ }
}
