import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d'
import { textCenterMm, type TextParams, type TextRaster } from './text'

export type Pt = [number, number]

/**
 * Контуры области alpha ≥ level (marching squares, линейная интерполяция по яркости соседних пикселей): края получаются
 * субпиксельными, не ступенчатыми. Координаты в пикселях, x вправо, y вниз.
 */
export function traceAlpha(mask: Uint8Array, w: number, h: number, level = 128): Pt[][] {
  const val = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x])
  const W = w + 3
  const hid = (x: number, y: number) => ((y + 1) * W + (x + 1)) * 2
  const vid = (x: number, y: number) => ((y + 1) * W + (x + 1)) * 2 + 1
  const pts = new Map<number, Pt>()
  const adj = new Map<number, number[]>()

  const cross = (id: number, x0: number, y0: number, x1: number, y1: number): number => {
    if (!pts.has(id)) {
      const a = val(x0, y0), b = val(x1, y1), t = a === b ? 0.5 : (level - a) / (b - a)
      pts.set(id, [x0 + 0.5 + t * (x1 - x0), y0 + 0.5 + t * (y1 - y0)])
    }
    return id
  }

  const link = (a: number, b: number) => {
    ;(adj.get(a) ?? adj.set(a, []).get(a)!).push(b)
    ;(adj.get(b) ?? adj.set(b, []).get(b)!).push(a)
  }

  for (let cy = -1; cy < h; cy++) {
    for (let cx = -1; cx < w; cx++) {
      const v0 = val(cx, cy), v1 = val(cx + 1, cy), v2 = val(cx + 1, cy + 1), v3 = val(cx, cy + 1)
      const code = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0)
      if (code === 0 || code === 15) continue
      const top = () => cross(hid(cx, cy), cx, cy, cx + 1, cy)
      const bottom = () => cross(hid(cx, cy + 1), cx, cy + 1, cx + 1, cy + 1)
      const left = () => cross(vid(cx, cy), cx, cy, cx, cy + 1)
      const right = () => cross(vid(cx + 1, cy), cx + 1, cy, cx + 1, cy + 1)
      const centerIn = (v0 + v1 + v2 + v3) / 4 >= level

      switch (code) {
        case 1: case 14: link(left(), top()); break
        case 2: case 13: link(top(), right()); break
        case 3: case 12: link(left(), right()); break
        case 4: case 11: link(right(), bottom()); break
        case 6: case 9: link(top(), bottom()); break
        case 7: case 8: link(left(), bottom()); break
        case 5: if (centerIn) { link(top(), right()); link(left(), bottom()) } else { link(left(), top()); link(right(), bottom()) } break
        case 10: if (centerIn) { link(left(), top()); link(right(), bottom()) } else { link(top(), right()); link(left(), bottom()) } break
      }
    }
  }

  const seen = new Set<number>()
  const loops: Pt[][] = []
  for (const start of adj.keys()) {
    if (seen.has(start)) continue
    const loop: Pt[] = []
    let prev = -1, cur = start
    for (;;) {
      seen.add(cur)
      loop.push(pts.get(cur)!)
      const next = (adj.get(cur) ?? []).find((n) => n !== prev && !seen.has(n)) ?? (adj.get(cur) ?? []).find((n) => n !== prev)
      if (next === undefined || next === start || seen.has(next)) break
      prev = cur; cur = next
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

/** Упрощение замкнутой петли по Дугласу–Пекеру. */
export function simplifyLoop(loop: Pt[], tol: number): Pt[] {
  const n = loop.length
  if (n <= 4 || tol <= 0) return loop
  let far = 0, best = -1
  for (let i = 1; i < n; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2
    if (d > best) { best = d; far = i }
  }
  const dist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
    return len === 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / len
  }
  const rdp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts
    let idx = 0, dmax = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], pts[0], pts[pts.length - 1])
      if (d > dmax) { dmax = d; idx = i }
    }
    if (dmax <= tol) return [pts[0], pts[pts.length - 1]]
    const left = rdp(pts.slice(0, idx + 1)), right = rdp(pts.slice(idx))
    return [...left.slice(0, -1), ...right]
  }
  const a = rdp(loop.slice(0, far + 1)), b = rdp([...loop.slice(far), loop[0]])
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

/** Многоугольники надписи в мм от центра габарита силуэта (с положением и поворотом), допуск упрощения 0.02 мм. */
export function textPolygons(r: TextRaster, t: TextParams, wMm: number, hMm: number): Pt[][] {
  const c = textCenterMm(t, wMm, hMm)
  const a = (t.rotation * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), k = r.pxPerMm
  const tol = 0.02 * k
  return traceAlpha(r.mask, r.width, r.height)
    .map((l) => simplifyLoop(l, tol))
    .filter((l) => l.length >= 3)
    .map((l) => l.map(([u, v]): Pt => {
      const lx = (u - r.width / 2) / k, ly = (r.height / 2 - v) / k
      return [c.x + lx * ca - ly * sa, c.y + lx * sa + ly * ca]
    }))
}

/** Многоугольники надписи из растра с началом координат в центре надписи (мм). */
export function textPolygonsCentered(
  mask: Uint8Array,
  w: number,
  h: number,
  pxPerMm: number,
  rotationDeg = 0
): Pt[][] {
  const a = (rotationDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a)
  const tol = 0.02 * pxPerMm
  return traceAlpha(mask, w, h)
    .map((l) => simplifyLoop(l, tol))
    .filter((l) => l.length >= 3)
    .map((l) =>
      l.map(([u, v]): Pt => {
        const lx = (u - w / 2) / pxPerMm
        const ly = (h / 2 - v) / pxPerMm
        return [lx * ca - ly * sa, lx * sa + ly * ca]
      })
    )
}

/**
 * Создаёт 2D CrossSection из полигонов надписи с правилом EvenOdd.
 */
export function crossSectionFromPolygons(w: ManifoldToplevel, polygons: Pt[][]): CrossSection {
  return w.CrossSection.ofPolygons(polygons as any)
}
