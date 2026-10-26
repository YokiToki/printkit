import { describe, expect, it, vi } from 'vitest'
import { downscaleColor, looksLikeLogo, matteIdOf, runMatte, toMatte } from './matte'
import { MODELS } from '../../ml/models'
import type { GrayImage } from '../../geometry/raster/threshold'

describe('цвет и альфа для нейросети (33, 3.2)', () => {
  it('цветная копия: короткая картинка не меняется, длинная уменьшается усреднением с сохранением пропорций', () => {
    const rgb = new Uint8Array(4 * 2 * 3).fill(10)
    expect(downscaleColor(rgb, 4, 2, 8).rgb).toBe(rgb)
    const big = new Uint8Array(8 * 4 * 3); for (let i = 0; i < big.length; i += 3) { big[i] = i % 6 === 0 ? 0 : 100 }
    const d = downscaleColor(big, 8, 4, 4)
    expect([d.width, d.height]).toEqual([4, 2])
    expect(d.rgb[0]).toBe(50) // среднее двух пикселей 0 и 100
  })

  it('альфа переносится на размер изображения без искажений: горизонтальный градиент остаётся горизонтальным, тот же размер — без изменений', () => {
    const a = new Float32Array(4 * 2); for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) a[j * 4 + i] = i / 3
    const same = toMatte(a, 4, 2, 4, 2)
    expect(Array.from(same.data.slice(0, 4))).toEqual([0, 85, 170, 255])
    const wide = toMatte(a, 4, 2, 12, 6), tall = toMatte(new Float32Array([0, 1, 0, 1, 0, 1, 0, 1]).map((_, k) => Math.floor(k / 2) / 3), 2, 4, 6, 12)
    expect(wide.data[0]).toBeLessThan(wide.data[11]); expect(wide.data[0]).toBe(wide.data[5 * 12]) // по вертикали значение не меняется
    expect(tall.data[0]).toBeLessThan(tall.data[11 * 6]); expect(tall.data[0]).toBe(tall.data[5]) // по горизонтали не меняется
    expect([wide.width, wide.height, tall.width, tall.height]).toEqual([12, 6, 6, 12])
  })

  it('запуск: сеть получает цветную копию, результат приводится к размеру изображения, значения 0…255', async () => {
    const ml = { matteAlpha: vi.fn(async (_s: unknown, _rgb: Uint8Array, w: number, h: number) => new Float32Array(w * h).fill(0.5)) }
    const m = await runMatte(ml, MODELS[2], { width: 6, height: 3, rgb: new Uint8Array(54) }, { width: 12, height: 6 })
    expect(ml.matteAlpha).toHaveBeenCalledWith(MODELS[2], expect.any(Uint8Array), 6, 3)
    expect([m.width, m.height, m.data.length]).toEqual([12, 6, 72]); expect(m.data[0]).toBe(128)
  })

  it('идентификатор альфы стабилен для пары «изображение + модель»', () => { expect(matteIdOf('img1', 'isnet')).toBe(matteIdOf('img1', 'isnet')); expect(matteIdOf('img1', 'isnet')).not.toBe(matteIdOf('img2', 'isnet')) })

  it('логотип на чистом фоне распознаётся, фото — нет', () => {
    const w = 60, h = 40, logo: GrayImage = { width: w, height: h, gray: new Uint8Array(w * h).fill(250), alpha: null }
    for (let j = 10; j < 30; j++) for (let i = 20; i < 40; i++) logo.gray[j * w + i] = 5
    expect(looksLikeLogo(logo)).toBe(true)
    const photo: GrayImage = { width: w, height: h, gray: new Uint8Array(w * h).map((_, k) => 70 + ((k * 37) % 120)), alpha: null }
    expect(looksLikeLogo(photo)).toBe(false)
  })
})
