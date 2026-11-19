import type { Database } from "./database.types";

export type Profile = Pick<Database["everyday"]["Tables"]["profiles"]["Row"], "id" | "handle" | "name" | "avatar_url">;

/** One rated day: rating 1–10 and an optional note. */
export interface Entry { r: number; n?: string; locked?: boolean } // locked: a note exists but is encrypted and not unlocked here
/** Date key "YYYY-MM-DD" → entry. */
export type Entries = Record<string, Entry>;

export type LayoutType = "weeks" | "months" | "custom";
export interface Layout { type: LayoutType; n: number }
