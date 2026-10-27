import { describe, expect, it } from 'vitest'
import { getWasm } from './wasm'
import {
  buildKeychain, buildSilhouette, defaultKeychain, effectiveCell, maskPreview, reliefHeight, sizeMm, validateKeychain,
  type KeychainParams,
} from './keychain'
import type { GrayImage } from './raster/threshold'
import { generate, registerImage } from './model'
import { expectValidSolid } from './testing'

/** Картинка W × H: эллипс (cx, cy, rx, ry) тёмный на белом; дырки — круги светлого внутри. */
function shape(W: number, H: number, rx: number, ry: number, holes: [number, number, number][] = []): GrayImage {
  const gray = new Uint8Array(W * H).fill(255)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - W / 2) / rx, dy = (y + 0.5 - H / 2) / ry
    if (dx * dx + dy * dy <= 1) gray[y * W + x] = 0
    for (const [hx, hy, hr] of holes) if ((x + 0.5 - hx) ** 2 + (y + 0.5 - hy) ** 2 <= hr * hr) gray[y * W + x] = 255
  }
  return { width: W, height: H, gray, alpha: null }
}
const reg = (id: string, img: GrayImage) => new Map([[id, img]])

/** Параметры для тестов: без морфологии, подложки и пятен, чтобы силуэт равнялся нарисованному. */
const P = (over: Partial<KeychainParams> & { [k: string]: unknown } = {}): KeychainParams => ({
  ...defaultKeychain, imageId: 'img',
  silhouette: { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 0 },
  base: { ...defaultKeychain.base, thickness: 0 },
  quality: { cell: 0.5, maxTriangles: 400_000 },
  ...over,
})
const bbox = (m: { boundingBox(): { min: number[]; max: number[] } }) => { const b = m.boundingBox(); return { w: b.max[0] - b.min[0], h: b.max[1] - b.min[1], zmin: b.min[2], zmax: b.max[2], cx: (b.max[0] + b.min[0]) / 2, cy: (b.max[1] + b.min[1]) / 2 } }
const solid = async (p: KeychainParams, img: GrayImage) => { const r = await buildKeychain(p, reg('img', img)); if (!r.solid) throw new Error(r.info.error); return r }
/**
 * Допуск габаритов: подогнанная кривая (35) удерживается в fitTolerance от точек контура в узлах,
 * а между узлами может уйти ещё примерно на столько же; к этому прибавляется ступенчатость изолинии
 * маски в тестовом разрешении (~0,9 мм/пикселя). Худшее наблюдаемое отклонение — 0,45 мм от номинала.
 */
const DIM_TOL = defaultKeychain.outline!.fitTolerance + 0.25

describe('validateKeychain (2.1)', () => {
  const ok = P()
  const withRelief = (r: Partial<KeychainParams['relief']>) => P({ relief: { ...ok.relief, ...r } })
  it.each([
    ['по умолчанию', ok, true],
    ['heightFloor равен hmax', withRelief({ heightFloor: 2 }), false],
    ['heightFloor больше hmax', withRelief({ heightFloor: 3 }), false],
    ['heightFloor 0', withRelief({ heightFloor: 0 }), true],
    ['hmax ноль', withRelief({ hmax: 0, heightFloor: 0 }), false],
    ['edgeWidth отрицательный', withRelief({ edgeWidth: -1 }), false],
    ['pow ноль', withRelief({ pow: 0 }), false],
    ['размер ноль', P({ size: { ...ok.size, longest: 0 } }), false],
    ['режим width без ширины', P({ size: { ...ok.size, mode: 'width', width: NaN } }), false],
    ['толщина подложки отрицательная', P({ base: { ...ok.base, thickness: -1 } }), false],
    ['явный прямоугольник без размеров', P({ base: { ...ok.base, shape: 'rect', auto: false, width: 0, height: 10 } }), false],
    ['шаг сетки слишком мелкий', P({ quality: { cell: 0.001, maxTriangles: 400_000 } }), false],
    ['бюджет слишком мал', P({ quality: { cell: 0.2, maxTriangles: 10 } }), false],
  ])('%s', (_n, p, valid) => expect(validateKeychain(p).ok).toBe(valid))
  it('ошибки несут ключи i18n и поля', () => {
    const r = validateKeychain(withRelief({ heightFloor: 5 }))
    expect(r.errors).toEqual([{ field: 'relief.heightFloor', key: 'keychain.error.heightFloor' }])
  })
  it('профиль: плато на ширине скоса, не ниже минимума, монотонен', () => {
    const r = ok.relief
    expect(reliefHeight(100, r)).toBeCloseTo(2, 9)
    expect(reliefHeight(0, r)).toBeCloseTo(r.heightFloor, 9)
    let prev = 0
    for (let d = 0; d <= 8; d += 0.25) { const h = reliefHeight(d, r); expect(h).toBeGreaterThanOrEqual(prev - 1e-12); prev = h }
  })
})

describe('рельеф из сетки (2.2)', () => {
  const disc = shape(200, 200, 80, 80)
  it('диск: замкнутое тело, габарит 70 мм, высота = hmax, спинка на z = 0', async () => {
    const { solid: m, info } = await solid(P(), disc)
    expectValidSolid(m!)
    const b = bbox(m!)
    expect(Math.abs(b.w - 70)).toBeLessThan(DIM_TOL); expect(Math.abs(b.h - 70)).toBeLessThan(DIM_TOL)
    expect(b.zmin).toBeCloseTo(0, 6); expect(b.zmax).toBeCloseTo(2, 3)
    expect(Math.abs(b.cx)).toBeLessThan(0.05); expect(Math.abs(b.cy)).toBeLessThan(0.05)
    expect(info.triangles).toBeGreaterThan(1000)
  })
  it('объём диска близок к аналитическому (интеграл профиля) в пределах 5 %', async () => {
    const { solid: m } = await solid(P(), disc)
    const R = 35, rel = defaultKeychain.relief
    let v = 0
    const n = 4000
    for (let k = 0; k < n; k++) { const r = ((k + 0.5) / n) * R; v += reliefHeight(R - r, rel) * 2 * Math.PI * r * (R / n) }
    expect(Math.abs(m!.volume() - v) / v).toBeLessThan(0.05)
  })
  it('бюджет треугольников соблюдается, шаг увеличивается и сообщается', async () => {
    const { solid: m, info } = await solid(P({ quality: { cell: 0.05, maxTriangles: 30_000 } }), disc)
    expectValidSolid(m!)
    expect(info.reduced).toBe(true)
    expect(info.triangles!).toBeLessThanOrEqual(30_000)
    expect(info.cell!).toBeGreaterThan(0.05)
    const ok = await solid(P({ quality: { cell: 0.5, maxTriangles: 400_000 } }), disc)
    expect(ok.info.reduced).toBe(false); expect(ok.info.cell).toBe(0.5)
  })
  it('effectiveCell: бюджет двигает шаг, желаемый шаг не уменьшается', () => {
    expect(effectiveCell(70, 70, 0.8, { cell: 0.5, maxTriangles: 400_000 }).reduced).toBe(false)
    expect(effectiveCell(70, 70, 0.8, { cell: 0.01, maxTriangles: 100_000 })).toMatchObject({ reduced: true })
  })
  it('область остаётся открытой: сквозное отверстие в сетке и материал вокруг цел', async () => {
    const holey = shape(200, 200, 80, 80, [[100, 100, 20]])
    const base = P({ silhouette: { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 0, fillHoles: true, areas: {} } })
    const filled = await solid(base, holey)
    const open = await solid({ ...base, silhouette: { ...base.silhouette, areas: { 1: { mode: 'open' as const, level: 0.6 } } } }, holey)
    expect(open.solid!.volume()).toBeLessThan(filled.solid!.volume() * 0.95)
    expect(open.solid!.genus()).toBe(1) // одно сквозное отверстие
    expect(filled.solid!.genus()).toBe(0)
  })
  it('силуэт и предпросмотр: id областей стабильны при изменении расширения, предпросмотр помечает залитые и открытые', () => {
    const holey = shape(200, 200, 80, 80, [[70, 100, 12], [130, 100, 12]])
    const s1 = buildSilhouette(holey, { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 0, areas: { 2: { mode: 'open', level: 0.6 } } })
    const s2 = buildSilhouette(holey, { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 3, areas: { 2: { mode: 'open', level: 0.6 } } })
    expect(s1.areas.map((x) => [x.id, x.size, x.open])).toEqual(s2.areas.map((x) => [x.id, x.size, x.open]))
    expect(s1.areas.map((x) => x.open)).toEqual([false, true])
    const pv = maskPreview(holey, s1)!
    expect(Math.max(pv.width, pv.height)).toBeLessThanOrEqual(256)
    const vals = new Set(pv.data)
    expect(vals.has(1) && vals.has(2) && vals.has(3)).toBe(true)
    expect(pv.areas[0].cx).toBeLessThan(pv.areas[1].cx)
  })
  it('автопорог: тёмный объект на светлом даёт непустой силуэт; полностью белая картинка — ошибка «пустая маска»', async () => {
    const white: GrayImage = { width: 50, height: 50, gray: new Uint8Array(2500).fill(255), alpha: null }
    const r = await buildKeychain(P({ silhouette: { ...defaultKeychain.silhouette, threshold: 100 } }), reg('img', white))
    expect(r.solid).toBeNull(); expect(r.info.error).toBe('keychain.error.emptyMask')
    const ok = await buildKeychain(P(), reg('img', disc))
    expect(ok.info.error).toBeUndefined(); expect(ok.info.threshold).toBeGreaterThanOrEqual(0)
  })
  it('нет изображения в реестре — ошибка noImage', async () => {
    expect((await buildKeychain(P({ imageId: 'zzz' }), new Map())).info.error).toBe('keychain.error.noImage')
  })
})

describe('масштаб (2.3)', () => {
  const wide = shape(300, 150, 140, 70)
  it('самая длинная сторона 70 и 40 мм, пропорции сохраняются, высоты не меняются', async () => {
    const a = bbox((await solid(P({ size: { ...defaultKeychain.size, longest: 70 } }), wide)).solid!)
    const b = bbox((await solid(P({ size: { ...defaultKeychain.size, longest: 40 } }), wide)).solid!)
    expect(a.w).toBeCloseTo(70, 1); expect(b.w).toBeCloseTo(40, 1)
    expect(a.w / a.h).toBeCloseTo(2, 1); expect(b.w / b.h).toBeCloseTo(2, 1)
    expect(a.zmax).toBeCloseTo(b.zmax, 3) // высоты в мм не масштабируются
    expect(a.zmax).toBeCloseTo(2, 3)
  })
  it('режимы по ширине и по высоте сохраняют пропорции, режим box растягивает', async () => {
    const w50 = bbox((await solid(P({ size: { ...defaultKeychain.size, mode: 'width', width: 50 } }), wide)).solid!)
    expect(Math.abs(w50.w - 50)).toBeLessThan(DIM_TOL); expect(Math.abs(w50.h - 25)).toBeLessThan(DIM_TOL)
    const h20 = bbox((await solid(P({ size: { ...defaultKeychain.size, mode: 'height', height: 20 } }), wide)).solid!)
    expect(Math.abs(h20.h - 20)).toBeLessThan(DIM_TOL); expect(Math.abs(h20.w - 40)).toBeLessThan(DIM_TOL)
    const box = bbox((await solid(P({ size: { ...defaultKeychain.size, mode: 'box', width: 60, height: 60 } }), wide)).solid!)
    // режим box растягивает контур на рамку; подогнанная кривая (35) в пределах допуска подгонки от рамки
    expect(Math.abs(box.w - 60)).toBeLessThan(DIM_TOL); expect(Math.abs(box.h - 60)).toBeLessThan(DIM_TOL)
  })
  it('sizeMm: чистая функция', () => {
    expect(sizeMm({ mode: 'longest', longest: 70, width: 0, height: 0 }, 300, 150)).toEqual({ w: 70, h: 35 })
    expect(sizeMm({ mode: 'height', longest: 0, width: 0, height: 10 }, 100, 50)).toEqual({ w: 20, h: 10 })
  })
  it('силуэт обрезается по габариту: поля картинки не влияют на размер', async () => {
    const small = shape(300, 300, 70, 70) // тот же диск, но в большой пустой картинке
    const a = bbox((await solid(P(), small)).solid!)
    expect(Math.abs(a.w - 70)).toBeLessThan(DIM_TOL) // контур подогнан кривой (35): габарит в пределах допуска подгонки
  })
})

describe('подложка (2.4)', () => {
  const disc = shape(200, 200, 80, 80)
  const withBase = (b: Partial<KeychainParams['base']>) => P({ base: { ...defaultKeychain.base, thickness: 2, ...b } })
  const components = (m: { decompose(): { delete(): void }[] }) => { const d = m.decompose(); const n = d.length; d.forEach((x) => x.delete()); return n }

  it('по силуэту со смещением 2 мм: контур шире на 4 мм, одно тело, высота base + hmax', async () => {
    const r = await solid(withBase({ shape: 'silhouette', offset: 2 }), disc)
    expectValidSolid(r.solid!)
    const b = bbox(r.solid!)
    expect(b.w).toBeCloseTo(74, 0); expect(b.zmax).toBeCloseTo(4, 2); expect(b.zmin).toBeCloseTo(0, 6)
    expect(components(r.solid!)).toBe(1)
  })
  it('смещение 0: габарит как у рельефа', async () => {
    expect(Math.abs(bbox((await solid(withBase({ shape: 'silhouette', offset: 0 }), disc)).solid!).w - 70)).toBeLessThan(DIM_TOL)
  })
  it('скруглённый прямоугольник: поле 3 мм → 76 × 76', async () => {
    const b = bbox((await solid(withBase({ shape: 'rounded', margin: 3, radius: 4 }), disc)).solid!)
    expect(b.w).toBeCloseTo(76, 1); expect(b.h).toBeCloseTo(76, 1)
  })
  it('прямоугольник с явным размером 80 × 60 при силуэте 70 × 35', async () => {
    const wide = shape(300, 150, 140, 70)
    const b = bbox((await solid(withBase({ shape: 'rect', auto: false, width: 80, height: 60 }), wide)).solid!)
    expect(b.w).toBeCloseTo(80, 1); expect(b.h).toBeCloseTo(60, 1)
  })
  it('круг: автоматический диаметр = диагональ + поля', async () => {
    const square = shape(200, 200, 80, 80)
    const b = bbox((await solid(withBase({ shape: 'circle', margin: 2 }), square)).solid!)
    expect(b.w).toBeCloseTo(Math.hypot(70, 70) + 4, 0)
  })
  it('толщина 0 — только рельеф: высота = hmax, подложки нет', async () => {
    const b = bbox((await solid(withBase({ thickness: 0, shape: 'rect', margin: 10 }), disc)).solid!)
    expect(b.zmax).toBeCloseTo(2, 3); expect(Math.abs(b.w - 70)).toBeLessThan(DIM_TOL)
  })
  it('подложка меньше силуэта: ошибка, геометрии нет', async () => {
    const r = await buildKeychain(withBase({ shape: 'circle', auto: false, width: 60 }), reg('img', disc))
    expect(r.solid).toBeNull(); expect(r.info.error).toBe('keychain.error.plateTooSmall')
    const r2 = await buildKeychain(withBase({ shape: 'rect', auto: false, width: 60, height: 80 }), reg('img', disc))
    expect(r2.info.error).toBe('keychain.error.plateTooSmall')
  })
  it('эталонные настройки (hmax 2, edge 6, pow 0.65, base 2): объём диска = подложка·площадь + интеграл профиля', async () => {
    const { solid: m } = await solid(withBase({ shape: 'silhouette', offset: 0 }), disc)
    const R = 35, rel = defaultKeychain.relief
    let v = Math.PI * R * R * 2
    const n = 4000
    for (let k = 0; k < n; k++) { const r = ((k + 0.5) / n) * R; v += reliefHeight(R - r, rel) * 2 * Math.PI * r * (R / n) }
    expect(Math.abs(m!.volume() - v) / v).toBeLessThan(0.05)
    expect(await getWasm()).toBeTruthy()
  })
})

describe('generate("keychain") (2.5)', () => {
  it('возвращает часть A1 и сведения о силуэте; ошибка пустой маски даёт пустой список частей', async () => {
    registerImage('gen', shape(120, 120, 50, 50))
    const r = await generate('keychain', P({ imageId: 'gen' }))
    expect(r.parts).toHaveLength(1)
    expect(r.parts[0].mesh.volume).toBeGreaterThan(0)
    expect(r.keychain?.size?.[0]).toBeCloseTo(70, 3)
    expect(r.keychain?.preview?.data.length).toBeGreaterThan(0)
    registerImage('white', { width: 20, height: 20, gray: new Uint8Array(400).fill(255), alpha: null })
    const e = await generate('keychain', P({ imageId: 'white', silhouette: { ...defaultKeychain.silhouette, threshold: 10 } }))
    expect(e.parts).toEqual([]); expect(e.keychain?.error).toBe('keychain.error.emptyMask')
  })
})
