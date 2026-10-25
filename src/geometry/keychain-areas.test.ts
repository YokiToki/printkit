import { describe, expect, it } from 'vitest'
import { buildGrid, buildKeychain, buildSilhouette, defaultKeychain, maskPreview, plateSpec, sizeMm, validateKeychain, type AreaSetting, type KeychainParams } from './keychain'
import { maskBounds } from './raster/resample'
import type { GrayImage } from './raster/threshold'
import { expectValidSolid } from './testing'

/** Тёмный диск на белом с круглыми светлыми «областями» внутри: [cx, cy, r]. */
function disc(areas: [number, number, number][]): GrayImage {
  const W = 300, H = 300, gray = new Uint8Array(W * H).fill(255)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x + 0.5 - 150) ** 2 + (y + 0.5 - 150) ** 2 <= 140 ** 2) gray[y * W + x] = 0
    for (const [cx, cy, r] of areas) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) gray[y * W + x] = 255
  }
  return { width: W, height: H, gray, alpha: null }
}
// области нумеруются по порядку первого пикселя сверху вниз: 1 — верхняя, 2 — нижняя левая, 3 — нижняя правая
const IMG = disc([[150, 70, 22], [90, 190, 22], [210, 190, 22]])
const sil = { ...defaultKeychain.silhouette, close: 0, speck: 0, grow: 0 }
const P = (areas: Record<number, AreaSetting> = {}, over: Partial<KeychainParams> = {}): KeychainParams => ({
  ...defaultKeychain, imageId: 'img', silhouette: { ...sil, areas }, size: { ...defaultKeychain.size, longest: 90 },
  base: { ...defaultKeychain.base, thickness: 2 }, quality: { cell: 0.25, maxTriangles: 400_000 }, ...over,
})
const reg = new Map([['img', IMG]])
const lvl = (level: number): AreaSetting => ({ mode: 'level', level })
const open: AreaSetting = { mode: 'open', level: 0.6 }

/** Сетка рельефа как в сборке: с уровнями областей. */
function gridFor(p: KeychainParams) {
  const s = buildSilhouette(IMG, p.silhouette)
  const b = maskBounds(s.mask, IMG.width, IMG.height)!
  const { w: wMm, h: hMm } = sizeMm(p.size, b[2] - b[0] + 1, b[3] - b[1] + 1)
  const plate = plateSpec(p.base, wMm, hMm).spec
  const level = new Map(s.areas.filter((x) => x.mode === 'level').map((x) => [x.id, x.level]))
  const g = buildGrid({ img: IMG, mask: s.mask, bounds: b, wMm, hMm, cell: p.quality.cell, p, plate, plateInGrid: false, levels: level.size ? { ids: s.areaId, level } : undefined })
  return { g, s, b, wMm, hMm }
}
type F = ReturnType<typeof gridFor>
/** Высоты узлов силуэта, у которых расстояние до центра (cx, cy) в пикселях картинки лежит в [r0, r1). */
function topsAt(f: F, cx: number, cy: number, r0: number, r1: number) {
  const { g, b, wMm, hMm } = f
  const k = wMm / (b[2] - b[0] + 1) // мм на пиксель картинки
  const out: number[] = []
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const idx = j * g.nx + i
    if (!g.solid[idx]) continue
    const x = (i - g.i0) * g.dx - wMm / 2, y = hMm / 2 - (j - g.j0) * g.dy
    const px = (b[0] + b[2] + 1) / 2 + x / k, py = (b[1] + b[3] + 1) / 2 - y / k
    const r = Math.hypot(px - cx, py - cy)
    if (r >= r0 && r < r1) out.push(g.top[idx])
  }
  return out
}
const inArea = (f: F, cx: number, cy: number) => topsAt(f, cx, cy, 0, 22 * 0.7)

describe('области в силуэте (1.1)', () => {
  it('номера стабильны и идут по порядку первого пикселя', () => {
    const s = buildSilhouette(IMG, { ...sil, areas: {} })
    expect(s.areas.map((x) => x.id)).toEqual([1, 2, 3])
    expect(s.areas[0].cy).toBeLessThan(s.areas[1].cy)
    expect(s.areas.every((x) => x.mode === 'follow' && !x.open)).toBe(true)
  })
  it('открытая область остаётся фоном, остальные залиты', () => {
    const s = buildSilhouette(IMG, { ...sil, areas: { 2: open } })
    expect(s.mask[190 * 300 + 90]).toBe(0)
    expect(s.mask[70 * 300 + 150]).toBe(1)
    expect(s.mask[190 * 300 + 210]).toBe(1)
    expect(s.areas.map((x) => x.open)).toEqual([false, true, false])
  })
  it('уровень заливает область материалом, как «следует рельефу»', () => {
    const a = buildSilhouette(IMG, { ...sil, areas: {} }), b = buildSilhouette(IMG, { ...sil, areas: { 1: lvl(1), 3: lvl(0.5) } })
    expect(Array.from(b.mask)).toEqual(Array.from(a.mask))
    expect(b.areas.map((x) => x.mode)).toEqual(['level', 'follow', 'level'])
  })
  it('номера и настройки не зависят от несвязанных параметров (расширение, пятна)', () => {
    const a = buildSilhouette(IMG, { ...sil, areas: { 2: open } }), b = buildSilhouette(IMG, { ...sil, grow: 3, speck: 50, areas: { 2: open } })
    expect(b.areas.map((x) => [x.id, x.size, x.mode])).toEqual(a.areas.map((x) => [x.id, x.size, x.mode]))
  })
  it('fillHoles выключен: все области открыты, независимо от настроек', () => {
    const s = buildSilhouette(IMG, { ...sil, fillHoles: false, areas: { 1: lvl(1) } })
    expect(s.areas.every((x) => x.open)).toBe(true)
    expect(s.mask[70 * 300 + 150]).toBe(0)
  })
  it('исчезнувшая область: номера с настройками, которых больше нет, попадают в goneAreas; follow не считается', () => {
    const s = buildSilhouette(IMG, { ...sil, areas: { 2: open, 9: lvl(1), 7: { mode: 'follow', level: 1 } } })
    expect(s.goneAreas).toEqual([9])
    expect(buildSilhouette(IMG, { ...sil, areas: {} }).goneAreas).toEqual([])
  })
  it('предпросмотр: номера областей в плоскости labels, значение 4 для уровней, 2 для открытых', () => {
    const s = buildSilhouette(IMG, { ...sil, areas: { 1: lvl(1), 2: open } })
    const pv = maskPreview(IMG, s)!
    expect(new Set(pv.labels)).toEqual(new Set([0, 1, 2, 3]))
    const at = (id: number) => { const a = pv.areas.find((x) => x.id === id)!; return Math.round(a.cy) * pv.width + Math.round(a.cx) }
    expect([pv.labels[at(1)], pv.data[at(1)]]).toEqual([1, 4])
    expect([pv.labels[at(2)], pv.data[at(2)]]).toEqual([2, 2])
    expect([pv.labels[at(3)], pv.data[at(3)]]).toEqual([3, 3])
  })
})

describe('уровни областей в рельефе (1.2)', () => {
  const decorated = { pattern: { ...defaultKeychain.pattern, kind: 'lines' as const, pitch: 1.5, width: 0.5, depth: 0.3, angle: 0, scope: 'relief' as const }, detail: { ...defaultKeychain.detail, spineAmp: 0.5, grooveDepth: 0.3 } }
  const f = gridFor(P({ 1: lvl(0.6), 3: lvl(1.4) }, decorated))

  it('две области с разными уровнями имеют ровно эти вершины, плоские', () => {
    const t1 = inArea(f, 150, 70), t3 = inArea(f, 210, 190)
    expect(t1.length).toBeGreaterThan(20)
    for (const t of t1) expect(t).toBeCloseTo(2 + 0.6, 5)
    for (const t of t3) expect(t).toBeCloseTo(2 + 1.4, 5)
  })
  it('узор и линии детали внутри уровня отсутствуют, а в остальном рельефе есть', () => {
    const t2 = inArea(f, 90, 190) // следует рельефу, на нём узор
    expect(Math.max(...t2) - Math.min(...t2)).toBeGreaterThan(0.1)
  })
  it('жёсткая ступень на границе: рядом снаружи высота рельефа, а не уровня', () => {
    const ring = topsAt(f, 210, 190, 26, 30)
    expect(ring.length).toBeGreaterThan(10)
    expect(ring.some((t) => Math.abs(t - 3.4) > 0.05)).toBe(true)
  })
  it('уровень ниже минимальной высоты кромки поднимается до неё', () => {
    for (const t of inArea(gridFor(P({ 1: lvl(0.01) })), 150, 70)) expect(t).toBeCloseTo(2 + defaultKeychain.relief.heightFloor, 5)
  })
  it('сглаживание не трогает уровни', () => {
    const sm = gridFor(P({ 1: lvl(0.6) }, { relief: { ...defaultKeychain.relief, smooth: 2 } }))
    for (const t of inArea(sm, 150, 70)) expect(t).toBeCloseTo(2.6, 5)
  })
  it('без уровней результат равен прежнему (follow и open не меняют рельеф)', async () => {
    // равенство объёмов не зависит от шага сетки: берём грубый, чтобы тест не упирался в таймаут на медленном CI
    const coarse = { quality: { cell: 0.6, maxTriangles: 400_000 } }
    const a = await buildKeychain(P({}, coarse), reg), b = await buildKeychain(P({ 1: { mode: 'follow', level: 5 } }, coarse), reg)
    expect(b.solid!.volume()).toBeCloseTo(a.solid!.volume(), 6)
  })
  it('сборка с уровнями — валидное тело; открытая область даёт отверстие', async () => {
    const r = await buildKeychain(P({ 1: lvl(0.6), 2: open, 3: lvl(1.4) }), reg)
    expectValidSolid(r.solid!)
    expect(r.solid!.genus()).toBe(1)
  })
  it('исчезнувший номер попадает в info.goneAreas', async () => {
    const r = await buildKeychain(P({ 9: lvl(1) }), reg)
    expect(r.info.goneAreas).toEqual([9])
  })
})

describe('проверка уровней (1.3)', () => {
  const ok = P()
  it.each([
    ['пусто', {}, true], ['уровень 0', { 1: lvl(0) }, true], ['уровень 2.5', { 1: lvl(2.5) }, true],
    ['отрицательный', { 1: lvl(-0.1) }, false], ['NaN', { 1: lvl(NaN) }, false], ['Infinity', { 1: lvl(Infinity) }, false],
    ['отрицательный, но режим следует', { 1: { mode: 'follow' as const, level: -1 } }, true],
  ])('%s', (_n, areas, valid) => {
    expect(validateKeychain({ ...ok, silhouette: { ...ok.silhouette, areas } }).ok).toBe(valid)
  })
  it('ошибка называет номер области', () => {
    const e = validateKeychain({ ...ok, silhouette: { ...ok.silhouette, areas: { 4: lvl(-1) } } }).errors
    expect(e).toContainEqual({ field: 'silhouette.areas.4', key: 'keychain.error.areaLevel' })
  })
})
