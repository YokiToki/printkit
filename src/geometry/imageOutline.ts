import { gaussianBlur } from './raster/blur'
import { traceAlpha } from './textOutline'
import { simplifyLoop } from './textOutline'
import { CORNER_DEG, resampleLoop, smoothOutline } from './photo/outlineSmooth'
import { fitOutline } from './outlineFit'
import type { Pt } from './photo/homography'

/** Контур брелка из изображения: гладкий, без ступеней пикселей, ячеек сетки и разрешения маски. */
export interface OutlineParams {
  /** Гладкость контура, мм: размытие маски перед изолинией и сглаживание вдоль кривой. */
  smooth: number
  /** Угол поворота (градусы), с которого вершина считается углом и остаётся острой. */
  cornerDeg: number
  /** Шаг вершин итогового многоугольника, мм: длинные прямые участки делятся не реже, чем этот шаг. */
  step: number
  /** Допуск подгонки кубическими кривыми Безье, мм. */
  fitTolerance: number
  /** Использовать исходную полилинию вместо подгонки кривыми. */
  usePolyline: boolean
}
export const defaultOutline: OutlineParams = { smooth: 0.25, cornerDeg: CORNER_DEG, step: 1, fitTolerance: 0.25, usePolyline: false }
/** Допуск упрощения итогового контура, мм: заметно меньше ячейки сетки и допуска печати. */
export const OUTLINE_SIMPLIFY_MM = 0.03

const area = (l: Pt[]) => Math.abs(l.reduce((a, [x, y], i) => { const [x2, y2] = l[(i + 1) % l.length]; return a + (x * y2 - x2 * y) / 2 }, 0))

/**
 * Многоугольники контура по бинарной маске силуэта: маска слегка размывается (σ — гладкость контура в пикселях), изолиния 0.5
 * берётся с субпиксельной точностью (marching squares), каждая петля переводится в мм (x вправо, y вверх, начало — центр окна
 * [x0, y0, x1, y1] размером wMm × hMm), сглаживается вдоль кривой с неподвижными острыми углами, упрощается и делится на шаги не
 * длиннее `step`. Петли: внешние и внутренние (открытые области); мелкие осколки меньше 0.05 мм² отбрасываются.
 */
export function traceImageOutline(mask: Uint8Array, w: number, h: number, win: [number, number, number, number], wMm: number, hMm: number, o: OutlineParams): Pt[][] {
  const [wx0, wy0, wx1, wy1] = win, PAD = 3
  const x0 = Math.max(0, wx0 - PAD), y0 = Math.max(0, wy0 - PAD), x1 = Math.min(w, wx1 + PAD), y1 = Math.min(h, wy1 + PAD), cw = x1 - x0, ch = y1 - y0
  const sx = wMm / (wx1 - wx0), sy = hMm / (wy1 - wy0)
  const field = new Float32Array(cw * ch)
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) field[j * cw + i] = mask[(y0 + j) * w + x0 + i] ? 255 : 0
  const sigmaPx = Math.max(1, o.smooth / Math.min(sx, sy))
  const blurred = gaussianBlur(field, cw, ch, sigmaPx, new Uint8Array(cw * ch).fill(1))
  const u8 = new Uint8Array(cw * ch); for (let k = 0; k < u8.length; k++) u8[k] = Math.round(blurred[k])
  const out: Pt[][] = []
  for (const loop of traceAlpha(u8, cw, ch, 128)) {
    // пиксели окна → мм: центр окна — начало координат, y вверх
    const mm = loop.map(([px, py]) => [(x0 + px - wx0) * sx - wMm / 2, hMm / 2 - (y0 + py - wy0) * sy] as Pt)
    if (area(mm) < 0.05 || mm.length < 4) continue
    let l: Pt[]
    if (o.usePolyline) {
      l = smoothOutline(resampleLoop(mm, 0.175), Math.max(0, o.smooth * 0.6), o.cornerDeg)
      l = simplifyLoop(l, OUTLINE_SIMPLIFY_MM)
      if (o.step > 0) l = capStep(l, o.step)
    } else {
      l = fitOutline(mm, { smooth: Math.max(0, o.smooth * 0.6), fitTolerance: o.fitTolerance, cornerDeg: o.cornerDeg, step: o.step })
    }
    if (l.length >= 3) out.push(l)
  }
  return out
}

/** Делит стороны длиннее step на равные части: плоские участки стены не превращаются в один длинный треугольник. */
function capStep(l: Pt[], step: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}
