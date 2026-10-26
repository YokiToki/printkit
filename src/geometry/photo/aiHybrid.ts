import { close, dilate, erode } from '../raster/morphology'
import { fillHoles, labelComponents, removeSpecks } from '../raster/components'
import { colourMask } from './colour'
import type { Rectified } from './homography'
import { COLOUR_DEFAULT_SENSITIVITY, defaultSegmentParams, dropFor, paperSurface } from './segment'

/** Ширина полосы вокруг маски сети, где край уточняется классическим тестом цвета бумаги, мм. */
export const HYBRID_BAND = 1.5
/** Окно, в котором тест считается неинформативным (вся полоса «бумага» или вся «предмет»), радиус, мм. */
const WINDOW = 3
/** Доля «предмета» в окне полосы, за пределами [LOW, 1 − LOW] которой классика ничего не различает. */
const UNINFORMATIVE = 0.05
/** Уходящий за полосу классический «предмет» считается недобором сети, только если в окне он занимает такую долю полосы. */
const LEAKY_F = 0.6

/** Классическая маска зависит только от снимка листа, а не от альфы сети: порог и сглаживание её не меняют, поэтому она считается один раз на растр. */
const classicCache = new WeakMap<Rectified, Uint8Array | null>()

/** Классическая маска предметов (цвет, тени) после тех же склейки, чистки и заливки, что в `segment`, но без фильтра по размеру. */
function classicObjects(r: Rectified, edge: Uint8Array): Uint8Array | null {
  if (classicCache.has(r)) return classicCache.get(r)!
  const m = classicObjectsUncached(r, edge)
  classicCache.set(r, m)
  return m
}

function classicObjectsUncached(r: Rectified, edge: Uint8Array): Uint8Array | null {
  if (!r.rgb) return null
  const { width: w, height: h, gray } = r.image, s = r.scale, p = defaultSegmentParams
  const surface = paperSurface(gray, w, h, edge)
  const raw = colourMask(r.rgb, gray, w, h, edge, { sensitivity: COLOUR_DEFAULT_SENSITIVITY, drop: dropFor(COLOUR_DEFAULT_SENSITIVITY), softEdge: p.shadowEdge, scale: s }, surface)
  const clean = new Uint8Array(fillHoles(removeSpecks(close(raw, w, h, Math.round(p.close * s)), w, h, Math.max(1, Math.round(p.minSpeck * s * s))), w, h).mask)
  for (let k = 0; k < clean.length; k++) if (edge[k]) clean[k] = 0
  return clean
}

/** Интегральное изображение (w + 1) × (h + 1) для сумм по прямоугольникам. */
function integral(a: Uint8Array, w: number, h: number): Float64Array {
  const I = new Float64Array((w + 1) * (h + 1))
  for (let j = 0; j < h; j++) { let row = 0; for (let i = 0; i < w; i++) { row += a[j * w + i]; I[(j + 1) * (w + 1) + i + 1] = I[j * (w + 1) + i + 1] + row } }
  return I
}
const box = (I: Float64Array, w: number, x0: number, y0: number, x1: number, y1: number) => I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0]

/**
 * Гибридный край. Сеть решает, какие пиксели принадлежат предмету (`mask`), а точный край берётся у классического теста цвета
 * бумаги в полосе ±band вокруг границы маски: итог = ядро (маска, суженная на band) ∪ (полоса ∩ классический «предмет»). Там, где
 * в окне полосы классика ничего не различает (вся полоса «предмет» — тёмная деталь, слитая с тенью, или вся «бумага» — край сети
 * далеко от настоящего), остаётся край сети. Без цветного растра возвращает маску как есть.
 */
export function hybridMask(r: Rectified, mask: Uint8Array, band = HYBRID_BAND): Uint8Array {
  const { width: w, height: h } = r.image, s = r.scale, b = band * s
  if (!(b > 0)) return mask
  const m = Math.max(0, Math.round(defaultSegmentParams.margin * s))
  const edge = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i < m || j < m || i >= w - m || j >= h - m) edge[j * w + i] = 1
  const classic = classicObjects(r, edge)
  if (!classic) return mask
  const core = erode(mask, w, h, b), outer = dilate(mask, w, h, b)
  const inBand = new Uint8Array(w * h), obj = new Uint8Array(w * h)
  for (let k = 0; k < inBand.length; k++) if (outer[k] && !core[k]) { inBand[k] = 1; obj[k] = classic[k] }
  // классический «предмет», уходящий за наружную границу полосы, не доказывает край внутри неё (сеть недобрала предмет): там край сети
  const outside = new Uint8Array(w * h)
  for (let k = 0; k < outside.length; k++) outside[k] = classic[k] && !core[k] ? 1 : 0
  const comps = labelComponents(outside, w, h, 1), leaky = new Uint8Array(comps.count + 1)
  for (let k = 0; k < outside.length; k++) if (outside[k] && !outer[k]) leaky[comps.labels[k]] = 1
  const bandSum = integral(inBand, w, h), objSum = integral(obj, w, h), R = Math.round(WINDOW * s)
  const out = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i
    if (core[k]) { out[k] = 1; continue }
    if (!inBand[k]) continue
    const x0 = Math.max(0, i - R), y0 = Math.max(0, j - R), x1 = Math.min(w - 1, i + R), y1 = Math.min(h - 1, j + R)
    const nb = box(bandSum, w, x0, y0, x1, y1), f = nb ? box(objSum, w, x0, y0, x1, y1) / nb : 0.5
    out[k] = f < UNINFORMATIVE || f > 1 - UNINFORMATIVE || (!mask[k] && f > LEAKY_F && leaky[comps.labels[k]]) ? mask[k] : obj[k]
  }
  for (let k = 0; k < out.length; k++) if (edge[k]) out[k] = 0
  return out
}
