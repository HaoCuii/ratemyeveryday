import { $ } from "../lib/dom";
import { paletteSteps } from "../paint/engine";
import type { PaintingSpec } from "../paint/painting";
import { runPainting } from "../paint/runner";

/*
 * The oil-paint background (see paint/painting.ts). It's painted in a worker when the browser can hand
 * a canvas to one, so the page itself stays responsive; otherwise on the page in small slices.
 */

const SEED = 1 + Math.floor(Math.random() * 2147483646); // a new painting each visit, kept across resizes
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const darkScheme = matchMedia("(prefers-color-scheme: dark)");

const spec = (): PaintingSpec => {
  const dark = darkScheme.matches;
  // one canvas pixel per CSS pixel: it's shaded pixel by pixel
  return { W: innerWidth, H: innerHeight, dark, seed: SEED, steps: paletteSteps(dark) };
};

interface Painter { paint: () => void; pause: () => void; resume: () => void }

function workerPainter(cv: HTMLCanvasElement): Painter | null {
  if (!("transferControlToOffscreen" in cv) || typeof Worker === "undefined") return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL("../paint/bg.worker.ts", import.meta.url), { type: "module" });
    const off = cv.transferControlToOffscreen();
    worker.postMessage({ type: "init", canvas: off }, [off]);
  } catch {
    return null;
  }
  return {
    paint: () => worker.postMessage({ type: "paint", spec: spec(), still: reducedMotion.matches }),
    pause: () => worker.postMessage({ type: "pause" }),
    resume: () => worker.postMessage({ type: "resume" }),
  };
}

function pagePainter(cv: HTMLCanvasElement): Painter {
  let run: ReturnType<typeof runPainting> | null = null;
  const nextFrame = (fn: () => void, ms: number) => {
    // short slices so a frame is never held up for long
    let raf = 0;
    const id = setTimeout(() => { raf = requestAnimationFrame(fn); }, ms);
    return () => { clearTimeout(id); cancelAnimationFrame(raf); };
  };
  return {
    paint() {
      run?.stop();
      const s = spec();
      cv.width = s.W;
      cv.height = s.H;
      try {
        run = runPainting(cv.getContext("2d")!, s, { slice: 10, next: nextFrame, still: reducedMotion.matches });
      } catch (e) { console.warn("background skipped", e); }
    },
    pause: () => run?.pause(),
    resume: () => run?.resume(),
  };
}

export function startBackground() {
  const cv = $<HTMLCanvasElement>("mosaic");
  const painter = workerPainter(cv) ?? pagePainter(cv);
  const repaint = () => { try { painter.paint(); } catch (e) { console.warn("background skipped", e); } };
  repaint();

  let timer: number | undefined;
  let lastW = innerWidth, lastH = innerHeight;
  addEventListener("resize", () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      // phones resize by a few px as the address bar slides; only repaint for a real change
      if (Math.abs(innerWidth - lastW) < 2 && Math.abs(innerHeight - lastH) < 120) return;
      lastW = innerWidth; lastH = innerHeight;
      repaint();
    }, 250);
  });
  darkScheme.addEventListener("change", repaint);
  reducedMotion.addEventListener("change", repaint);
  // no point animating a tab nobody's looking at
  document.addEventListener("visibilitychange", () => (document.hidden ? painter.pause() : painter.resume()));
}
