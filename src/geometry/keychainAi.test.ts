import { describe, expect, it } from 'vitest'
import { buildKeychain, buildSilhouette, defaultAiSilhouette, defaultKeychain, type KeychainParams, type Matte, type SilhouetteParams } from './keychain'
import type { GrayImage } from './raster/threshold'
import { expectValidSolid } from './testing'

/** Картинка k × (200 × 200) с фоном-градиентом: яркость силуэт не различает. */
const gradient = (k: number): GrayImage => {
  const w = 200 * k, gray = new Uint8Array(w * w)
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) gray[j * w + i] = Math.round(60 + (i / w) * 120)
  return { width: w, height: w, gray, alpha: null }
}
/** Мягкая альфа: кольцо (внешний радиус 80, внутренний 40) и по желанию малое отверстие в материале; k — масштаб разрешения. */
function ring(k: number, pinhole = true): Matte {
  const w = 200 * k, data = new Uint8Array(w * w)
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const r = Math.hypot(i + 0.5 - w / 2, j + 0.5 - w / 2) / k
    let a = r > 40 && r < 80 ? 255 : 0
    if (pinhole && Math.hypot(i + 0.5 - w / 2 - 60 * k, j + 0.5 - w / 2) / k < 4) a = 0 // отверстие радиусом 4 в материале
    data[j * w + i] = a
  }
  return { width: w, height: w, data }
}
const ai = (over: Partial<SilhouetteParams['ai']> = {}, top: Partial<SilhouetteParams> = {}): SilhouetteParams => ({ ...defaultKeychain.silhouette, source: 'ai', ai: { ...defaultAiSilhouette, matteId: 'm', smooth: 0, keepLargest: false, ...over }, close: 0, speck: 0, grow: 0, ...top })
const size = defaultKeychain.size // longest 70
const count = (m: Uint8Array) => m.reduce((n, v) => n + v, 0)

describe('силуэт по ИИ (33, 2.2)', () => {
  it('маска строится из альфы, а не из яркости: градиент без альфы силуэта не даёт, с альфой кольцо', () => {
    const img = gradient(1), m = ring(1, false)
    const r = buildSilhouette(img, ai({}, { autoOpen: 0 }), { matte: m, size })
    const ref = buildSilhouette({ ...img, alpha: m.data }, { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 0, autoOpen: 0 }, { size })
    // та же маска, что даёт эквивалентный PNG с прозрачностью
    expect(Array.from(r.mask)).toEqual(Array.from(ref.mask))
    expect(count(r.mask)).toBeGreaterThan(5000)
    expect(r.aiMissing).toBeUndefined()
  })

  it('источник «яркость» не меняется: те же маски, что и без новых полей (регрессия)', () => {
    const img = gradient(1); for (let i = 0; i < img.gray.length; i += 7) img.gray[i] = 10
    const a = buildSilhouette(img, defaultKeychain.silhouette), b = buildSilhouette(img, { ...defaultKeychain.silhouette, ai: { ...defaultAiSilhouette, smooth: 2, threshold: 0.1 }, autoOpen: null }, { matte: ring(1), size })
    expect(Array.from(b.mask)).toEqual(Array.from(a.mask)) // матта и поля ИИ при источнике «яркость» не учитываются
  })

  it('двигать ползунки можно без повторной регистрации: матта в реестре не меняется', () => {
    const img = gradient(1), m = ring(1), before = Array.from(m.data)
    for (const t of [0.2, 0.5, 0.8]) for (const s of [0, 0.5, 2]) buildSilhouette(img, ai({ threshold: t, smooth: s }), { matte: m, size })
    expect(Array.from(m.data)).toEqual(before)
  })

  it('нет альфы (хранилище очищено): силуэт по яркости и признак aiMissing, маска не пустая', () => {
    const img = gradient(1); for (let j = 60; j < 140; j++) for (let i = 60; i < 140; i++) img.gray[j * 200 + i] = 10 // тёмный квадрат
    const miss = buildSilhouette(img, ai(), { size })
    expect(miss.aiMissing).toBe(true)
    expect(miss.mask[100 * 200 + 100]).toBe(1)
    const wrong = buildSilhouette(img, ai(), { matte: ring(2), size }) // альфа другого размера считается отсутствующей
    expect(wrong.aiMissing).toBe(true)
  })

  it('сглаживание задано в мм брелка: на удвоенном разрешении то же сглаживание даёт ту же форму', () => {
    const noisy = (k: number): Matte => { const m = ring(k, false); for (let j = 0; j < m.height; j++) for (let i = 0; i < m.width; i++) if (m.data[j * m.width + i] && (Math.floor(i / k) + Math.floor(j / k)) % 5 === 0) m.data[j * m.width + i] = 0; return m }
    const a = buildSilhouette(gradient(1), ai({ smooth: 1.2 }), { matte: noisy(1), size }), b = buildSilhouette(gradient(2), ai({ smooth: 1.2 }), { matte: noisy(2), size })
    expect(count(b.mask) / 4 / count(a.mask)).toBeGreaterThan(0.97); expect(count(b.mask) / 4 / count(a.mask)).toBeLessThan(1.03)
  })

  it('keepLargest убирает постороннее пятно, оставляя кольцо', () => {
    const m = ring(1, false)
    for (let j = 5; j < 15; j++) for (let i = 5; i < 15; i++) m.data[j * 200 + i] = 255
    expect(buildSilhouette(gradient(1), ai({ keepLargest: false }), { matte: m, size }).mask[10 * 200 + 10]).toBe(1)
    const r = buildSilhouette(gradient(1), ai({ keepLargest: true }), { matte: m, size })
    expect(r.mask[10 * 200 + 10]).toBe(0); expect(count(r.mask)).toBeGreaterThan(5000)
  })

  it('рельеф по альфе даёт то же тело, что эквивалентная картинка с прозрачностью', async () => {
    const img = gradient(1), m = ring(1, false)
    const base: KeychainParams = { ...defaultKeychain, imageId: 'a', quality: { cell: 0.8, maxTriangles: 400_000 } }
    const viaAi = await buildKeychain({ ...base, silhouette: ai({}, { autoOpen: 0 }) }, new Map([['a', img]]), undefined, undefined, new Map([['m', m]]))
    const viaPng = await buildKeychain({ ...base, silhouette: { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 0, autoOpen: 0 } }, new Map([['a', { ...img, alpha: m.data }]]))
    expect(viaAi.solid && viaPng.solid).toBeTruthy()
    expectValidSolid(viaAi.solid!); expectValidSolid(viaPng.solid!)
    expect(viaAi.solid!.volume()).toBeCloseTo(viaPng.solid!.volume(), 3)
    expect(viaAi.solid!.boundingBox().max).toEqual(viaPng.solid!.boundingBox().max)
    viaAi.solid!.delete(); viaPng.solid!.delete()
  })
})

describe('автоматические области (33, 2.2a)', () => {
  const ids = (r: ReturnType<typeof buildSilhouette>) => r.areas.map((a) => `${a.size}:${a.open}`)

  it('просвет кольца крупнее порога открыт сам, малое отверстие в материале залито', () => {
    const r = buildSilhouette(gradient(1), ai(), { matte: ring(1), size })
    expect(r.areas).toHaveLength(2)
    const big = r.areas.reduce((a, b) => (a.size > b.size ? a : b)), small = r.areas.reduce((a, b) => (a.size < b.size ? a : b))
    expect(big.open).toBe(true); expect(small.open).toBe(false)
    expect(r.mask[100 * 200 + 100]).toBe(0)       // центр кольца открыт
    expect(r.mask[100 * 200 + 160]).toBe(1)       // отверстие в материале залито
  })

  it('своё решение пользователя сильнее порога и не сбивается при его смене', () => {
    const m = ring(1)
    const base = buildSilhouette(gradient(1), ai(), { matte: m, size })
    const small = base.areas.reduce((a, b) => (a.size < b.size ? a : b)), big = base.areas.reduce((a, b) => (a.size > b.size ? a : b))
    const params = (autoOpen: number | null) => ai({}, { autoOpen, areas: { [small.id]: { mode: 'open', level: 0.6 }, [big.id]: { mode: 'follow', level: 0.6 } } })
    for (const t of [null, 0, 5, 150, 100000]) {
      const r = buildSilhouette(gradient(1), params(t), { matte: m, size })
      expect(r.areas.find((a) => a.id === small.id)!.open).toBe(true)
      expect(r.areas.find((a) => a.id === big.id)!.open).toBe(false)
    }
  })

  it('0 выключает автоматику и возвращает прежнее поведение (все области заливаются)', () => {
    const r = buildSilhouette(gradient(1), ai({}, { autoOpen: 0 }), { matte: ring(1), size })
    expect(r.areas.every((a) => !a.open)).toBe(true)
    expect(r.mask[100 * 200 + 100]).toBe(1)
  })

  it('площадь в мм² не зависит от разрешения картинки: то же решение при удвоенном разрешении', () => {
    const a = buildSilhouette(gradient(1), ai({}, { autoOpen: 400 }), { matte: ring(1), size }), b = buildSilhouette(gradient(2), ai({}, { autoOpen: 400 }), { matte: ring(2), size })
    expect(b.areas.map((x) => x.open)).toEqual(a.areas.map((x) => x.open))
    // и при пороге между мелкой (~5 мм²) и крупной (~960 мм²) областью границу переносит сам порог, а не пиксели
    const lo = buildSilhouette(gradient(2), ai({}, { autoOpen: 2 }), { matte: ring(2), size }), hi = buildSilhouette(gradient(2), ai({}, { autoOpen: 2000 }), { matte: ring(2), size })
    expect(lo.areas.every((x) => x.open)).toBe(true); expect(hi.areas.every((x) => !x.open)).toBe(true)
  })

  it('порог работает и для силуэта по яркости, если задан явно', () => {
    const img = gradient(1)
    for (let j = 0; j < 200; j++) for (let i = 0; i < 200; i++) { const r = Math.hypot(i + 0.5 - 100, j + 0.5 - 100); if (r > 40 && r < 80) img.gray[j * 200 + i] = 5; else img.gray[j * 200 + i] = 250 }
    const off = buildSilhouette(img, { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 0 }, { size }), on = buildSilhouette(img, { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 0, autoOpen: 150 }, { size })
    expect(off.areas.every((x) => !x.open)).toBe(true)
    expect(ids(on).some((s) => s.endsWith(':true'))).toBe(true)
  })
})
