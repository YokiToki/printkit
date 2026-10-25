import { gaussianBlur } from '../raster/blur'
import { traceAlpha } from '../textOutline'
import { CORNER_DEG, resampleLoop, smoothOutline, OUTLINE_STEP } from './outlineSmooth'
import type { Pt } from './homography'
import type { TracedOutline } from './outline'
import type { Segmentation } from './segment'

/** Сглаживание вдоль контура ИИ-силуэта по умолчанию, мм: как у Keychain (острия остаются, волна периода пикселя сети уходит). */
export const AI_OUTLINE_SIGMA = 0.25
const PAD = 3

const signedArea = (p: Pt[]) => p.reduce((a, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return a + (x * y2 - x2 * y) / 2 }, 0)

/**
 * Силуэт ИИ-движка → многоугольник в мм (тот же формат и те же соглашения, что у `traceSilhouette`: мм от центра габарита, y вверх,
 * против часовой стрелки). Отличие — вместо упрощения Дугласа–Пекера контур передискретизируется и сглаживается вдоль кривой с
 * сохранением острых углов (`smoothOutline`): так он так же плавен, как классический, но острия не затупляются.
 */
export function traceAiSilhouette(seg: Segmentation, id: number, paper: { width: number; height: number }, sigmaMm = AI_OUTLINE_SIGMA, cornerDeg = CORNER_DEG): TracedOutline | null {
  const sil = seg.silhouettes.find((s) => s.id === id)
  if (!sil) return null
  const [bx0, by0, bx1, by1] = sil.bbox
  const x0 = bx0 - PAD, y0 = by0 - PAD, w = bx1 - bx0 + 1 + 2 * PAD, h = by1 - by0 + 1 + 2 * PAD
  const values = new Float32Array(w * h), ones = new Uint8Array(w * h).fill(1)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = x0 + i, Y = y0 + j
    if (X >= 0 && Y >= 0 && X < seg.width && Y < seg.height && seg.labels[Y * seg.width + X] === id) values[j * w + i] = 255
  }
  const blurred = gaussianBlur(values, w, h, 1, ones)
  const mask = new Uint8Array(w * h)
  for (let k = 0; k < mask.length; k++) mask[k] = Math.round(blurred[k])
  const loops = traceAlpha(mask, w, h, 128)
  if (!loops.length) return null
  const outer = loops.reduce((best, l) => (Math.abs(signedArea(l)) > Math.abs(signedArea(best)) ? l : best))
  if (outer.length < 4) return null
  const s = seg.scale
  const mm = outer.map(([px, py]) => [(x0 + px) / s, (y0 + py) / s] as Pt)
  const smooth = smoothOutline(resampleLoop(mm, OUTLINE_STEP), sigmaMm, cornerDeg)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of smooth) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  let points = smooth.map(([x, y]) => [x - cx, -(y - cy)] as Pt)
  if (signedArea(points) < 0) points = points.reverse()
  return { points, size: { w: maxX - minX, l: maxY - minY }, center: [cx - paper.width / 2, -(cy - paper.height / 2)], areaMm2: Math.abs(signedArea(points)) }
}
