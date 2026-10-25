import { aiSegmentation, type AiSegmentParams } from './ai'
import type { Rectified } from './homography'

/** Поле вокруг предмета во втором проходе, мм: сеть видит предмет с окружением и не режет край кадра. */
export const REFINE_MARGIN = 12

/** Запуск сети на картинке w × h (RGB подряд): альфа 0…1 того же размера. */
export type Matte = (rgb: Uint8Array, w: number, h: number) => Promise<Float32Array>

/**
 * Второй проход: каждый найденный первым проходом предмет вырезается с полем 12 мм и прогоняется сетью отдельно, поэтому
 * 512 пикселей сети приходятся только на предмет (≈ 0,3 мм вместо ≈ 0,6 мм на весь лист). Результат вмешивается в общую альфу с
 * плавным переходом к краю рамки (там остаётся общий проход), поэтому шва нет. Возвращает новую альфу; `onObject(i, n)` — прогресс.
 */
export async function refineObjects(r: Rectified, alpha: Float32Array, matte: Matte, params: Partial<AiSegmentParams> = {}, onObject?: (done: number, total: number) => void): Promise<Float32Array> {
  if (!r.rgb) return alpha
  const { width: W, height: H } = r.image, pad = Math.round(REFINE_MARGIN * r.scale)
  const seg = aiSegmentation(r, alpha, params), out = Float32Array.from(alpha)
  let done = 0
  for (const s of seg.silhouettes) {
    const x0 = Math.max(0, s.bbox[0] - pad), y0 = Math.max(0, s.bbox[1] - pad), x1 = Math.min(W - 1, s.bbox[2] + pad), y1 = Math.min(H - 1, s.bbox[3] + pad)
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, crop = new Uint8Array(cw * ch * 3)
    for (let j = 0; j < ch; j++) crop.set(r.rgb.subarray(((y0 + j) * W + x0) * 3, ((y0 + j) * W + x0 + cw) * 3), j * cw * 3)
    const res = await matte(crop, cw, ch)
    if (res.length !== cw * ch) throw new Error(`matte ${res.length} ≠ ${cw}×${ch}`)
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      // у края рамки, лежащего на краю листа, перехода нет: общего прохода за ним нет, рамка просто кончается вместе с листом
      const dx = Math.min(x0 === 0 ? Infinity : i, x1 === W - 1 ? Infinity : cw - 1 - i), dy = Math.min(y0 === 0 ? Infinity : j, y1 === H - 1 ? Infinity : ch - 1 - j)
      const w2 = Math.min(1, Math.min(dx, dy) / (pad * 0.5))
      const k = (y0 + j) * W + x0 + i
      out[k] = alpha[k] * (1 - w2) + res[j * cw + i] * w2
    }
    onObject?.(++done, seg.silhouettes.length)
  }
  return out
}
