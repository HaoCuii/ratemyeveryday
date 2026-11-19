import { createPainting, type PaintingSpec } from "./painting";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RunOptions {
  /** ms of strokes per turn. Long in a worker (nothing else waits on it), short on the page. */
  slice: number;
  /** schedule the next turn (rAF on the page, a timer in a worker) */
  next: (fn: () => void, delayMs: number) => () => void;
  /** paint everything at once and never animate */
  still: boolean;
}

/** The light sways over ~30 s, so a few frames a second is plenty and costs far less. */
const SWAY_FPS = 8;

/** Paint the background into `g`, then keep its light swaying. Returns controls. */
export function runPainting(g: Ctx, spec: PaintingSpec, o: RunOptions) {
  const p = createPainting(spec);
  const img = g.createImageData(spec.W, spec.H);
  const start = performance.now();
  const draw = () => { p.light(img.data, (performance.now() - start) / 1000); g.putImageData(img, 0, 0); };

  if (o.still) {
    while (p.painting()) p.work(1e9);
    draw();
    return { pause() {}, resume() {}, stop() {} };
  }

  let cancel: (() => void) | null = null;
  let paused = false;
  const turn = () => {
    cancel = null;
    if (paused) return;
    if (p.painting()) {
      if (p.work(o.slice)) draw();
      cancel = o.next(turn, 0);
    } else {
      draw();
      cancel = o.next(turn, 1000 / SWAY_FPS);
    }
  };
  draw(); // the underpainting shows immediately
  cancel = o.next(turn, 0);

  return {
    pause() { paused = true; cancel?.(); cancel = null; },
    resume() { if (paused) { paused = false; cancel ??= o.next(turn, 0); } },
    stop() { paused = true; cancel?.(); cancel = null; },
  };
}
