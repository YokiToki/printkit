import { gaussianBlur, sigmaCells } from './raster/blur'
import { guidedFilter, limitSlope, snapEps } from './raster/guided'
import { localContrast, normaliseDepth, quantise } from './raster/tone'

/** Как деталь превращается в высоту: гравировка тёмного, тон как высота или полусумма. */
export type DetailMode = 'engrave' | 'relief' | 'both'

/** Доли смеси 0…100 (нормируются по сумме): контур, глубина, детали. */
export interface PhotoMix { contour: number; depth: number; detail: number }

export interface PhotoParams {
  mix: PhotoMix
  /** Усиление деталей (локальный контраст); 0 — выключено. */
  boost: number
  /** Радиус деталей, мм детали: одно значение выглядит одинаково при любом разрешении. */
  boostRadius: number
  /** Тоновые уровни детали 2…8, 0 — без квантования. */
  levels: number
  /** Мягкость ступеней 0…1. */
  levelSoftness: number
  detailMode: DetailMode
  /** Порог тёмного 0…1 для гравировки: ниже тон не вдавливается. */
  darkThreshold: number
  /** Привязка глубины к краям изображения 0…100, 0 — выключено. */
  snap: number
  /** Предел крутизны, градусы; 0 — выключено. */
  maxSlope: number
  /** Итоговое сглаживание, мм; 0 — выключено. */
  finalSmooth: number
  contrast: number
  gamma: number
  invert: boolean
}

export const SNAP_RADIUS_MM = 1

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** Значение детали 0…1 из тона локального контраста: relief — сам тон, engrave — 1 минус «канавка» (вдавливается только тёмное), both — полусумма. */
export function detailTerm(tone: Float32Array, mode: DetailMode, dark: number): Float32Array {
  const out = new Float32Array(tone.length), t = Math.min(0.95, Math.max(0, dark))
  for (let i = 0; i < out.length; i++) {
    const groove = smoothstep(clamp01((2 * Math.max(0, 0.5 - tone[i]) - t) / (1 - t)))
    out[i] = mode === 'relief' ? tone[i] : mode === 'engrave' ? 1 - groove : 0.5 * (tone[i] + 1 - groove)
  }
  return out
}

export interface PhotoInput {
  nx: number
  ny: number
  /** Узлы силуэта. */
  mask: Uint8Array
  /** Узлы с заданным уровнем: не меняются и ничего не ограничивают. */
  fixed: Uint8Array | null
  /** Шаг сетки, мм. */
  cell: number
  /** Яркость узлов 0…1 (после сглаживания источника). */
  gray: Float32Array
  /** Глубина узлов 0…1 (сырая, не нормированная) или null, если глубины нет. */
  depth: Float32Array | null
  /** Высота контура в узлах, мм (скос от кромки с выбранным профилем). */
  contour: Float32Array
  floor: number
  hmax: number
  p: PhotoParams
}

export interface PhotoResult { height: Float32Array; depthMissing: boolean }

/**
 * Рельеф «Фото»: смесь контура, глубины и деталей в узлах сетки. Порядок: глубина (нормировка по маске, привязка к краям) → смесь по
 * долям → контраст, гамма, инверсия → предел крутизны → итоговое сглаживание. Результат — высота над подложкой в мм; потолок скоса у
 * кромки применяет вызывающий. Доли недоступных источников считаются нулём (нет глубины), сумма ноль — только контур.
 */
export function photoHeights(inp: PhotoInput): PhotoResult {
  const { nx, ny, mask, cell, gray, floor, hmax, p } = inp, n = nx * ny, range = Math.max(1e-6, hmax - floor)
  let wC = Math.max(0, p.mix.contour), wD = Math.max(0, p.mix.depth), wT = Math.max(0, p.mix.detail)
  const depthMissing = wD > 0 && !inp.depth
  if (!inp.depth) wD = 0
  if (wC + wD + wT <= 0) wC = 1
  const sum = wC + wD + wT

  const contour = new Float32Array(n)
  for (let k = 0; k < n; k++) contour[k] = clamp01((inp.contour[k] - floor) / range)

  let depth: Float32Array | null = null
  if (wD > 0 && inp.depth) {
    depth = normaliseDepth(inp.depth, mask)
    if (p.snap > 0) depth = guidedFilter(depth, gray, nx, ny, SNAP_RADIUS_MM / cell, snapEps(p.snap))
  }

  let detail: Float32Array | null = null
  if (wT > 0) {
    // вне силуэта яркость — среднее по силуэту, чтобы нулевой фон не создавал ложный контраст у кромки
    let s = 0, c = 0
    for (let k = 0; k < n; k++) if (mask[k]) { s += gray[k]; c++ }
    const fill = c ? s / c : 0.5, g255 = new Float32Array(n)
    for (let k = 0; k < n; k++) g255[k] = (mask[k] ? gray[k] : fill) * 255
    const tone = localContrast(g255, nx, ny, Math.max(1, p.boostRadius / cell), p.boost)
    detail = detailTerm(tone, p.detailMode, p.darkThreshold)
    if (p.levels >= 2) detail = quantise(detail, p.levels, p.levelSoftness)
  }

  const out = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    if (!mask[k]) continue
    let v = (wC * contour[k] + (depth ? wD * depth[k] : 0) + (detail ? wT * detail[k] : 0)) / sum
    v = clamp01((v - 0.5) * p.contrast + 0.5) ** p.gamma
    if (p.invert) v = 1 - v
    out[k] = floor + clamp01(v) * range
  }
  let h = p.maxSlope > 0 ? limitSlope(out, nx, ny, cell, p.maxSlope, mask, inp.fixed, floor) : out
  const sg = sigmaCells(p.finalSmooth, cell)
  if (sg > 0) h = gaussianBlur(h, nx, ny, sg, mask, inp.fixed ?? undefined)
  return { height: h, depthMissing }
}
