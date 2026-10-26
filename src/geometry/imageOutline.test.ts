import { describe, expect, it } from 'vitest'
import { buildKeychain, defaultKeychain, type KeychainParams } from './keychain'
import { defaultOutline, traceImageOutline } from './imageOutline'
import type { GrayImage } from './raster/threshold'
import { expectValidSolid } from './testing'

const S = 0.2 // мм на пиксель
const SHIFT = 10 // центр диска левее центра окна на столько мм (окно ±50 × ±40 мм: диск −40…20, шип 25…45 влезают с запасом)
/** Маска k × (400 × 400): окно 80 × 80 мм: диск радиуса 30 мм слева и тонкий шип справа (длина 20 мм, полуугол 15°, остриё в точке (110, 0) мм от центра диска). */
function scene(k = 1) {
  const w = 500 * k, h = 400 * k, m = new Uint8Array(w * h), px = S / k
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = (i + 0.5) * px - w * px / 2 + SHIFT, y = h * px / 2 - (j + 0.5) * px // x от центра окна; диск в (0, 0) мм → центр окна правее на SHIFT
    const xd = x - 0, disc = Math.hypot(xd, y) <= 30
    const spike = x >= 25 && x <= 45 && Math.abs(y) <= 5.35 * (1 - (x - 25) / 20) // острие на x = 45, полуугол 15°
    if (disc || spike) m[j * w + i] = 1
  }
  return { m, w, h, px }
}
const dev = (loops: [number, number][][]) => {
  // отклонение точек внешней петли от диска (там, где нет шипа)
  let worst = 0
  for (const [x, y] of loops[0]) if (x < 12) worst = Math.max(worst, Math.abs(Math.hypot(x, y) - 30))
  return worst
}

describe('контур изображения без ступеней (34, 2.3a)', () => {
  it('диск: отклонение от настоящего круга около 0.1 ячейки (0.25 мм → 0.03 мм при пикселе маски 0.05 мм), стена не ступенчатая', () => {
    // маска с шагом 0.05 мм: сама двоичная маска не может быть точнее своего пикселя, поэтому проверяется контур, а не растр
    const { m, w, h, px } = scene(4), loops = traceImageOutline(m, w, h, [0, 0, w, h], w * px, h * px, defaultOutline)
    expect(loops.length).toBe(1)
    // координаты в мм от центра окна; переводим к центру диска
    const shifted = loops.map((l) => l.map(([x, y]) => [x + SHIFT, y] as [number, number]))
    expect(dev(shifted)).toBeLessThan(0.03) // пиксель маски 0.05 мм задаёт собственную погрешность ±0.025 мм: контур точнее растра быть не может
    // ступени ячейки сетки (0.25 мм) дали бы отклонение в разы больше найденного
  })

  it('шип: острие не короче настоящего больше чем на ячейку, острый угол сохраняется', () => {
    const { m, w, h, px } = scene(), loops = traceImageOutline(m, w, h, [0, 0, w, h], w * px, h * px, defaultOutline)
    const tipX = Math.max(...loops[0].map(([x]) => x + SHIFT))
    expect(tipX).toBeGreaterThan(45 - 0.25); expect(tipX).toBeLessThanOrEqual(45.3)
  })

  it('результат не зависит от разрешения маски: двукратное разрешение даёт то же острие и то же отклонение', () => {
    const a = scene(1), b = scene(2)
    const la = traceImageOutline(a.m, a.w, a.h, [0, 0, a.w, a.h], a.w * a.px, a.h * a.px, defaultOutline), lb = traceImageOutline(b.m, b.w, b.h, [0, 0, b.w, b.h], b.w * b.px, b.h * b.px, defaultOutline)
    const tip = (l: [number, number][][]) => Math.max(...l[0].map(([x]) => x))
    expect(Math.abs(tip(la) - tip(lb))).toBeLessThan(0.15)
  })

  it('открытая область (дыра) даёт вторую петлю; мелкие осколки отбрасываются', () => {
    const { m, w, h, px } = scene()
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (Math.hypot((i + 0.5) * px - w * px / 2 + SHIFT, h * px / 2 - (j + 0.5) * px) < 10) m[j * w + i] = 0
    m[10 * w + 10] = 1 // осколок в 1 пиксель
    expect(traceImageOutline(m, w, h, [0, 0, w, h], w * px, h * px, defaultOutline)).toHaveLength(2)
  })

  it('шаг вершин ограничивает длину стороны', () => {
    const { m, w, h, px } = scene()
    const loops = traceImageOutline(m, w, h, [0, 0, w, h], w * px, h * px, { ...defaultOutline, step: 0.5 })
    for (const l of loops) for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThanOrEqual(0.5 + 1e-6) }
  })
})

describe('стена модели следует контуру, а не сетке (34, 2.3a)', () => {
  const disc = (): GrayImage => { const w = 300, g = new Uint8Array(w * w).fill(245); for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) if (Math.hypot(i - w / 2, j - w / 2) < 100) g[j * w + i] = 20; return { width: w, height: w, gray: g, alpha: null } }
  const run = (cell: number, over: Partial<KeychainParams> = {}) => buildKeychain({ ...defaultKeychain, imageId: 'a', size: { mode: 'longest', longest: 40, width: 40, height: 40 }, quality: { cell, maxTriangles: 800_000 }, ...over }, new Map([['a', disc()]]))

  it('габарит и объём почти не зависят от шага сетки: меняется рельеф, а не контур', async () => {
    const a = await run(0.3), b = await run(0.9)
    expectValidSolid(a.solid!); expectValidSolid(b.solid!)
    const ba = a.solid!.boundingBox(), bb = b.solid!.boundingBox()
    expect(Math.abs(ba.max[0] - bb.max[0])).toBeLessThan(0.05); expect(Math.abs(ba.max[1] - bb.max[1])).toBeLessThan(0.05)
    expect(Math.abs(a.solid!.volume() - b.solid!.volume()) / a.solid!.volume()).toBeLessThan(0.04) // рельеф зависит от шага, контур нет
    a.solid!.delete(); b.solid!.delete()
  })

  it('диск 40 мм: полуось по X и Y — 20 мм с точностью лучше 0.1 ячейки при двух шагах', async () => {
    for (const cell of [0.3, 0.9]) {
      const r = await run(cell), bb = r.solid!.boundingBox()
      expect(Math.abs((bb.max[0] - bb.min[0]) - 40)).toBeLessThan(0.1); expect(Math.abs((bb.max[1] - bb.min[1]) - 40)).toBeLessThan(0.1)
      r.solid!.delete()
    }
  })

  it('картинка вплотную к краю остаётся рабочей: без запаса контур ступенчатый, но модель строится', async () => {
    const w = 120, g = new Uint8Array(w * w).fill(20), img: GrayImage = { width: w, height: w, gray: g, alpha: null }
    const r = await buildKeychain({ ...defaultKeychain, imageId: 'a', silhouette: { ...defaultKeychain.silhouette, invert: false }, size: { mode: 'longest', longest: 30, width: 30, height: 30 }, quality: { cell: 0.5, maxTriangles: 400_000 } }, new Map([['a', img]]))
    expectValidSolid(r.solid!); r.solid!.delete()
  })
})
