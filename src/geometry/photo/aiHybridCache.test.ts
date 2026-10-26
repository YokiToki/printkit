import { describe, expect, it, vi } from 'vitest'
import { aiSegmentation } from './ai'
import { rectify } from './homography'
import { paperSize } from './paper'
import { loadFixture } from './fixtures/load'
import { loadAlpha } from './fixtures/ai/load'

const colourSpy = vi.hoisted(() => vi.fn())
vi.mock('./colour', async (orig) => { const m = await orig<typeof import('./colour')>(); return { ...m, colourMask: (...a: Parameters<typeof m.colourMask>) => { colourSpy(); return m.colourMask(...a) } } })

describe('гибридный край: классическая маска кэшируется (порог и сглаживание не пересчитывают её)', () => {
  it('классический тест цвета выполняется один раз на растр листа, сколько бы раз ни менялись порог и сглаживание', () => {
    const f = loadFixture('flash'), r = rectify(f.gray, f.corners, paperSize('a4', 'portrait'), f.color.rgb)!
    const { alpha } = loadAlpha('birefnet-lite-512-fp32', 'flash')
    colourSpy.mockClear()
    const a = aiSegmentation(r, alpha, { threshold: 0.5 })
    const b = aiSegmentation(r, alpha, { threshold: 0.3, smooth: 1 })
    aiSegmentation(r, alpha, { threshold: 0.7 })
    expect(colourSpy).toHaveBeenCalledTimes(1)
    expect(a.silhouettes).toHaveLength(3); expect(b.silhouettes).toHaveLength(3)
    // другой растр — другой снимок: маска считается заново
    const r2 = rectify(f.gray, f.corners, paperSize('a4', 'portrait'), f.color.rgb)!
    aiSegmentation(r2, alpha)
    expect(colourSpy).toHaveBeenCalledTimes(2)
  })

  it('повторная сегментация с кэшем быстрее первой (без классического теста цвета)', () => {
    const f = loadFixture('noflash'), r = rectify(f.gray, f.corners, paperSize('a4', 'portrait'), f.color.rgb)!
    const { alpha } = loadAlpha('isnet-imgly-fp32', 'noflash')
    const t0 = performance.now(); aiSegmentation(r, alpha); const first = performance.now() - t0
    const t1 = performance.now(); aiSegmentation(r, alpha, { threshold: 0.4 }); const again = performance.now() - t1
    expect(again).toBeLessThan(first * 0.6)
  })
})
