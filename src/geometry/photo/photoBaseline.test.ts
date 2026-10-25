import { describe, expect, it } from 'vitest'
import { rectify } from './homography'
import { paperSize } from './paper'
import { segment } from './segment'
import { loadFixture } from './fixtures/load'

/**
 * Замороженный результат классического пути (32-photo-trace-ai, 2.1): число силуэтов, габарит, площадь и размер каждого на обоих
 * снимках владельца, записанные с кода до начала работы над ИИ-движком. Любое изменение segment.ts, colour.ts или
 * геометрии выпрямления ломает тест: классика остаётся эталоном, с которым сравнивают нейросети.
 */
const A4 = paperSize('a4', 'portrait')

interface Frozen { bbox: [number, number, number, number]; area: number; width: number; height: number }
const FROZEN: Record<'flash' | 'noflash', Frozen[]> = {
  flash: [
    { bbox: [99, 41, 349, 735], area: 5096.9375, width: 62.75, height: 173.75 },
    { bbox: [474, 63, 789, 578], area: 3140.625, width: 79, height: 129 },
    { bbox: [366, 402, 498, 1169], area: 3328.75, width: 33.25, height: 192 },
  ],
  noflash: [
    { bbox: [97, 41, 349, 734], area: 5157.0625, width: 63.25, height: 173.5 },
    { bbox: [473, 64, 790, 576], area: 2957.125, width: 79.5, height: 128.25 },
    { bbox: [367, 403, 496, 1168], area: 3261.0625, width: 32.5, height: 191.5 },
  ],
}

describe('классический путь: замороженный результат на фикстурах', () => {
  for (const name of ['flash', 'noflash'] as const) {
    it(`${name}: три силуэта с прежними габаритом, площадью и размерами`, () => {
      const f = loadFixture(name)
      const seg = segment(rectify(f.gray, f.corners, A4, f.color.rgb)!)
      expect([seg.width, seg.height, seg.scale]).toEqual([840, 1188, 4])
      expect(seg.silhouettes).toHaveLength(FROZEN[name].length)
      seg.silhouettes.forEach((s, i) => {
        const want = FROZEN[name][i]
        expect(s.id, `${name} #${i + 1} номер`).toBe(i + 1)
        expect(s.bbox, `${name} #${i + 1} габарит`).toEqual(want.bbox)
        expect(s.areaMm2, `${name} #${i + 1} площадь`).toBeCloseTo(want.area, 4)
        expect(s.widthMm, `${name} #${i + 1} ширина`).toBeCloseTo(want.width, 4)
        expect(s.heightMm, `${name} #${i + 1} высота`).toBeCloseTo(want.height, 4)
      })
    })
  }
})
