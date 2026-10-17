export interface ForceEdge {
  a: string;
  b: string;
  weight?: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Small deterministic Fruchterman–Reingold layout for a few dozen nodes.
 * Starts from a circle (so the result is stable between renders) and fits
 * the result into a width × height box with `pad` margin.
 */
export function forceLayout(
  ids: string[],
  edges: ForceEdge[],
  { width, height, pad = 30, iterations = 300 }: { width: number; height: number; pad?: number; iterations?: number },
): Map<string, Point> {
  const n = ids.length;
  const out = new Map<string, Point>();
  if (n === 0) return out;
  if (n === 1) {
    out.set(ids[0], { x: width / 2, y: height / 2 });
    return out;
  }
  const index = new Map(ids.map((id, i) => [id, i]));
  const xs = ids.map((_, i) => Math.cos((2 * Math.PI * i) / n));
  const ys = ids.map((_, i) => Math.sin((2 * Math.PI * i) / n));
  const links = edges
    .map((e) => ({ i: index.get(e.a), j: index.get(e.b), w: Math.log2(1 + (e.weight ?? 1)) }))
    .filter((l): l is { i: number; j: number; w: number } => l.i !== undefined && l.j !== undefined && l.i !== l.j);

  const k = Math.sqrt(4 / n);
  let temp = 0.2;
  for (let it = 0; it < iterations; it++) {
    const dx = new Array<number>(n).fill(0);
    const dy = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ddx = xs[i] - xs[j];
        const ddy = ys[i] - ys[j];
        const d = Math.max(1e-3, Math.hypot(ddx, ddy));
        const f = (k * k) / d;
        dx[i] += (ddx / d) * f;
        dy[i] += (ddy / d) * f;
        dx[j] -= (ddx / d) * f;
        dy[j] -= (ddy / d) * f;
      }
    }
    for (const { i, j, w } of links) {
      const ddx = xs[i] - xs[j];
      const ddy = ys[i] - ys[j];
      const d = Math.max(1e-3, Math.hypot(ddx, ddy));
      const f = ((d * d) / k) * w;
      dx[i] -= (ddx / d) * f;
      dy[i] -= (ddy / d) * f;
      dx[j] += (ddx / d) * f;
      dy[j] += (ddy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      // Strong gravity keeps separate groups (papers that share no author)
      // close together, so fitting to the box does not shrink each group to a dot.
      dx[i] -= xs[i] * 2;
      dy[i] -= ys[i] * 2;
      const len = Math.max(1e-9, Math.hypot(dx[i], dy[i]));
      const step = Math.min(len, temp);
      xs[i] += (dx[i] / len) * step;
      ys[i] += (dy[i] / len) * step;
    }
    temp *= 0.985;
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sx = (width - 2 * pad) / Math.max(1e-9, maxX - minX);
  const sy = (height - 2 * pad) / Math.max(1e-9, maxY - minY);
  ids.forEach((id, i) => out.set(id, { x: pad + (xs[i] - minX) * sx, y: pad + (ys[i] - minY) * sy }));
  return out;
}
