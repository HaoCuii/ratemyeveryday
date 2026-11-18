import { hue, lightness } from "../lib/color";
import { $ } from "../lib/dom";

type RGB = [number, number, number];

// 4×4 Bayer matrix for ordered dithering, the classic retro gradient look.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/**
 * Pixel-art sunset in the rating palette: red sky easing to gold, a striped retro sun,
 * clouds, and four layers of green hills with pines. Drawn at low resolution and scaled up.
 */
function draw() {
  const cv = $<HTMLCanvasElement>("mosaic");
  const P = innerWidth < 600 ? 5 : 7; // screen pixels per art pixel
  const w = Math.ceil(innerWidth / P), ht = Math.ceil(innerHeight / P);
  cv.width = w;
  cv.height = ht;
  const g = cv.getContext("2d");
  if (!g) return;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;

  // Resolve oklch palette colours to RGB once, through a 1×1 probe canvas.
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const cache = new Map<string, RGB>();
  const rgb = (r: number, dl = 0, chroma = 0.16): RGB => {
    const L = Math.max(0.12, Math.min(0.97, lightness(r) + dl + (dark ? -0.26 : 0.04)));
    const key = `${r}|${L.toFixed(3)}|${chroma}`;
    let c = cache.get(key);
    if (!c) {
      probe.fillStyle = "#000";
      probe.fillStyle = `oklch(${L.toFixed(3)} ${(dark ? chroma * 0.8 : chroma).toFixed(3)} ${hue(r)})`;
      probe.fillRect(0, 0, 1, 1);
      const d = probe.getImageData(0, 0, 1, 1).data;
      c = [d[0], d[1], d[2]];
      cache.set(key, c);
    }
    return c;
  };

  let seed = 1717;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const img = g.createImageData(w, ht);
  const D = img.data;
  const put = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= w || y >= ht) return;
    const i = (y * w + x) * 4;
    D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
  };
  /** rating value with a fractional part → dithered between the two neighbouring ratings */
  const mix = (v: number, x: number, y: number) => { const lo = Math.floor(v); return v - lo > dither(x, y) ? lo + 1 : lo; };

  // sky
  const horizon = Math.round(ht * 0.62);
  for (let y = 0; y < ht; y++) {
    const v = 1.6 + Math.min(1, y / horizon) * 4.2;
    for (let x = 0; x < w; x++) put(x, y, rgb(mix(v, x, y), 0.1, 0.12));
  }

  // clouds
  for (let i = 0; i < Math.max(3, Math.round(w / 45)); i++) {
    const cx = Math.floor(rnd() * w), cy = Math.floor(ht * (0.08 + rnd() * 0.3)), cw = 8 + Math.floor(rnd() * 14);
    const top = rgb(6, 0.28, 0.04), under = rgb(5, 0.16, 0.06);
    for (const [s, dy] of [[0.5, -2], [0.8, -1], [1, 0], [0.9, 1]]) {
      const half = Math.round((cw * s) / 2);
      for (let dx = -half; dx <= half; dx++) put(cx + dx + (dy > 0 ? 1 : 0), cy + dy, dy > 0 ? under : top);
    }
  }

  // striped sun
  const sr = Math.max(8, Math.round(Math.min(w, ht) * 0.14));
  const sx = Math.round(w * 0.7), sy = Math.round(horizon - sr * 0.35);
  const step = Math.max(3, Math.round(sr / 4));
  for (let y = sy - sr; y <= sy + sr; y++) {
    for (let x = sx - sr; x <= sx + sr; x++) {
      const dx = x - sx, dy = y - sy;
      if (dx * dx + dy * dy > sr * sr) continue;
      if (dy > 0 && dy % step < 1 + Math.floor((dy / sr) * 2.5)) continue;
      put(x, y, rgb(mix(6.2 - ((dy + sr) / (2 * sr)) * 2.4, x, y), 0.14, 0.15));
    }
  }

  // hills, back to front
  const layers = [
    { base: horizon + ht * 0.01, amp: ht * 0.06, f: 0.018, r: 6, dl: 0.04 },
    { base: horizon + ht * 0.08, amp: ht * 0.05, f: 0.027, r: 7, dl: 0 },
    { base: horizon + ht * 0.17, amp: ht * 0.045, f: 0.035, r: 9, dl: -0.05 },
    { base: horizon + ht * 0.28, amp: ht * 0.04, f: 0.042, r: 10, dl: -0.12 },
  ];
  layers.forEach((L, li) => {
    const ph = rnd() * 10, ph2 = rnd() * 10;
    const ridge: number[] = [];
    for (let x = 0; x < w; x++) {
      const t = Math.round(L.base - L.amp * (Math.sin(x * L.f + ph) + 0.5 * Math.sin(x * L.f * 2.3 + ph2)));
      ridge[x] = t;
      for (let y = Math.max(0, t); y < ht; y++) {
        const shade = Math.min(1, (y - t) / (ht * 0.12)) > dither(x, y) ? -0.05 : 0;
        put(x, y, y === t ? rgb(L.r, L.dl + 0.09) : rgb(L.r, L.dl + shade));
      }
    }
    if (li === 0) return;
    // pines on the nearer hills
    const dk = rgb(10, L.dl - 0.22), lt = rgb(9, L.dl - 0.1), trunk = rgb(2, -0.2, 0.08);
    for (let i = 0; i < Math.round(w / (li === 3 ? 12 : 22)); i++) {
      const x = Math.floor(rnd() * w), tall = Math.round((3 + rnd() * 4) * (1 + li * 0.4)), base = ridge[x];
      put(x, base, trunk);
      put(x, base - 1, trunk);
      for (let j = 0; j < tall; j++) {
        const half = Math.floor((tall - j) / 2.6);
        for (let dx = -half; dx <= half; dx++) put(x + dx, base - 2 - j, dx < 0 ? lt : dk);
      }
    }
  });

  g.putImageData(img, 0, 0);
}

/** The background is decoration: if it ever fails, the app carries on without it. */
const safeDraw = () => { try { draw(); } catch (e) { console.warn("background skipped", e); } };

export function startBackground() {
  safeDraw();
  let t: number | undefined;
  addEventListener("resize", () => { clearTimeout(t); t = window.setTimeout(safeDraw, 120); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", safeDraw);
}
