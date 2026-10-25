import { traceAlpha } from '../textOutline'
import type { Pt } from './homography'
import type { Segmentation, Silhouette } from './segment'

export interface CompareRow {
  /** Силуэт первого движка (классика) и пара ему у второго (ИИ) по наибольшему перекрытию; null — пары нет. */
  classic: Silhouette | null
  ai: Silhouette | null
  /** ИИ − классика, мм; null, если пары нет. */
  dW: number | null
  dH: number | null
}

/** Сопоставление силуэтов двух движков по перекрытию: строка на каждый силуэт классики, затем строки только для ИИ. */
export function compareSilhouettes(classic: Segmentation, ai: Segmentation): CompareRow[] {
  const n = Math.min(classic.labels.length, ai.labels.length), inter = new Map<number, number>(), K = ai.silhouettes.length + 1
  for (let k = 0; k < n; k++) { const a = classic.labels[k], b = ai.labels[k]; if (a && b) inter.set(a * K + b, (inter.get(a * K + b) ?? 0) + 1) }
  const used = new Set<number>(), rows: CompareRow[] = []
  for (const c of classic.silhouettes) {
    let best = 0, bestN = 0
    for (const s of ai.silhouettes) { const v = inter.get(c.id * K + s.id) ?? 0; if (v > bestN) { bestN = v; best = s.id } }
    const s = ai.silhouettes.find((x) => x.id === best) ?? null
    if (s) used.add(s.id)
    rows.push({ classic: c, ai: s, dW: s ? s.widthMm - c.widthMm : null, dH: s ? s.heightMm - c.heightMm : null })
  }
  for (const s of ai.silhouettes) if (!used.has(s.id)) rows.push({ classic: null, ai: s, dW: null, dH: null })
  return rows
}

/** Внешние контуры силуэтов в пикселях растра листа (x вправо, y вниз), по одному на силуэт, для наложения на выпрямленный вид. */
export function outlinesPx(seg: Segmentation): { id: number; points: Pt[] }[] {
  const out: { id: number; points: Pt[] }[] = []
  for (const s of seg.silhouettes) {
    const [x0, y0, x1, y1] = s.bbox, PAD = 2, w = x1 - x0 + 1 + 2 * PAD, h = y1 - y0 + 1 + 2 * PAD, m = new Uint8Array(w * h)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const X = x0 - PAD + i, Y = y0 - PAD + j
      if (X >= 0 && Y >= 0 && X < seg.width && Y < seg.height && seg.labels[Y * seg.width + X] === s.id) m[j * w + i] = 255
    }
    const loops = traceAlpha(m, w, h, 128)
    if (!loops.length) continue
    const area = (l: Pt[]) => Math.abs(l.reduce((a, [x, y], i) => { const [x2, y2] = l[(i + 1) % l.length]; return a + (x * y2 - x2 * y) / 2 }, 0))
    const outer = loops.reduce((b, l) => (area(l) > area(b) ? l : b))
    out.push({ id: s.id, points: outer.map(([px, py]) => [x0 - PAD + px, y0 - PAD + py] as Pt) })
  }
  return out
}
