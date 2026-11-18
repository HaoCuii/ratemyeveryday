// Rating → colour. 1 is red, 10 is green, passing through amber; the middle is lifted so yellow doesn't go muddy.

export const hue = (r: number) => 25 + ((r - 1) / 9) * 120;
export const lightness = (r: number) => 0.64 + 0.12 * Math.sin(((r - 1) / 9) * Math.PI);

/** A CSS colour that follows the theme's --lshift. */
export const cssColor = (r: number) => `oklch(calc(${lightness(r).toFixed(3)} + var(--lshift)) .16 ${hue(r)})`;

/** Set the custom properties `.heat` / `.cell[data-r]` read, and tag the element with its rating. */
export function paint(el: HTMLElement, r: number) {
  el.style.setProperty("--h", String(hue(r)));
  el.style.setProperty("--L", lightness(r).toFixed(3));
  el.dataset.r = String(r);
}

export const clampRating = (a: number) => Math.max(1, Math.min(10, Math.round(a)));
