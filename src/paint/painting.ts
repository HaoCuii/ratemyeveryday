import { createSurface, makeField, paletteFrom, prng, stretch, type RGB } from "./engine";

/*
 * The background painting: an oil painting in the heatmap's colours (see engine.ts). A toned
 * underpainting goes down first, then broad strokes, then smaller ones. Once finished, the light sways
 * slowly, as if you're walking past it. No DOM here, so it can run in a worker.
 */

export interface PaintingSpec { W: number; H: number; dark: boolean; seed: number; steps: RGB[] }

export interface Painting {
  /** still laying down strokes? */
  painting: () => boolean;
  /** Lay strokes for up to `budgetMs`. Returns true when the lighting should be refreshed. */
  work: (budgetMs: number) => boolean;
  /** Light the surface into `D` (RGBA, W*H*4) with the light swayed to time `t` (seconds). */
  light: (D: Uint8ClampedArray, t: number) => void;
}

export function createPainting({ W, H, dark, seed, steps }: PaintingSpec): Painting {
  const rnd = prng(seed);
  const palette = paletteFrom(steps);
  const surface = createSurface(W, H);
  const { R, G, B, HT, A } = surface;
  const mood = makeField(seed + 11, 560);
  const angleF = makeField(seed + 12, 360);
  const wander = makeField(seed + 13, 9);
  const flow = (x: number, y: number) => angleF(x, y) * Math.PI * 4;

  // ground: a thin, toned underpainting over a faint canvas weave
  const tone = dark ? 0.5 : 0.88;
  for (let y = 0; y < H; y++) {
    const wy = 0.025 * Math.sin(y * 1.6);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const c = palette.at(stretch(mood(x, y), 2.2));
      R[i] = c[0] * tone; G[i] = c[1] * tone; B[i] = c[2] * tone;
      HT[i] = wy * Math.sin(x * 1.6);
      A[i] = 1;
    }
  }

  /** `size` 0..1: early strokes are broad and long, later ones smaller. */
  const stroke = (size: number) => {
    const x = rnd() * W, y = rnd() * H;
    surface.stroke({
      x, y, rnd, wander, angle: flow,
      width: 8 + size * 30 + rnd() * 10,
      length: (30 + size * 110 + rnd() * 60) * 1.45,
      colour: palette.at(stretch(mood(x, y), 2.2) + (rnd() - 0.5) * 0.16),
      shade: (dark ? 0.78 : 1) * (0.9 + rnd() * 0.2),
    });
  };

  const total = Math.round((W * H) / 720);
  let done = 0;
  let lastLit = -Infinity;
  let dirty = true; // normals out of date

  return {
    painting: () => done < total,
    work(budgetMs) {
      if (done >= total) return false;
      const until = performance.now() + budgetMs;
      while (done < total && performance.now() < until) stroke(1 - done++ / total); // broad first, details last
      dirty = true;
      // re-lighting the whole canvas is the costly part, so while painting it refreshes a few times a second
      const now = performance.now();
      if (done < total && now - lastLit < 150) return false;
      lastLit = now;
      return true;
    },
    light(D, t) {
      if (dirty) { surface.normals(); dirty = false; }
      surface.shade(D, -2.25 + 0.55 * Math.sin(t * 0.22), dark); // raking light, swaying gently
    },
  };
}
