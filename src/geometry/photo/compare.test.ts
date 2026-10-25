import { describe, expect, it } from 'vitest'
import { aiSegmentation } from './ai'
import { compareSilhouettes, outlinesPx } from './compare'
import { rectify } from './homography'
import { paperSize } from './paper'
import { segment } from './segment'
import { loadFixture } from './fixtures/load'
import { loadAlpha } from './fixtures/ai/load'

const f = loadFixture('flash'), r = rectify(f.gray, f.corners, paperSize('a4', 'portrait'), f.color.rgb)!
const classic = segment(r), ai = aiSegmentation(r, loadAlpha('birefnet-lite-512-fp32', 'flash').alpha, { refine: false })

describe('сравнение движков', () => {
  it('силуэты сопоставляются по перекрытию; разности размеров равны разности силуэтов', () => {
    const rows = compareSilhouettes(classic, ai)
    expect(rows).toHaveLength(3)
    rows.forEach((row, i) => {
      expect(row.classic).toBe(classic.silhouettes[i]); expect(row.ai).toBe(ai.silhouettes[i])
      expect(row.dW).toBeCloseTo(ai.silhouettes[i].widthMm - classic.silhouettes[i].widthMm, 9)
      expect(Math.abs(row.dW!)).toBeLessThan(1)
    })
  })

  it('силуэт без пары даёт строку без дельты, лишний силуэт ИИ идёт отдельной строкой', () => {
    const empty = { ...ai, labels: new Int32Array(ai.labels.length), silhouettes: [] }
    expect(compareSilhouettes(classic, empty).every((r) => r.ai === null && r.dW === null)).toBe(true)
    const rows = compareSilhouettes(empty, ai)
    expect(rows).toHaveLength(3); expect(rows.every((x) => x.classic === null && x.ai !== null)).toBe(true)
  })

  it('контуры в пикселях: по одному на силуэт, внутри габарита силуэта', () => {
    const o = outlinesPx(classic)
    expect(o).toHaveLength(3)
    o.forEach(({ id, points }) => {
      const [x0, y0, x1, y1] = classic.silhouettes[id - 1].bbox
      expect(points.length).toBeGreaterThan(20)
      for (const [x, y] of points) { expect(x).toBeGreaterThanOrEqual(x0 - 1); expect(x).toBeLessThanOrEqual(x1 + 2); expect(y).toBeGreaterThanOrEqual(y0 - 1); expect(y).toBeLessThanOrEqual(y1 + 2) }
    })
  })
})
