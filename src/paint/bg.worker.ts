import type { PaintingSpec } from "./painting";
import { runPainting } from "./runner";

/*
 * Paints the background off the page's main thread, straight into the page's canvas (an
 * OffscreenCanvas), so scrolling, hovering and typing never wait on paint.
 */

type Msg =
  | { type: "init"; canvas: OffscreenCanvas }
  | { type: "paint"; spec: PaintingSpec; still: boolean }
  | { type: "pause" }
  | { type: "resume" };

let canvas: OffscreenCanvas | null = null;
let run: ReturnType<typeof runPainting> | null = null;
let hidden = false;

const later = (fn: () => void, ms: number) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); };

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === "init") canvas = m.canvas;
    else if (m.type === "paint" && canvas) {
      run?.stop();
      canvas.width = m.spec.W;
      canvas.height = m.spec.H;
      run = runPainting(canvas.getContext("2d")!, m.spec, { slice: 30, next: later, still: m.still });
      if (hidden) run.pause();
    } else if (m.type === "pause") { hidden = true; run?.pause(); }
    else if (m.type === "resume") { hidden = false; run?.resume(); }
  } catch (err) {
    run?.stop(); // decoration only: stop quietly
    console.warn("background stopped", err);
  }
};
