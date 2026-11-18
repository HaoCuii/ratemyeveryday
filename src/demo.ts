import { keyOf, TODAY } from "./lib/dates";
import type { Entries } from "./lib/types";

/** A believable example year for the signed-out view (the sign-in box says it's an example). */
export function makeDemo(year: number): Entries {
  let s = 99;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const e: Entries = {};
  let mood = 6;
  for (let d = new Date(year, 0, 1); d.getFullYear() === year && keyOf(d) <= TODAY; d.setDate(d.getDate() + 1)) {
    mood += (6.4 + Math.sin(((d.getMonth() - 2) / 12) * 2 * Math.PI) * 1.2 - mood) * 0.3 + (rnd() - 0.5) * 3;
    if (rnd() < 0.1) continue;
    e[keyOf(d)] = { r: Math.max(1, Math.min(10, Math.round(mood))) };
  }
  const notes: Record<string, string> = {
    "02-14": "Dinner with friends", "05-23": "Beach day", "08-09": "Got the offer!", "10-31": "Went as a traffic cone",
  };
  for (const [md, n] of Object.entries(notes)) {
    const k = `${year}-${md}`;
    if (e[k]) e[k].n = n;
  }
  return e;
}
