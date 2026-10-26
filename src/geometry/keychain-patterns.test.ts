import { describe, expect, it } from 'vitest'
import {
  buildGrid, buildKeychain, buildSilhouette, defaultKeychain, patternResolution, plateSpec, sizeMm, validateKeychain, brightnessValue,
  type KeychainParams,
} from './keychain'
import { maskBounds } from './raster/resample'
import type { GrayImage } from './raster/threshold'
import { expectValidSolid } from './testing'

/** Эллипс тёмным на белом. */
function shape(W: number, H: number, rx: number, ry: number): GrayImage {
  const gray = new Uint8Array(W * H).fill(255)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x + 0.5 - W / 2) / rx, dy = (y + 0.5 - H / 2) / ry; if (dx * dx + dy * dy <= 1) gray[y * W + x] = 0 }
  return { width: W, height: H, gray, alpha: null }
}
/** Прямоугольник на всю картинку с горизонтальным градиентом яркости 0 → 255 слева направо. */
function gradient(W: number, H: number): GrayImage {
  const gray = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) gray[y * W + x] = Math.round((x / (W - 1)) * 255)
  return { width: W, height: H, gray, alpha: null }
}

const P = (over: Partial<KeychainParams> = {}): KeychainParams => ({
  ...defaultKeychain, imageId: 'img',
  silhouette: { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 0 },
  base: { ...defaultKeychain.base, thickness: 2 },
  quality: { cell: 0.5, maxTriangles: 400_000 },
  ...over,
})
const reg = (img: GrayImage) => new Map([['img', img]])

/** Сетка рельефа для картинки и параметров (как в сборке, без манифолда). */
function gridFor(img: GrayImage, p: KeychainParams, plateInGrid = false) {
  const sil = buildSilhouette(img, p.silhouette)
  const b = maskBounds(sil.mask, img.width, img.height)!
  const { w: wMm, h: hMm } = sizeMm(p.size, b[2] - b[0] + 1, b[3] - b[1] + 1)
  const plate = plateSpec(p.base, wMm, hMm).spec
  const g = buildGrid({ img, mask: sil.mask, bounds: b, wMm, hMm, cell: p.quality.cell, p, plate, plateInGrid })
  return { g, wMm, hMm, plate }
}
const topAt = (g: ReturnType<typeof gridFor>['g'], fx: number, fy: number) => {
  // узел по доле габарита силуэта: i0 + fx·(число блоков)
  const bw = g.nx - 1
  let i1 = 0, j1 = 0
  for (let j = 0; j < g.ny - 1; j++) for (let i = 0; i < bw; i++) if (g.silBlocks[j * bw + i]) { i1 = Math.max(i1, i + 1); j1 = Math.max(j1, j + 1) }
  const i = Math.round(g.i0 + fx * (i1 - g.i0)), j = Math.round(g.j0 + fy * (j1 - g.j0))
  return g.top[j * g.nx + i]
}

describe('источник высоты: яркость (1.2)', () => {
  const img = gradient(240, 80)
  const sil = { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 0, threshold: 255 as const } // весь прямоугольник — силуэт
  const p = (invert = false, over: Partial<KeychainParams['source']> = {}) => P({ silhouette: sil, size: { ...defaultKeychain.size, longest: 120 }, source: { kind: 'brightness', contrast: 1, gamma: 1, invert, ...over }, relief: { ...defaultKeychain.relief, edgeWidth: 3 } })

  it('светлая сторона выше тёмной на заданный диапазон высот', () => {
    const { g } = gridFor(img, p())
    const dark = topAt(g, 0.15, 0.5), bright = topAt(g, 0.85, 0.5)
    expect(bright).toBeGreaterThan(dark + 1) // диапазон ≈ hmax − floor = 1,94 между краями
    expect(bright - dark).toBeLessThanOrEqual(2 - 0.06 + 1e-6)
  })
  it('invert меняет роли', () => {
    const { g } = gridFor(img, p(true))
    expect(topAt(g, 0.15, 0.5)).toBeGreaterThan(topAt(g, 0.85, 0.5) + 1)
  })
  it('кромка не ниже heightFloor (+ подложка), даже на тёмном краю', () => {
    const { g } = gridFor(img, p())
    let min = Infinity
    for (let i = 0; i < g.top.length; i++) if (g.top[i] > 0) min = Math.min(min, g.top[i])
    expect(min).toBeGreaterThanOrEqual(2 + 0.06 - 1e-6)
  })
  it('контраст и гамма: функция яркости монотонна и сдвигает середину', () => {
    const s = { kind: 'brightness' as const, contrast: 1, gamma: 1, invert: false }
    expect(brightnessValue(0.5, s)).toBeCloseTo(0.5, 9)
    expect(brightnessValue(0.7, { ...s, contrast: 2 })).toBeGreaterThan(brightnessValue(0.7, s))
    expect(brightnessValue(0.5, { ...s, gamma: 2 })).toBeLessThan(0.5)
    expect(brightnessValue(0.9, { ...s, contrast: 5 })).toBe(1)
    expect(brightnessValue(0.2, { ...s, invert: true })).toBeCloseTo(0.8, 9)
  })
  it('сборка из яркости — валидное тело нужного размера', async () => {
    const r = await buildKeychain(p(), reg(img))
    expectValidSolid(r.solid!)
    expect(r.solid!.boundingBox().max[0] - r.solid!.boundingBox().min[0]).toBeCloseTo(120, 1)
  })
})

describe('умолчания не изменились (регрессия объёмов из 11)', () => {
  const holey = (() => {
    const img = shape(200, 200, 80, 80)
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if ((x + 0.5 - 100) ** 2 + (y + 0.5 - 100) ** 2 <= 400) img.gray[y * 200 + x] = 255
    return img
  })()
  // объёмы до перехода на гладкий контур (34): охрана прежнего ступенчатого пути (outline не задан)
  const base: KeychainParams = { ...P(), outline: undefined }
  it('диск без подложки, с подложкой по силуэту и со скруглённым прямоугольником совпадают с объёмами до рефакторинга', async () => {
    const run = async (over: Partial<KeychainParams>) => (await buildKeychain({ ...base, ...over }, reg(holey))).solid!.volume()
    expect(await run({ base: { ...base.base, thickness: 0 } })).toBeCloseTo(6905.7119, 2)
    expect(await run({})).toBeCloseTo(14569.7119, 2)
    expect(await run({ base: { ...base.base, shape: 'rounded', margin: 3 } })).toBeCloseTo(18429.0984, 2)
  })
})

describe('профили в геометрии (1.1)', () => {
  const img = shape(240, 240, 100, 100)
  const levels = (p: KeychainParams) => {
    const { g } = gridFor(img, p)
    const s = new Set<number>()
    for (let i = 0; i < g.top.length; i++) if (g.top[i] > 0) s.add(+g.top[i].toFixed(4))
    return s
  }
  const withRelief = (r: Partial<KeychainParams['relief']>) => P({ size: { ...defaultKeychain.size, longest: 50 }, relief: { ...defaultKeychain.relief, edgeWidth: 8, ...r } })

  it('terrace с 3 ступенями: три плоских уровня между кромкой и максимумом', () => {
    const s = levels(withRelief({ profile: 'terrace', steps: 3 }))
    const interior = [...s].filter((v) => Math.abs(v - 2.06) > 1e-3) // кромка — heightFloor
    expect(interior).toHaveLength(3)
    expect(interior.map((v) => +(v - 2).toFixed(3)).sort()).toEqual([+(2 / 3).toFixed(3), +(4 / 3).toFixed(3), 2])
  })
  it('dome: верх плавный, максимум hmax над подложкой', () => {
    const { g } = gridFor(img, withRelief({ profile: 'dome' }))
    let mx = 0
    for (let i = 0; i < g.top.length; i++) mx = Math.max(mx, g.top[i])
    expect(mx).toBeCloseTo(4, 3)
  })
  it('flat: плоский верх одной высоты (кромка выше floor сразу)', () => {
    const s = levels(withRelief({ profile: 'flat' }))
    expect([...s].filter((v) => v > 2.07)).toHaveLength(1)
  })
  it('engraved: внутри силуэта ниже верха подложки, по кромке подложка полной толщины, габарит по высоте = толщина подложки', async () => {
    const p = P({ size: { ...defaultKeychain.size, longest: 50 }, relief: { ...defaultKeychain.relief, edgeWidth: 8, profile: 'engraved' }, base: { ...defaultKeychain.base, thickness: 2, shape: 'circle', margin: 4 } })
    const { g } = gridFor(img, p)
    let min = Infinity
    for (let i = 0; i < g.top.length; i++) if (g.top[i] > 0) min = Math.min(min, g.top[i])
    expect(min).toBeLessThan(1) // выемка глубиной около hmax
    expect(min).toBeGreaterThanOrEqual(0.06 - 1e-6) // не насквозь
    const r = await buildKeychain(p, reg(img))
    expectValidSolid(r.solid!)
    expect(r.solid!.boundingBox().max[2]).toBeCloseTo(2, 3) // верх кольца подложки на её толщине
    const plateOnly = Math.PI * ((Math.hypot(50, 50) + 8) / 2) ** 2 * 2 // круглая подложка толщиной 2 без выемки
    expect(r.solid!.volume()).toBeLessThan(plateOnly)
  })
  it('engraved без подложки отклоняется валидацией', () => {
    const v = validateKeychain(P({ relief: { ...defaultKeychain.relief, profile: 'engraved' }, base: { ...defaultKeychain.base, thickness: 0 } }))
    expect(v.errors.map((e) => e.key)).toContain('keychain.error.engraveNoPlate')
  })
})

describe('детали: хребет и канавка (1.3)', () => {
  const img = shape(300, 90, 140, 40) // вытянутый овал
  const tall = P({ size: { ...defaultKeychain.size, longest: 100 }, base: { ...defaultKeychain.base, thickness: 0 } })

  it('хребет: над плато не выше амплитуды, по центральной линии, симметричен', () => {
    const plain = gridFor(img, tall).g
    const spine = gridFor(img, { ...tall, detail: { ...tall.detail, spineAmp: 0.4, spineWidth: 0.8 } }).g
    let maxPlain = 0, maxSpine = 0
    for (let i = 0; i < plain.top.length; i++) { maxPlain = Math.max(maxPlain, plain.top[i]); maxSpine = Math.max(maxSpine, spine.top[i]) }
    expect(maxSpine).toBeLessThanOrEqual(maxPlain + 0.4 + 1e-6)
    expect(maxSpine).toBeGreaterThan(maxPlain + 0.2) // хребет заметен
    expect(topAt(spine, 0.5, 0.5)).toBeGreaterThan(topAt(spine, 0.5, 0.5 + 0.15) + 0.2) // центр выше фланга
    expect(topAt(spine, 0.5, 0.3)).toBeCloseTo(topAt(spine, 0.5, 0.7), 1)
  })
  it('канавка не опускает высоту ниже heightFloor и выбирает материал вдоль кромки', () => {
    const plain = gridFor(img, tall).g
    const g = gridFor(img, { ...tall, detail: { ...tall.detail, grooveDepth: 5, grooveWidth: 1, grooveOffset: 2 } }).g
    let min = Infinity, lowered = 0
    for (let i = 0; i < g.top.length; i++) if (g.top[i] > 0) { min = Math.min(min, g.top[i]); if (g.top[i] < plain.top[i] - 1e-6) lowered++ }
    expect(min).toBeGreaterThanOrEqual(0.06 - 1e-6)
    expect(lowered).toBeGreaterThan(50)
  })
  it('сборка с хребтом и канавкой — валидное тело', async () => {
    const r = await buildKeychain({ ...tall, base: { ...tall.base, thickness: 2 }, detail: { spineAmp: 0.4, spineWidth: 0.6, grooveDepth: 0.5, grooveWidth: 0.6, grooveOffset: 2 } }, reg(img))
    expectValidSolid(r.solid!)
  })
})

describe('узоры и область применения (2.2)', () => {
  const img = shape(240, 240, 100, 100)
  const pat = (over: Partial<KeychainParams['pattern']> = {}): KeychainParams['pattern'] => ({ ...defaultKeychain.pattern, kind: 'lines', pitch: 2, width: 1, depth: 0.3, angle: 0, scope: 'relief', ...over })
  const p = (over: Partial<KeychainParams> = {}) => P({ size: { ...defaultKeychain.size, longest: 50 }, relief: { ...defaultKeychain.relief, edgeWidth: 5 }, ...over })
  const diff = (a: Float32Array, b: Float32Array) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) n++; return n }

  it('экстремальная глубина: высота не ниже heightFloor + подложка, тело валидно, габарит XY не меняется', async () => {
    const plain = await buildKeychain(p(), reg(img))
    const deep = await buildKeychain(p({ pattern: pat({ depth: 100 }) }), reg(img))
    expectValidSolid(deep.solid!)
    const a = plain.solid!.boundingBox(), b = deep.solid!.boundingBox()
    expect(b.max[0] - b.min[0]).toBeCloseTo(a.max[0] - a.min[0], 3); expect(b.max[1] - b.min[1]).toBeCloseTo(a.max[1] - a.min[1], 3)
    expect(deep.solid!.volume()).toBeLessThan(plain.solid!.volume())
    const { g } = gridFor(img, p({ pattern: pat({ depth: 100 }) }))
    let min = Infinity
    for (let i = 0; i < g.top.length; i++) if (g.top[i] > 0) min = Math.min(min, g.top[i])
    expect(min).toBeGreaterThanOrEqual(2 + 0.06 - 1e-6)
  })
  it('без узора лишней геометрии нет: объём равен объёму без узора', async () => {
    const a = (await buildKeychain(p(), reg(img))).solid!.volume()
    const b = (await buildKeychain(p({ pattern: pat({ kind: 'none' }) }), reg(img))).solid!.volume()
    expect(b).toBe(a)
    const c = (await buildKeychain(p({ pattern: pat({ depth: 0 }) }), reg(img))).solid!.volume()
    expect(c).toBeCloseTo(a, 6)
  })
  it('область «плато»: скос и подложка без узора, «рельеф» затрагивает и скос', () => {
    const plain = gridFor(img, p()).g
    const plateau = gridFor(img, p({ pattern: pat({ scope: 'plateau' }) })).g
    const whole = gridFor(img, p({ pattern: pat({ scope: 'relief' }) })).g
    expect(diff(plain.top, plateau.top)).toBeGreaterThan(0)
    expect(diff(plain.top, whole.top)).toBeGreaterThan(diff(plain.top, plateau.top)) // «весь рельеф» затрагивает больше узлов
    // узлы скоса (расстояние до кромки < ширины скоса) в области «плато» не меняются: у кромки высота как без узора
    const bw = plain.nx
    let edgeChanged = 0
    for (let j = 0; j < plain.ny; j++) for (let i = 0; i < bw; i++) {
      const k = j * bw + i
      if (plain.top[k] > 0 && plain.top[k] < 2 + 1.0 && Math.abs(plain.top[k] - plateau.top[k]) > 1e-6) edgeChanged++
    }
    expect(edgeChanged).toBe(0)
  })
  it('область «подложка»: узор только вокруг силуэта, рельеф не меняется, подложка строится в той же сетке', async () => {
    const base = { ...defaultKeychain.base, thickness: 2, shape: 'rect' as const, margin: 6, auto: true }
    const plain = gridFor(img, p({ base }), true).g
    const onBase = gridFor(img, p({ base, pattern: pat({ scope: 'base', depth: 0.5 }) }), true).g
    // узлы силуэта (высота > толщины подложки) не изменились, а узлы подложки (ровно 2) изменились
    let silChanged = 0, plateChanged = 0
    for (let i = 0; i < plain.top.length; i++) {
      if (Math.abs(plain.top[i] - onBase.top[i]) > 1e-6) { if (plain.top[i] > 2.05) silChanged++; else plateChanged++ }
    }
    expect(silChanged).toBe(0)
    expect(plateChanged).toBeGreaterThan(20)
    const r = await buildKeychain(p({ base, pattern: pat({ scope: 'base', depth: 0.5 }) }), reg(img))
    expectValidSolid(r.solid!)
    const w = r.solid!.boundingBox()
    expect(w.max[0] - w.min[0]).toBeCloseTo(62, 0) // 50 + 2·6: подложка в сетке сохраняет размер
    expect(r.solid!.volume()).toBeLessThan((await buildKeychain(p({ base }), reg(img))).solid!.volume())
  })
  it('область «подложка» без подложки отклоняется валидацией', () => {
    const v = validateKeychain(p({ base: { ...defaultKeychain.base, thickness: 0 }, pattern: pat({ scope: 'base' }) }))
    expect(v.errors.map((e) => e.key)).toContain('keychain.error.scopeNoPlate')
  })
  it.each(['lines', 'crosshatch', 'dots', 'hex', 'ripples'] as const)('%s: сборка даёт валидное тело', async (kind) => {
    const r = await buildKeychain(p({ pattern: pat({ kind, pitch: 2.5, width: 0.8, depth: 0.4, angle: 30 }) }), reg(img))
    expectValidSolid(r.solid!)
  })
})

describe('проверка параметров узоров и профилей (2.3)', () => {
  const ok = P()
  const keys = (p: KeychainParams) => validateKeychain(p).errors.map((e) => e.key)
  it.each([
    ['по умолчанию', ok, []],
    ['ширина ≥ шага', P({ pattern: { ...defaultKeychain.pattern, kind: 'lines', pitch: 1, width: 1 } }), ['keychain.error.patternPitch']],
    ['ширина больше шага', P({ pattern: { ...defaultKeychain.pattern, kind: 'dots', pitch: 1, width: 2 } }), ['keychain.error.patternPitch']],
    ['шаг ноль', P({ pattern: { ...defaultKeychain.pattern, kind: 'hex', pitch: 0 } }), ['keychain.error.size']],
    ['отрицательная глубина', P({ pattern: { ...defaultKeychain.pattern, kind: 'lines', depth: -1 } }), ['keychain.error.negative']],
    ['глубина 0 допустима', P({ pattern: { ...defaultKeychain.pattern, kind: 'lines', depth: 0 } }), []],
    ['узор none не проверяется', P({ pattern: { ...defaultKeychain.pattern, kind: 'none', pitch: 0, width: 5 } }), []],
    ['terrace с 1 ступенью', P({ relief: { ...defaultKeychain.relief, profile: 'terrace', steps: 1 } }), ['keychain.error.steps']],
    ['terrace с 2 ступенями', P({ relief: { ...defaultKeychain.relief, profile: 'terrace', steps: 2 } }), []],
    ['steps не проверяется вне terrace', P({ relief: { ...defaultKeychain.relief, profile: 'bevel', steps: 0 } }), []],
    ['контраст ≤ 0 при яркости', P({ source: { kind: 'brightness', contrast: 0, gamma: 1, invert: false } }), ['keychain.error.contrast']],
    ['гамма ≤ 0 при яркости', P({ source: { kind: 'brightness', contrast: 1, gamma: -1, invert: false } }), ['keychain.error.gamma']],
    ['контраст не проверяется для расстояния', P({ source: { kind: 'distance', contrast: 0, gamma: 0, invert: false } }), []],
    ['хребет без ширины', P({ detail: { ...defaultKeychain.detail, spineAmp: 0.3, spineWidth: 0 } }), ['keychain.error.size']],
    ['отрицательная канавка', P({ detail: { ...defaultKeychain.detail, grooveDepth: -1 } }), ['keychain.error.negative']],
  ])('%s', (_n, p, expected) => expect(keys(p)).toEqual(expected))
})

describe('разрешение и узор (2.4)', () => {
  const pat = { ...defaultKeychain.pattern, kind: 'lines' as const }
  it('предупреждение, когда шаг меньше четырёх ячеек; нет — когда не меньше', () => {
    expect(patternResolution({ ...pat, pitch: 0.8 }, 0.25, 0.1).tooFine).toBe(true)
    expect(patternResolution({ ...pat, pitch: 1.0 }, 0.25, 0.1).tooFine).toBe(false)
    expect(patternResolution({ ...pat, kind: 'none', pitch: 0.1 }, 0.25, 0.1).tooFine).toBe(false)
    expect(patternResolution({ ...pat, pitch: 0.8 }, 0.25, 0.1).minPitch).toBeCloseTo(1, 9)
  })
  it('поднять разрешение: предел по бюджету, после подъёма предупреждение исчезает, если шаг достижим', () => {
    const r = patternResolution({ ...pat, pitch: 0.8 }, 0.25, 0.1)
    expect(r.canRaise).toBe(true); expect(r.raiseTo).toBeCloseTo(0.1, 9)
    expect(patternResolution({ ...pat, pitch: 0.8 }, r.raiseTo, 0.1).tooFine).toBe(false)
    // бюджет не позволяет мельче: поднять нельзя, предупреждение остаётся
    const stuck = patternResolution({ ...pat, pitch: 0.8 }, 0.4, 0.4)
    expect(stuck.canRaise).toBe(false); expect(stuck.tooFine).toBe(true)
  })
  it('сборка сообщает предел по бюджету (minCell) и он не больше текущего шага при запасе бюджета', async () => {
    const r = await buildKeychain(P({ size: { ...defaultKeychain.size, longest: 40 } }), new Map([['img', shape(160, 160, 70, 70)]]))
    expect(r.info.minCell).toBeLessThan(r.info.cell!)
  })
})
