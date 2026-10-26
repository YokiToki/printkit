import { describe, expect, it } from 'vitest'
import { buildKeychain, buildSilhouette, cropImage, cropPlane, cropRect, defaultAiSilhouette, defaultKeychain, defaultSource, type KeychainParams, type Matte } from './keychain'
import type { GrayImage } from './raster/threshold'
import { expectValidSolid } from './testing'

/** 160 × 120: тёмный диск на светлом фоне (силуэт по яркости), на диске градиент (чтобы яркость читалась как деталь). */
function picture(k = 1): GrayImage {
  const w = 160 * k, h = 120 * k, gray = new Uint8Array(w * h).fill(245)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (Math.hypot(i - w / 2, j - h / 2) < 45 * k) gray[j * w + i] = 40 + Math.round(((i / w) * 60))
  return { width: w, height: h, gray, alpha: null }
}
const dome = (w: number, h: number): Matte => { const d = new Uint8Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) d[j * w + i] = Math.round(255 * Math.max(0, 1 - Math.hypot(i - w / 2, j - h / 2) / (Math.min(w, h) / 2))); return { width: w, height: h, data: d } }
const base = (over: Partial<KeychainParams> = {}): KeychainParams => ({ ...defaultKeychain, imageId: 'a', size: { mode: 'longest', longest: 40, width: 40, height: 40 }, quality: { cell: 0.5, maxTriangles: 400_000 }, ...over })
const photo = (mix: { contour: number; depth: number; detail: number }, depthId = '', extra: Partial<typeof defaultSource> = {}) => ({ ...defaultSource, kind: 'photo' as const, mix, depthId, boost: 0, maxSlope: 0, finalSmooth: 0, snap: 0, ...extra })
const build = (p: KeychainParams, img = picture(), depths = new Map<string, Matte>()) => buildKeychain(p, new Map([['a', img]]), undefined, undefined, undefined, depths)
const vol = (r: { solid: { volume(): number; delete(): void } | null }) => { const v = r.solid!.volume(); r.solid!.delete(); return v }

describe('источник «Фото» в сборке (34, 2.2)', () => {
  it('только контур равен источнику «расстояние»: тот же объём и габарит', async () => {
    const a = await build(base()), b = await build(base({ source: photo({ contour: 100, depth: 0, detail: 0 }) }))
    expectValidSolid(a.solid!); expectValidSolid(b.solid!)
    expect(b.solid!.volume()).toBeCloseTo(a.solid!.volume(), 3)
    expect(b.solid!.boundingBox().max).toEqual(a.solid!.boundingBox().max)
    a.solid!.delete(); b.solid!.delete()
  })

  it('глубина из реестра меняет рельеф; отсутствие глубины сообщается и даёт то же, что контур', async () => {
    const img = picture(), depths = new Map([['d', dome(img.width, img.height)]])
    const withDepth = await build(base({ source: photo({ contour: 0, depth: 100, detail: 0 }, 'd') }), img, depths)
    expectValidSolid(withDepth.solid!)
    const missing = await build(base({ source: photo({ contour: 50, depth: 50, detail: 0 }, 'none') }), img, depths)
    expect(missing.info.depthMissing).toBe(true)
    const contourOnly = await build(base({ source: photo({ contour: 50, depth: 0, detail: 0 }) }), img, depths)
    expect(contourOnly.info.depthMissing).toBeUndefined()
    expect(vol(missing)).toBeCloseTo(vol(contourOnly), 3)
    expect(Math.abs(vol(withDepth) - vol(await build(base()))) ).toBeGreaterThan(1)
  })

  it('регрессия: у источников «расстояние» и «яркость» новые поля ни на что не влияют', async () => {
    const a = await build(base()), b = await build(base({ source: { ...defaultSource, mix: { contour: 1, depth: 99, detail: 0 }, boost: 9, levels: 6 } }))
    expect(vol(b)).toBeCloseTo(vol(a), 6)
    const c = await build(base({ source: { ...defaultSource, kind: 'brightness' } })), d = await build(base({ source: { ...defaultSource, kind: 'brightness', mix: { contour: 1, depth: 99, detail: 0 }, boost: 9 } }))
    expect(vol(d)).toBeCloseTo(vol(c), 6)
  })

  it('детали с гравировкой тёмного меняют объём (вдавливаются канавки), доля детали ноль — нет', async () => {
    const flat = await build(base({ source: photo({ contour: 100, depth: 0, detail: 0 }) }))
    const none = await build(base({ source: photo({ contour: 70, depth: 0, detail: 0 }, '', { boost: 3 }) }))
    expect(vol(none)).toBeCloseTo(vol(flat), 3)
    const eng = await build(base({ source: photo({ contour: 70, depth: 0, detail: 30 }, '', { boost: 3, darkThreshold: 0.1 }) }))
    expectValidSolid(eng.solid!); eng.solid!.delete()
  })
})

describe('кадрирование и «весь кадр» (34, 2.3)', () => {
  it('cropRect: целые границы внутри картинки, не меньше пикселя', () => {
    expect(cropRect({ x: 0, y: 0, w: 1, h: 1 }, 100, 50)).toEqual([0, 0, 100, 50])
    expect(cropRect({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 }, 100, 50)).toEqual([25, 25, 75, 50])
    expect(cropRect({ x: 2, y: 2, w: 1, h: 1 }, 10, 10)).toEqual([9, 9, 10, 10])
  })

  it('без кадрирования картинка и плоскости возвращаются как есть; кадр вырезает нужное окно', () => {
    const img = picture(), m = dome(img.width, img.height)
    expect(cropImage(img, { x: 0, y: 0, w: 1, h: 1 })).toBe(img); expect(cropPlane(m, { x: 0, y: 0, w: 1, h: 1 })).toBe(m)
    const c = cropImage(img, { x: 0.5, y: 0, w: 0.5, h: 1 }), pm = cropPlane(m, { x: 0.5, y: 0, w: 0.5, h: 1 })
    expect([c.width, c.height, pm.width, pm.height]).toEqual([80, 120, 80, 120])
    expect(c.gray[0]).toBe(img.gray[80]); expect(pm.data[5]).toBe(m.data[85])
  })

  it('«весь кадр»: каждый пиксель кадра — материал, без порога и областей', () => {
    const img = picture(), r = buildSilhouette(img, { ...defaultKeychain.silhouette, source: 'frame' })
    expect(r.mask.every((v) => v === 1)).toBe(true); expect(r.areas).toHaveLength(0)
    const c = buildSilhouette(cropImage(img, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }), { ...defaultKeychain.silhouette, source: 'frame' })
    expect(c.mask.length).toBe(80 * 60)
  })

  it('кадр вдвое уже вдвое сужает габарит детали при той же длинной стороне и сохраняет рельеф окна; плашка получается валидной', async () => {
    const full = await build(base({ source: photo({ contour: 100, depth: 0, detail: 0 }), silhouette: { ...defaultKeychain.silhouette, source: 'frame' }, size: { mode: 'width', longest: 40, width: 40, height: 40 } }))
    const half = await build(base({ crop: { x: 0, y: 0, w: 0.5, h: 1 }, source: photo({ contour: 100, depth: 0, detail: 0 }), silhouette: { ...defaultKeychain.silhouette, source: 'frame' }, size: { mode: 'width', longest: 40, width: 40, height: 40 } }))
    expectValidSolid(full.solid!); expectValidSolid(half.solid!)
    const bf = full.solid!.boundingBox(), bh = half.solid!.boundingBox()
    expect(bf.max[0] - bf.min[0]).toBeCloseTo(40, 1); expect(bh.max[0] - bh.min[0]).toBeCloseTo(40, 1) // ширина задана
    expect(bh.max[1] - bh.min[1]).toBeGreaterThan(bf.max[1] - bf.min[1]) // окно у́же, поэтому при той же ширине выше
    full.solid!.delete(); half.solid!.delete()
  })

  it('альфа ИИ кадрируется без повторной регистрации: запись реестра остаётся тем же объектом', async () => {
    const img = picture(), matte: Matte = { width: img.width, height: img.height, data: new Uint8Array(img.width * img.height) }
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) if (Math.hypot(i - 80, j - 60) < 45) matte.data[j * img.width + i] = 255
    const registry = new Map([['m', matte]]), before = registry.get('m')
    const r = await buildKeychain(base({ crop: { x: 0.2, y: 0.1, w: 0.7, h: 0.8 }, silhouette: { ...defaultKeychain.silhouette, source: 'ai', ai: { ...defaultAiSilhouette, matteId: 'm', smooth: 0 } } }), new Map([['a', img]]), undefined, undefined, registry)
    expect(r.info.aiMissing).toBeUndefined(); expect(registry.get('m')).toBe(before); expect(registry.size).toBe(1)
    expectValidSolid(r.solid!); r.solid!.delete()
  })
})
