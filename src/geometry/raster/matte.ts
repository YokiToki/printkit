import { gaussianBlur, sigmaCells } from './blur'
import { labelComponents } from './components'

/**
 * Мягкая альфа сети (matte, 0…255) → жёсткая альфа силуэта (0 или 255). Сначала гауссово сглаживание радиусом `radiusPx` (пиксели
 * картинки; 0 — без него), затем порог 0…1: ниже порог — контур заходит дальше в мягкий край. Сглаживание по всему растру
 * (маска из единиц): край картинки не тянет значения.
 */
export function smoothThreshold(matte: Uint8Array, w: number, h: number, radiusPx: number, threshold: number): Uint8Array {
  const sigma = sigmaCells(radiusPx, 1)
  const soft = sigma > 0 ? gaussianBlur(Float32Array.from(matte), w, h, sigma, new Uint8Array(w * h).fill(1)) : null
  const cut = threshold * 255
  const out = new Uint8Array(w * h)
  for (let k = 0; k < out.length; k++) out[k] = (soft ? soft[k] : matte[k]) >= cut ? 255 : 0
  return out
}

/**
 * Оставляет только связную область с наибольшей площадью (8-связность); остальные пятна убираются. Внутренние щели не трогаются
 * (они остаются областями). При равенстве побеждает первая по обходу строк. Пустая маска остаётся пустой.
 */
export function keepLargest(mask: Uint8Array, w: number, h: number): Uint8Array {
  const { labels, count, sizes } = labelComponents(mask, w, h, 1)
  if (count === 0) return new Uint8Array(mask)
  let best = 1
  for (let l = 2; l <= count; l++) if (sizes[l] > sizes[best]) best = l
  const out = new Uint8Array(mask.length)
  for (let k = 0; k < out.length; k++) if (labels[k] === best) out[k] = 1
  return out
}
