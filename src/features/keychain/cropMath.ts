import { fullCrop, MIN_CROP, type Crop } from '../../geometry/keychain'

/** Ручки окна: перенос (`move`), углы и стороны. */
export type Handle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Фиксация пропорций окна (в пикселях изображения): свободно, 1 : 1, 4 : 3, 3 : 4. */
export type AspectLock = 'free' | '1:1' | '4:3' | '3:4'
export const ASPECT_RATIO: Record<AspectLock, number | null> = { free: null, '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const isFullCrop = (c: Crop) => c.x <= 0 && c.y <= 0 && c.w >= 1 && c.h >= 1

/** Отношение долей ширины к высоте окна, при котором пропорции в пикселях равны `aspect` (ширина / высота), у изображения imageAspect. */
const fractionRatio = (aspect: number, imageAspect: number) => aspect / imageAspect

/**
 * Окно после перетаскивания ручки на (dx, dy) долей изображения. Окно всегда внутри изображения, стороны не меньше MIN_CROP.
 * С фиксацией пропорций противоположный угол (или середина противоположной стороны) остаётся на месте, пока хватает места.
 */
export function dragCrop(start: Crop, handle: Handle, dx: number, dy: number, aspect: number | null = null, imageAspect = 1): Crop {
  if (handle === 'move') return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) }
  let l = start.x, r = start.x + start.w, t = start.y, b = start.y + start.h
  if (handle.includes('w')) l = clamp(l + dx, 0, r - MIN_CROP)
  if (handle.includes('e')) r = clamp(r + dx, l + MIN_CROP, 1)
  if (handle.includes('n')) t = clamp(t + dy, 0, b - MIN_CROP)
  if (handle.includes('s')) b = clamp(b + dy, t + MIN_CROP, 1)
  if (aspect === null) return { x: l, y: t, w: r - l, h: b - t }
  const R = fractionRatio(aspect, imageAspect) // w / h в долях
  const corner = handle.length === 2
  if (corner) {
    // якорь — противоположный угол: ширина и высота подгоняются под пропорцию в пределах свободного места от якоря
    const ax = handle.includes('w') ? start.x + start.w : start.x, ay = handle.includes('n') ? start.y + start.h : start.y
    const dirX = handle.includes('w') ? -1 : 1, dirY = handle.includes('n') ? -1 : 1
    let w = Math.abs((handle.includes('w') ? l : r) - ax), h = Math.abs((handle.includes('n') ? t : b) - ay)
    if (w / h > R) h = w / R; else w = h * R
    const maxW = dirX > 0 ? 1 - ax : ax, maxH = dirY > 0 ? 1 - ay : ay
    const k = Math.min(1, maxW / w, maxH / h); w *= k; h *= k
    if (w < MIN_CROP || h < MIN_CROP) { const up = Math.max(MIN_CROP / w, MIN_CROP / h); w *= up; h *= up }
    return { x: dirX > 0 ? ax : ax - w, y: dirY > 0 ? ay : ay - h, w, h }
  }
  const horizontal = handle === 'e' || handle === 'w'
  let w = r - l, h = b - t
  if (horizontal) h = w / R; else w = h * R
  // сторона растёт от противоположной, перпендикулярная ось — вокруг прежней середины
  const cx = start.x + start.w / 2, cy = start.y + start.h / 2
  const maxW = horizontal ? (handle === 'e' ? 1 - l : r) : 2 * Math.min(cx, 1 - cx), maxH = horizontal ? 2 * Math.min(cy, 1 - cy) : (handle === 's' ? 1 - t : b)
  const k = Math.min(1, maxW / w, maxH / h); w *= k; h *= k
  if (w < MIN_CROP || h < MIN_CROP) { const up = Math.max(MIN_CROP / w, MIN_CROP / h); w *= up; h *= up }
  const x = horizontal ? (handle === 'e' ? l : r - w) : cx - w / 2, y = horizontal ? cy - h / 2 : handle === 's' ? t : b - h
  return { x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h }
}

/** Сдвиг окна стрелкой: на 1 % изображения, с Shift на 5 %. ручка move двигает окно, остальные меняют соответствующую сторону. */
export function nudgeCrop(c: Crop, handle: Handle, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown', big: boolean, aspect: number | null = null, imageAspect = 1): Crop {
  const step = big ? 0.05 : 0.01
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
  return dragCrop(c, handle, dx, dy, aspect, imageAspect)
}

/** Габарит предмета по доле изображения. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

/**
 * Окно по габариту предмета с полем margin (доля размера габарита); с фиксацией пропорций окно расширяется до нужных
 * пропорций вокруг середины и сдвигается внутрь изображения. Габарит нулевого размера даёт весь кадр.
 */
export function fitSubject(b: Box, margin = 0.05, aspect: number | null = null, imageAspect = 1): Crop {
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0
  if (!(bw > 0 && bh > 0)) return { ...fullCrop }
  let w = clamp(bw * (1 + 2 * margin), MIN_CROP, 1), h = clamp(bh * (1 + 2 * margin), MIN_CROP, 1)
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
  if (aspect !== null) {
    const R = fractionRatio(aspect, imageAspect)
    if (w / h > R) h = w / R; else w = h * R
    const k = Math.min(1, 1 / w, 1 / h); w *= k; h *= k
  }
  return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h }
}

/** Габарит пикселей ≥ 128 плоскости w × h в долях изображения; null — пусто. */
export function boxOfPlane(data: Uint8Array, w: number, h: number): Box | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (data[j * w + i] >= 128) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j }
  return x1 < 0 ? null : { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h }
}
