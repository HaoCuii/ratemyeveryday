import { hue, lightness } from "../lib/color";

/*
 * The oil-paint engine shared by the background and the logo, so both are made of the same paint.
 *
 * A surface holds colour, paint thickness and coverage per pixel. Strokes are laid down as continuous
 * bands of paint split into lanes (each lane its own slightly different mix, staying power and
 * thickness, which leaves bristle grooves), with hand pressure, a wobbling path, frayed edges, dry-brush
 * tails and lanes that drag the wet paint underneath. Thickness is lit like a real surface: raking
 * light plus a wet-oil sheen. That lighting is what makes it read as physical paint.
 */

export type RGB = [number, number, number];

export const prng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** push values away from the middle so both reds and greens show up */
export const stretch = (v: number, k: number) => clamp01((v - 0.5) * k + 0.5);

/** Fractal value noise in [0, 1] that tiles forever. */
export function makeField(seed: number, scale: number) {
  const N = 64;
  const rnd = prng(seed);
  const octaves = [1, 2, 4].map(f => ({ cell: scale / f, data: Float32Array.from({ length: N * N }, () => rnd()) }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    let sum = 0, norm = 0, amp = 1;
    for (const o of octaves) {
      const gx = x / o.cell, gy = y / o.cell;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const tx = smooth(gx - x0), ty = smooth(gy - y0);
      const at = (i: number, j: number) => o.data[(j & (N - 1)) * N + (i & (N - 1))];
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      sum += (top + (bot - top) * ty) * amp;
      norm += amp;
      amp *= 0.45;
    }
    return sum / norm;
  };
}

/** The heatmap scale as plain RGB: `at(v)` blends continuously over 1 → 10, `rating(r)` is one step. */
export function makePalette(dark: boolean) {
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const steps: RGB[] = [];
  for (let r = 1; r <= 10; r++) {
    probe.fillStyle = "#000";
    probe.fillStyle = `oklch(${(lightness(r) + (dark ? -0.2 : 0.04)).toFixed(3)} ${dark ? 0.13 : 0.16} ${hue(r)})`;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    steps.push([d[0], d[1], d[2]]);
  }
  const at = (v: number): RGB => {
    const f = clamp01(v) * 9, i = Math.min(8, Math.floor(f)), t = f - i;
    const a = steps[i], b = steps[i + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  return { at, rating: (r: number): RGB => [...steps[r - 1]] as RGB };
}

export interface StrokeOptions {
  x: number;
  y: number;
  width: number;            // px across the brush
  length: number;           // px along the stroke
  colour: RGB;
  shade?: number;           // overall brightness of this load of paint
  angle: (x: number, y: number) => number; // direction the hand drifts toward, in radians
  rnd: () => number;
  wander: (x: number, y: number) => number; // fine noise for grooves, fraying and clumping
  /** 0..1: how loaded the brush is. Short strokes need more, or they're nothing but dry tail. */
  loaded?: number;
}

export function createSurface(W: number, H: number) {
  const N = W * H;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  const HT = new Float32Array(N); // paint thickness
  const A = new Float32Array(N);  // coverage (0 = bare / transparent)
  const NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);

  const idx = (x: number, y: number) => Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0));

  /** Deposit paint in a small round dab (radius 1 or 2). */
  const dab = (cx: number, cy: number, rad: number, cr: number, cg: number, cb: number, alpha: number, h: number) => {
    const x0 = Math.round(cx), y0 = Math.round(cy), r2 = rad * rad + 0.5;
    for (let dy = -rad; dy <= rad; dy++) {
      const y = y0 + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -rad; dx <= rad; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const x = x0 + dx;
        if (x < 0 || x >= W) continue;
        const a = alpha * (1 - (d2 / r2) * 0.55);
        const i = y * W + x;
        const ca = A[i] < 0.01 ? 1 : a; // on bare canvas the paint is the colour, not a blend with nothing
        R[i] += (cr - R[i]) * ca; G[i] += (cg - G[i]) * ca; B[i] += (cb - B[i]) * ca;
        HT[i] += (h - HT[i]) * a * 0.7;
        A[i] += (1 - A[i]) * a;
      }
    }
  };

  const stroke = (o: StrokeOptions) => {
    const { rnd, wander, width } = o;
    let x = o.x, y = o.y;
    const steps = Math.max(2, Math.round(o.length / 1.45));
    const shade = o.shade ?? 1;
    const M = 40; // lanes across the brush
    const groove = rnd() * 1000;
    const lanes = Array.from({ length: M }, (_, j) => {
      const jit = (rnd() - 0.5) * 26;
      return {
        col: [o.colour[0] + jit, o.colour[1] + jit, o.colour[2] + jit * 0.8] as RGB,
        lasts: 0.55 + rnd() * 0.45 - Math.abs(j / (M - 1) - 0.5) * 0.35 + (o.loaded ?? 0) * 0.55, // edges run dry first
        thick: 0.7 + 0.6 * wander(j * 2.3 + groove, groove),              // bristle grooves
      };
    });

    let ang = o.angle(x, y) + (rnd() - 0.5) * 0.6;
    let turn = 0;
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      // the hand: follow the intended direction loosely, with a slight drifting wobble
      turn += (rnd() - 0.5) * 0.035;
      turn *= 0.9;
      ang += (o.angle(x, y) - ang) * 0.05 + turn;
      const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
      // pressure: the brush lands, swells, and lifts off
      const pressure = Math.min(1, t / 0.12) ** 0.6 * (1 - 0.4 * t);
      const halfW = (width / 2) * (0.6 + 0.4 * pressure);
      // ragged edges: each side of the band frays by a different, changing amount
      const fray1 = 1 - 0.22 * wander(step * 0.45 + groove, 3), fray2 = 1 - 0.22 * wander(step * 0.45 + groove, 7);
      const clump = 0.9 + 0.2 * wander(x * 0.6, y * 0.6); // paint bunches up unevenly along the stroke

      // drag: every lane picks up some wet paint from under it and smears it forward
      for (let j = 0; j < M; j++) {
        const u = (j / (M - 1)) * 2 - 1;
        const under = idx(x + px * u * halfW, y + py * u * halfW);
        const L = lanes[j];
        const drag = (0.03 + 0.06 * t) * A[under];
        L.col[0] += (R[under] - L.col[0]) * drag;
        L.col[1] += (G[under] - L.col[1]) * drag;
        L.col[2] += (B[under] - L.col[2]) * drag;
      }

      for (let s = -halfW + rnd() * 0.8; s <= halfW; s += 1.2 + rnd() * 0.7) {
        const u = s / halfW; // -1 … 1 across the stroke
        if (u < -fray1 || u > fray2) continue;
        const L = lanes[Math.min(M - 1, Math.max(0, Math.round(((u + 1) / 2) * (M - 1))))];
        const load = Math.max(0, 1 - t / L.lasts) ** 0.5 * (0.65 + 0.35 * pressure);
        if (load <= 0.03) continue;
        if (load < 0.35 && rnd() > load * 2.8) continue; // dry-brush break-up in the tail
        const ridge = Math.pow(Math.abs(u), 6) * 0.25;   // paint pushed up at the edges
        const blob = t < 0.05 ? 0.35 * (1 - t / 0.05) : 0; // loaded start
        const h = ((0.45 + 0.6 * load) * L.thick + ridge + blob) * clump;
        dab(x + px * s + (rnd() - 0.5) * 0.9, y + py * s + (rnd() - 0.5) * 0.9, 1,
          L.col[0] * shade, L.col[1] * shade, L.col[2] * shade, Math.min(1, 0.35 + load * 0.75), h);
      }
      x += dx * 1.45;
      y += dy * 1.45;
    }
  };

  const SM = new Float32Array(N); // smoothed thickness, used only for lighting

  /** Recompute surface normals from (lightly smoothed) thickness. */
  const normals = () => {
    for (let y = 0; y < H; y++) {
      const up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W, row = y * W;
      for (let x = 0; x < W; x++) {
        const l = Math.max(0, x - 1), r = Math.min(W - 1, x + 1);
        SM[row + x] = (HT[row + x] * 4 + HT[row + l] + HT[row + r] + HT[up + x] + HT[dn + x]) / 8;
      }
    }
    const S = 2.6; // how strongly thickness bends the light
    for (let y = 0; y < H; y++) {
      const up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W, row = y * W;
      for (let x = 0; x < W; x++) {
        const hx = SM[row + Math.min(W - 1, x + 1)] - SM[row + Math.max(0, x - 1)];
        const hy = SM[dn + x] - SM[up + x];
        const nx = -hx * S, ny = -hy * S, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const i = row + x;
        NX[i] = nx * inv; NY[i] = ny * inv; NZ[i] = inv;
      }
    }
  };

  /** Light the surface into RGBA pixels. `angle` is the light direction; transparent keeps bare areas clear. */
  const shade = (D: Uint8ClampedArray, angle: number, dark: boolean, transparent = false) => {
    let lx = Math.cos(angle) * 0.75, ly = Math.sin(angle) * 0.75, lz = 0.62;
    const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
    let hx = lx, hy = ly, hz = lz + 1; // half vector for the wet-oil highlight
    const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    const specK = (dark ? 0.2 : 0.32) * 255;
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      const nx = NX[i], ny = NY[i], nz = NZ[i];
      let diff = nx * lx + ny * ly + nz * lz;
      if (diff < 0) diff = 0;
      const sh = nx * hx + ny * hy + nz * hz;
      let spec = 0;
      if (sh > 0.92) { // wet highlight: sh^30 by repeated squaring (cheaper than Math.pow)
        const s2 = sh * sh, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8;
        spec = s16 * s8 * s4 * s2 * specK;
      }
      const k = 0.52 + 0.58 * diff;
      D[p] = R[i] * k + spec; D[p + 1] = G[i] * k + spec; D[p + 2] = B[i] * k + spec;
      D[p + 3] = transparent ? A[i] * 300 : 255;
    }
  };

  /**
   * Close pinholes between dabs (only matters on a transparent surface, like the logo): a mostly-bare
   * pixel surrounded by paint takes its neighbours' paint. Outer ragged edges stay ragged, because
   * their neighbours are mostly bare too.
   */
  const fillGaps = (passes = 2) => {
    for (let pass = 0; pass < passes; pass++) {
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (A[i] > 0.6) continue;
          let sa = 0, sr = 0, sg = 0, sb = 0, sh = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const j = i + dy * W + dx, a = A[j];
            sa += a; sr += R[j] * a; sg += G[j] * a; sb += B[j] * a; sh += HT[j] * a;
          }
          if (sa / 8 < 0.45) continue;
          R[i] = sr / sa; G[i] = sg / sa; B[i] = sb / sa; HT[i] = (sh / sa) * 0.92;
          A[i] = Math.max(A[i], Math.min(1, (sa / 8) * 1.15));
        }
      }
    }
  };

  return { W, H, R, G, B, HT, A, stroke, normals, shade, fillGaps };
}
