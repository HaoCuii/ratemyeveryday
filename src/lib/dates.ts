export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Local-date key, "YYYY-MM-DD". Sorts correctly as a string. */
export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const NOW = new Date();
export const TODAY = keyOf(NOW);
export const THIS_YEAR = NOW.getFullYear();

export const isLeap = (y: number) => new Date(y, 1, 29).getMonth() === 1;
export const daysIn = (y: number) => (isLeap(y) ? 366 : 365);

export const fmtLong = (k: string) =>
  parseKey(k).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
export const fmtShort = (k: string) =>
  parseKey(k).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
export const fmtDay = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

/** Monday of the week containing d. */
export const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
