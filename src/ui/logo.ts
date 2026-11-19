import { createSurface, makeField, makePalette, prng } from "../paint/engine";

/*
 * The logo: nine short strokes of the same oil paint as the background (same engine), one per rating
 * colour, laid out roughly three by three. Each is a real brush stroke: a loaded start, a tapering
 * frayed body, a dry broken tail, and a slight tilt. So no two are the same shape and none is square.
 * Fixed seed: it's identical every time.
 */

const RATINGS = [2, 5, 9, 7, 10, 4, 8, 6, 9];

/** Paint the logo into `cv`, displayed at `size` CSS pixels. */
export function drawLogo(cv: HTMLCanvasElement, size: number, dpr = Math.max(1, devicePixelRatio || 1)) {
  const out = Math.round(size * dpr);
  const SS = 3;                 // paint at 3× and scale down, for clean edges at small sizes
  const W = out * SS, H = out * SS;
  const surface = createSurface(W, H);
  const palette = makePalette(false);
  const rnd = prng(20260117);
  const wander = makeField(4242, 9 * SS / 3);

  const pad = W * 0.04;
  const cell = (W - pad * 2) / 3;
  RATINGS.forEach((rating, k) => {
    const col = k % 3, row = Math.floor(k / 3);
    const tilt = (rnd() - 0.5) * 0.5;                         // each stroke leans differently
    const cy = pad + row * cell + cell * (0.5 + (rnd() - 0.5) * 0.18);
    const x = pad + col * cell + cell * (0.02 + rnd() * 0.08); // start near the cell’s left edge
    surface.stroke({
      x, y: cy - Math.sin(tilt) * cell * 0.4,
      width: cell * (0.74 + rnd() * 0.22),
      length: cell * (0.7 + rnd() * 0.25),
      colour: palette.rating(rating),
      shade: 0.95 + rnd() * 0.1,
      angle: () => tilt,
      loaded: 1,
      rnd, wander,
    });
  });
  surface.fillGaps();
  surface.normals();

  const big = document.createElement("canvas");
  big.width = W; big.height = H;
  const bg = big.getContext("2d")!;
  const img = bg.createImageData(W, H);
  surface.shade(img.data, -2.25, false, true);
  bg.putImageData(img, 0, 0);

  cv.width = cv.height = out;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.clearRect(0, 0, out, out);
  g.drawImage(big, 0, 0, out, out);
}

/** Paint the header logo and use the same painting as the browser-tab icon. */
export function mountLogo(cv: HTMLCanvasElement) {
  drawLogo(cv, 26);
  // the tab icon can wait until the page is idle (index.html already points at a static one)
  const later = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500));
  later(() => {
    const fav = document.createElement("canvas");
    drawLogo(fav, 32, 2);
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.append(link); }
    link.href = fav.toDataURL("image/png");
  });
}
