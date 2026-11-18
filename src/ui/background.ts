import { $ } from "../lib/dom";
import { createSurface, makeField, makePalette, prng, stretch } from "../paint/engine";

/*
 * The background: an oil painting in the heatmap's colours, painted live with the shared paint engine
 * (see paint/engine.ts). A toned underpainting goes down first, then broad strokes, then smaller ones.
 * Once finished, the light sways slowly, as if you're walking past it.
 */

const SEED = 1 + Math.floor(Math.random() * 2147483646); // a new painting each visit, kept across resizes

interface Painting { frame: (t: number) => void; painting: () => boolean }

function paint(g: CanvasRenderingContext2D, W: number, H: number, dark: boolean): Painting {
  const rnd = prng(SEED);
  const palette = makePalette(dark);
  const surface = createSurface(W, H);
  const { R, G, B, HT, A } = surface;
  const mood = makeField(SEED + 11, 560);
  const angleF = makeField(SEED + 12, 360);
  const wander = makeField(SEED + 13, 9);
  const flow = (x: number, y: number) => angleF(x, y) * Math.PI * 4;

  // ground: a thin, toned underpainting over a faint canvas weave
  const tone = dark ? 0.5 : 0.88;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const c = palette.at(stretch(mood(x, y), 2.2));
      R[i] = c[0] * tone; G[i] = c[1] * tone; B[i] = c[2] * tone;
      HT[i] = 0.025 * Math.sin(x * 1.6) * Math.sin(y * 1.6);
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
  const next = () => stroke(1 - done++ / total); // broad first, details last
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) while (done < total) next();
  surface.normals();

  const img = g.createImageData(W, H);
  let lastLit = -Infinity;
  return {
    painting: () => done < total,
    frame(t) {
      if (done < total) {
        // Most of each frame goes to laying down strokes. Re-lighting the whole canvas is the costly
        // part, so while painting it only refreshes a few times a second (and once more at the end).
        const until = performance.now() + 40;
        while (done < total && performance.now() < until) next();
        const now = performance.now();
        if (done < total && now - lastLit < 150) return;
        lastLit = now;
        surface.normals();
      }
      surface.shade(img.data, -2.25 + 0.55 * Math.sin(t * 0.22), dark); // raking light, swaying gently
      g.putImageData(img, 0, 0);
    },
  };
}

// ---------- runner ----------

const FPS = 12;
let painting: Painting | null = null;
let raf = 0, start = 0, lastDraw = 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function build() {
  cancelAnimationFrame(raf);
  const cv = $<HTMLCanvasElement>("mosaic");
  // one canvas pixel per CSS pixel: it's shaded pixel by pixel every frame
  cv.width = innerWidth;
  cv.height = innerHeight;
  const g = cv.getContext("2d")!;
  painting = paint(g, cv.width, cv.height, matchMedia("(prefers-color-scheme: dark)").matches);
  painting.frame(0);
  start = lastDraw = performance.now();
  if (!reducedMotion.matches) raf = requestAnimationFrame(tick);
}

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  // while strokes are still going down, use every frame; after that, the light only needs a few
  if (!painting || (!painting.painting() && now - lastDraw < 1000 / FPS - 2)) return;
  lastDraw = now;
  try {
    painting.frame((now - start) / 1000);
  } catch (e) {
    cancelAnimationFrame(raf); // decoration only: stop quietly rather than break the app
    console.warn("background stopped", e);
  }
}

const safeBuild = () => { try { build(); } catch (e) { console.warn("background skipped", e); } };

export function startBackground() {
  safeBuild();
  let timer: number | undefined;
  addEventListener("resize", () => { clearTimeout(timer); timer = window.setTimeout(safeBuild, 200); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", safeBuild);
  reducedMotion.addEventListener("change", safeBuild);
}
