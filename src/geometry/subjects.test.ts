import { describe, expect, it } from 'vitest'
import { defaultKeychain } from './keychain'
import { applySubject, chooseSubject, pictureStats, subjectOf, SUBJECT_IDS } from './subjects'
import type { GrayImage } from './raster/threshold'

const img = (w: number, h: number, f: (x: number, y: number) => number): GrayImage => { const g = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y); return { width: w, height: h, gray: g, alpha: null } }
/** Логотип: белый фон и тонкие чёрные штрихи. */
const logo = () => img(200, 200, (x, y) => (Math.abs(x - y) < 3 || Math.abs(x + y - 200) < 3 || Math.abs(x - 100) < 2 ? 10 : 245))
/** Фото: плавный градиент с шумом (много тонов). */
const photo = () => img(200, 150, (x, y) => 40 + ((x * 3 + y * 5 + ((x * y) % 17)) % 180))

describe('предметы: данные (34, 2.3d)', () => {
  it('каждый предмет ставит ровно свои значения и распознаётся обратно; чужие значения дают null («Свой»)', () => {
    for (const id of SUBJECT_IDS) {
      const p = applySubject(id, defaultKeychain)
      expect(subjectOf(p)).toBe(id)
      expect(p.source.kind).toBe('photo')
    }
    expect(subjectOf(defaultKeychain)).toBeNull()
    const d = applySubject('drawing', defaultKeychain)
    expect(d).toMatchObject({ silhouette: { source: 'brightness', autoOpen: 150 }, size: { longest: 60 }, relief: { edgeWidth: 1.2 }, outline: { smooth: 0.15 }, source: { mix: { contour: 100, depth: 0, detail: 0 } } })
    const f = applySubject('face', defaultKeychain), a = applySubject('animal', defaultKeychain)
    expect(f.silhouette.source).toBe('ai'); expect(f.source.darkThreshold).toBe(0.25); expect(a.source.darkThreshold).toBe(0.18)
    expect(a.source.levels).toBe(0); expect(a.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('правка любого значения даёт «Свой»; правка постороннего значения предмет не сбивает', () => {
    const d = applySubject('face', defaultKeychain)
    expect(subjectOf({ ...d, source: { ...d.source, darkThreshold: 0.4 } })).toBeNull()
    expect(subjectOf({ ...d, size: { ...d.size, longest: 61 } })).toBeNull()
    expect(subjectOf({ ...d, mount: { ...d.mount, diameter: 5 } })).toBe('face')
  })

  it('автоматический выбор: мало тонов и тонкие штрихи — рисунок; предмет на весь кадр — лицо; предмет поменьше кадра — животное', () => {
    expect(chooseSubject(pictureStats(logo()))).toBe('drawing')
    const ph = photo()
    expect(chooseSubject(pictureStats(ph, [0, 0, 199, 149]))).toBe('face')
    expect(chooseSubject(pictureStats(ph, [40, 30, 140, 110]))).toBe('animal')
    expect(chooseSubject(pictureStats(ph))).toBe('face') // без маски
  })

  it('значения старой записи без предмета не меняются: умолчания остаются «яркость / расстояние», а не фото', () => {
    expect(defaultKeychain.source.kind).toBe('distance'); expect(defaultKeychain.silhouette.source).toBe('brightness')
  })
})
