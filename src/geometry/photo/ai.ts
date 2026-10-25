import { gaussianBlur, sigmaCells } from '../raster/blur'
import { close } from '../raster/morphology'
import { fillHoles, labelComponents, removeSpecks } from '../raster/components'
import { defaultSegmentParams, type Segmentation, type Silhouette } from './segment'
import { hybridMask, HYBRID_BAND } from './aiHybrid'
import type { Rectified } from './homography'

/** Настройки превращения мягкой альфы сети в силуэты. Длины в мм. Те же шаги очистки, что у классики (`segment`). */
export interface AiSegmentParams {
  /** Порог альфы 0…1: ниже — контур растёт в мягкую зону, выше — сжимается. */
  threshold: number
  /** Радиус сглаживания альфы перед порогом, мм (гаусс, σ = радиус в пикселях): выравнивает волнистый край и склеивает волосяные щели, слишком большой съедает тонкие части. 0 — без сглаживания. */
  smooth: number
  /** Гибридный край: точный край предмета берётся у классического теста цвета бумаги в полосе вокруг маски сети. false — край сети как есть. Без цветного растра не действует. */
  refine: boolean
  /** Ширина полосы гибридного края, мм. */
  band: number
  /** Поле по краю листа, где предметы не ищутся. */
  margin: number
  /** Склейка щелей, радиус, мм. */
  close: number
  /** Пятна меньше этой площади игнорируются, мм². */
  minSpeck: number
  /** Силуэты меньше этого размера по любой стороне отбрасываются, мм. */
  minSize: number
  /** Силуэты площадью меньше этой отбрасываются, мм². */
  minArea: number
}

export const defaultAiParams: AiSegmentParams = {
  threshold: 0.5,
  smooth: 0.3,
  refine: true,
  band: HYBRID_BAND,
  margin: defaultSegmentParams.margin,
  close: defaultSegmentParams.close,
  minSpeck: defaultSegmentParams.minSpeck,
  minSize: defaultSegmentParams.minSize,
  minArea: defaultSegmentParams.minArea,
}

/**
 * Силуэты из альфы нейросети (0…1, размер как у выпрямленного листа, строки подряд). Результат — тот же `Segmentation`, что даёт
 * `segment`, поэтому выбор, обводка и создание вырезов дальше общие. Нумерация и фильтры по размеру те же, что у классики:
 * номера идут по первому пикселю при построчном обходе (сверху вниз), так что порядок списка и цвета одинаковы у обоих движков.
 */
export function aiSegmentation(r: Rectified, alpha: Float32Array, params: Partial<AiSegmentParams> = {}): Segmentation {
  const p = { ...defaultAiParams, ...params }
  const { width: w, height: h } = r.image, s = r.scale
  if (alpha.length !== w * h) throw new Error(`alpha ${alpha.length} ≠ ${w}×${h}`)
  const marginPx = Math.max(0, Math.round(p.margin * s))
  const edge = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i < marginPx || j < marginPx || i >= w - marginPx || j >= h - marginPx) edge[j * w + i] = 1

  // сглаживание по всему растру (маска из единиц): край листа не тянет значения, а альфа сети остаётся в кэше у вызывающего
  const soft = gaussianBlur(alpha, w, h, sigmaCells(p.smooth * s, 1), new Uint8Array(w * h).fill(1))
  const cleanup = (m: Uint8Array) => {
    const c = new Uint8Array(fillHoles(removeSpecks(close(m, w, h, Math.round(p.close * s)), w, h, Math.max(1, Math.round(p.minSpeck * s * s))), w, h).mask)
    for (let k = 0; k < c.length; k++) if (edge[k]) c[k] = 0 // заливка и склейка не должны залезть в поле
    return c
  }
  let mask = new Uint8Array(w * h)
  for (let k = 0; k < mask.length; k++) mask[k] = !edge[k] && soft[k] >= p.threshold ? 1 : 0
  mask = cleanup(mask)
  if (p.refine && r.rgb) mask = cleanup(hybridMask(r, mask, p.band))

  const comps = labelComponents(mask, w, h, 1)
  const x0 = new Int32Array(comps.count + 1).fill(w), y0 = new Int32Array(comps.count + 1).fill(h)
  const x1 = new Int32Array(comps.count + 1).fill(-1), y1 = new Int32Array(comps.count + 1).fill(-1)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const l = comps.labels[j * w + i]
    if (!l) continue
    if (i < x0[l]) x0[l] = i; if (i > x1[l]) x1[l] = i; if (j < y0[l]) y0[l] = j; if (j > y1[l]) y1[l] = j
  }
  const labels = new Int32Array(w * h), map = new Int32Array(comps.count + 1), silhouettes: Silhouette[] = []
  for (let l = 1; l <= comps.count; l++) {
    const wm = (x1[l] - x0[l] + 1) / s, hm = (y1[l] - y0[l] + 1) / s, area = comps.sizes[l] / (s * s)
    if (wm < p.minSize || hm < p.minSize || area < p.minArea) continue
    const id = silhouettes.length + 1
    map[l] = id
    silhouettes.push({ id, areaMm2: area, widthMm: wm, heightMm: hm, bbox: [x0[l], y0[l], x1[l], y1[l]] })
  }
  for (let k = 0; k < labels.length; k++) labels[k] = map[comps.labels[k]] ?? 0
  // чувствительности у сети нет: поля нужны только общему типу
  return { width: w, height: h, scale: s, labels, silhouettes, sensitivity: 0, defaultSensitivity: 0 }
}
