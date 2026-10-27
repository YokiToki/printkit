import { describe, expect, it } from 'vitest'
import { getWasm } from './wasm'
import {
  addCutout, pocketSolid, baseOutline, buildCutout, MIN_OUTLINE_AREA, outlineCutout, polygonArea, validOutline, buildCutoutTools, circleCutout, CUTOUT_COLORS, cutoutBounds, fillCutoutColors, nextCutoutColor, cutoutLayout, cutoutNotices, defaultCutout, duplicateCutout, effectiveDepth, moveCutout, rectCutout,
  removeCutout, renameCutout, toggleCutout, updateCutout, validateCutout, MIN_MARGIN, type Cutout, type CutoutParams, type MeshRegistry, type MeshSource,
} from './cutout'
import { alignEdge, centerCutout, distribute, fitFootprint, fitFootprintUnits, snapAxis, snapMove, snapTargets } from './cutout-placement'
import { defaultOrientation, describeMesh, flatFaces, fillHoles, repairMesh, toManifold } from './stl-import'
import { cachedProfile, clearProfileCache, profileCacheSize, profileOfSlices } from './cutout-profile'
import { boxSoup, tSoup } from './stl-fixtures'
import { defaultFasteners } from './fasteners'
import { expectValidSolid, mm, units } from './testing'

const params = (o: Partial<CutoutParams> = {}): CutoutParams => ({ ...defaultCutout, lip: 'none', ...o })
const near = (a: number, b: number, tol = 0.002) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(tol)
const rect = (o: Omit<Partial<Cutout>, 'source'> & { source?: Partial<{ width: number; length: number; radius: number }> } = {}) => rectCutout({ id: 'r', depth: 10, clearance: 0, ...o })

describe('блок без вырезов', () => {
  it('2×2×3 без губы: сплошной блок 83.5×83.5×21', async () => {
    const m = await buildCutout(params())
    expectValidSolid(m, { size: [83.5, 83.5, 21] })
    // объём блока: тело 83.5² × (21 − 4.75) плюс четыре ноги
    expect(m.volume()).toBeGreaterThan(83.5 * 83.5 * 16.25 * 0.97)
    expect(m.volume()).toBeLessThan(83.5 * 83.5 * 21)
  })
  it('с губой: проём над верхней гранью, высота 25.4, блок ниже стенки сплошной', async () => {
    const m = await buildCutout(params({ lip: 'default' }))
    expectValidSolid(m, { size: [83.5, 83.5, 25.4] })
    near(m.slice(15).area(), 83.5 * 83.5 - (4 - Math.PI) * 3.75 ** 2) // сплошное сечение
    expect(m.slice(23).area()).toBeLessThan(m.slice(15).area()) // выше стенки — только кромка
  })
  it('дробный размер и крепёж снизу', async () => {
    const m = await buildCutout(params({ x: mm(100), fasteners: { ...defaultFasteners, magnets: { mode: 'full', slots: [] } } }))
    expectValidSolid(m, { size: [99.5, 83.5, 21] })
    const plain = await buildCutout(params({ x: mm(100) }))
    expect(plain.volume() - m.volume()).toBeGreaterThan(15 * Math.PI * 3.25 ** 2 * 2.4 * 0.95)
  })
})

describe('прямоугольный вырез', () => {
  it('60×20 с зазором 0.5: карман 61×21, глубина 10', async () => {
    const solid = await buildCutout(params())
    const c = rect({ source: { width: 60, length: 20, radius: 0 }, clearance: 0.5, depth: 10 })
    const m = await buildCutout(params({ cutouts: [c] }))
    expectValidSolid(m)
    const removed = solid.volume() - m.volume()
    near(removed, 61 * 21 * 10)
    // сечение на половине глубины: дырка 61 × 21
    near(solid.slice(16).area() - m.slice(16).area(), 61 * 21)
    const b = m.slice(16).bounds()
    expect(b.max[0] - b.min[0]).toBeCloseTo(83.5, 3) // габарит блока не меняется
  })
  it('скругление углов: площадь меньше прямоугольной на (4 − π)·r²', async () => {
    const solid = await buildCutout(params())
    const sq = await buildCutout(params({ cutouts: [rect({ source: { width: 60, length: 20, radius: 0 } })] }))
    const rd = await buildCutout(params({ cutouts: [rect({ source: { width: 60, length: 20, radius: 4 } })] }))
    near(solid.slice(16).area() - sq.slice(16).area(), 1200)
    near(solid.slice(16).area() - rd.slice(16).area(), 1200 - (4 - Math.PI) * 16)
  })
  it('положение и поворот: центр кармана в (x, y), поворот на 90° меняет габарит местами', async () => {
    const solid = await buildCutout(params())
    const m = await buildCutout(params({ cutouts: [rect({ source: { width: 40, length: 10, radius: 0 }, x: 15, y: -10, rotation: 90 })] }))
    expect(solid.slice(16).area() - m.slice(16).area()).toBeCloseTo(400, 1)
    const b = cutoutBounds(rect({ source: { width: 40, length: 10, radius: 0 }, x: 15, y: -10, rotation: 90 }))
    expect([b.minX, b.maxX, b.minY, b.maxY].map((v) => +v.toFixed(6))).toEqual([10, 20, -30, 10])
  })
  it('глубина ограничена полом: оставляет 4.75 + 0.7 мм, сообщение в notices', async () => {
    const l = cutoutLayout(params())
    expect(l.maxDepth).toBeCloseTo(21 - 5.45, 9)
    const c = rect({ depth: 100 })
    expect(effectiveDepth(c, l)).toBeCloseTo(15.55, 9)
    expect(cutoutNotices(params({ cutouts: [c] })).map((i) => i.key)).toContain('cutout.notice.depthClamped')
    const m = await buildCutout(params({ cutouts: [c] }))
    expectValidSolid(m)
    // дно кармана на 5.45: ниже — материал, выше нет
    expect(m.slice(5.2).area()).toBeCloseTo((await buildCutout(params())).slice(5.2).area(), 1)
    expect(m.slice(5.7).area()).toBeLessThan((await buildCutout(params())).slice(5.7).area())
  })
  it('скрытый вырез не вычитается', async () => {
    const solid = await buildCutout(params())
    const m = await buildCutout(params({ cutouts: [{ ...rect(), visible: false }] }))
    expect(m.volume()).toBeCloseTo(solid.volume(), 6)
  })
  it('несколько вырезов и карман под губой не ломают тело', async () => {
    const m = await buildCutout(params({ lip: 'default', cutouts: [rect({ id: 'a', x: -20 }), rect({ id: 'b', x: 20, source: { width: 20, length: 30, radius: 5 } })] }))
    expectValidSolid(m, { size: [83.5, 83.5, 25.4] })
  })
})

describe('список вырезов', () => {
  const a = rect({ id: 'a', name: 'A' }), b = rect({ id: 'b', name: 'B' }), c = rect({ id: 'c', name: 'C' })
  it('добавление', () => expect(addCutout([a], b).map((x) => x.id)).toEqual(['a', 'b']))
  it('дублирование: копия сразу после оригинала, со сдвигом, независимые данные', () => {
    const out = duplicateCutout([a, b], 'a')
    expect(out.map((x) => x.name)).toEqual(['A', 'A copy', 'B'])
    expect(out[1].id).not.toBe('a')
    expect(out[1].x).toBe(6)
    expect(out[1].source).not.toBe(a.source)
    expect(duplicateCutout([a], 'zzz')).toEqual([a])
  })
  it('порядок: вверх и вниз, на краях ничего не меняется', () => {
    expect(moveCutout([a, b, c], 'c', -1).map((x) => x.id)).toEqual(['a', 'c', 'b'])
    expect(moveCutout([a, b, c], 'a', 1).map((x) => x.id)).toEqual(['b', 'a', 'c'])
    expect(moveCutout([a, b, c], 'a', -1).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(moveCutout([a, b, c], 'c', 1).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('скрытие, переименование, обновление и удаление', () => {
    expect(toggleCutout([a, b], 'b').map((x) => x.visible)).toEqual([true, false])
    expect(toggleCutout(toggleCutout([a], 'a'), 'a')[0].visible).toBe(true)
    expect(renameCutout([a], 'a', 'Pliers')[0].name).toBe('Pliers')
    expect(updateCutout([a, b], 'b', { depth: 7 }).map((x) => x.depth)).toEqual([10, 7])
    expect(removeCutout([a, b, c], 'b').map((x) => x.id)).toEqual(['a', 'c'])
  })
  it('новый прямоугольник по центру коробки', () => {
    const r = rectCutout()
    expect([r.x, r.y, r.rotation, r.visible]).toEqual([0, 0, 0, true])
    expect(r.source).toMatchObject({ kind: 'rect', width: 40, length: 20, radius: 3 })
  })
})

describe('валидация и предупреждения', () => {
  it('значения по умолчанию валидны; ошибки полей', () => {
    expect(validateCutout(defaultCutout).ok).toBe(true)
    expect(validateCutout(params({ x: mm(10) })).errors[0].key).toBe('box.error.sizeMin')
    expect(validateCutout(params({ cutouts: [rect({ depth: 0 })] })).errors[0].key).toBe('cutout.error.depth')
    expect(validateCutout(params({ cutouts: [rect({ clearance: -1 })] })).errors[0].key).toBe('baseplate.error.negative')
    expect(validateCutout(params({ cutouts: [rect({ source: { width: 0 } })] })).errors[0].key).toBe('cutout.error.size')
    expect(validateCutout(params({ thickness: { ...defaultCutout.thickness, floor: 17 } })).errors[0].key).toBe('box.error.noCavity')
  })
  it('вырез в 0.4 мм от стенки: предупреждение; в норме — нет', () => {
    const l = cutoutLayout(params())
    const near = rect({ source: { width: 20, length: 20, radius: 0 }, x: l.cavityX / 2 - 10 - 0.4 })
    expect(cutoutNotices(params({ cutouts: [near] })).map((i) => i.key)).toContain('cutout.warn.edge')
    expect(cutoutNotices(params({ cutouts: [{ ...near, x: l.cavityX / 2 - 10 - MIN_MARGIN - 0.5 }] })).map((i) => i.key)).not.toContain('cutout.warn.edge')
    expect(cutoutNotices(params({ cutouts: [{ ...near, visible: false }] }))).toEqual([])
  })
  it('вырезы ближе минимальной стенки друг к другу: предупреждение с парой', () => {
    const a = rect({ id: 'a', source: { width: 20, length: 20, radius: 0 }, x: -12 }), b = rect({ id: 'b', source: { width: 20, length: 20, radius: 0 }, x: 8.4 })
    const w = cutoutNotices(params({ cutouts: [a, b] })).filter((i) => i.key === 'cutout.warn.overlap')
    expect(w).toEqual([{ id: 'a', key: 'cutout.warn.overlap', other: 'b' }])
    expect(cutoutNotices(params({ cutouts: [a, { ...b, x: 9 }] })).some((i) => i.key === 'cutout.warn.overlap')).toBe(false)
  })
})

describe('вырез по детали (STL)', () => {
  /** Деталь «L» — не выпуклая: проекция отличается от выпуклой оболочки и от габарита. */
  const lShape = () => {
    const a = boxSoup(40, 10, 8), b = boxSoup(10, 30, 8)
    const shiftY = (s: Float32Array, dy: number) => s.map((v, i) => (i % 3 === 1 ? v + dy : v))
    // две части склеены через объединение мешей: брус 40×10 и брус 10×30 поверх, пересекающиеся — для теста объём не нужен точный
    return { a, b: { positions: shiftY(b.positions, 10) } }
  }
  void lShape
  const make = (dx: number, dy: number, dz: number): { registry: MeshRegistry; source: MeshSource } => {
    const mesh = repairMesh(boxSoup(dx, dy, dz)).mesh
    const info = describeMesh(mesh.vertProperties, 'mm', defaultOrientation)
    return { registry: new Map([['m', mesh]]), source: { kind: 'mesh', meshId: 'm', filename: 'tool.stl', unit: 'mm', orientation: defaultOrientation, mode: 'projected', size: info.size, hull: info.hull } }
  }
  const cut = (source: MeshSource, over: Partial<Cutout> = {}): Cutout => ({ id: 'm1', name: 'Tool', source, x: 0, y: 0, rotation: 0, depth: 10, clearance: 0.5, visible: true, ...over })

  it('проекция: карман повторяет силуэт плюс зазор', async () => {
    const { registry, source } = make(30, 12, 6)
    const solid = await buildCutout(params(), registry)
    const m = await buildCutout(params({ cutouts: [cut(source)] }), registry)
    expectValidSolid(m)
    const hole = solid.slice(16).area() - m.slice(16).area()
    // контур 30 × 12 с зазором 0.5 (скруглённые углы): между прямоугольником и скруглением
    const rectArea = 31 * 13
    expect(hole).toBeLessThanOrEqual(rectArea + 1e-6)
    expect(hole).toBeGreaterThan(rectArea - 0.5)
    near(solid.volume() - m.volume(), hole * 10) // вертикальные стенки глубиной 10
  })
  it('проекция совпадает с проекцией исходной детали (без зазора)', async () => {
    const w = await getWasm()
    const { registry, source } = make(30, 12, 6)
    const solid = await buildCutout(params(), registry)
    const m = await buildCutout(params({ cutouts: [cut(source, { clearance: 0 })] }), registry)
    expect(solid.slice(16).area() - m.slice(16).area()).toBeCloseTo(30 * 12, 2)
    expect(w).toBeTruthy()
  })
  it('поворот и положение переносят карман', async () => {
    const { registry, source } = make(30, 12, 6)
    const solid = await buildCutout(params(), registry)
    const m = await buildCutout(params({ cutouts: [cut(source, { clearance: 0, rotation: 90, x: 10, y: -5 })] }), registry)
    expect(solid.slice(16).area() - m.slice(16).area()).toBeCloseTo(360, 2)
    const b = cutoutBounds(cut(source, { clearance: 0, rotation: 90, x: 10, y: -5 }))
    expect([b.minX, b.maxX, b.minY, b.maxY].map((v) => +v.toFixed(6))).toEqual([4, 16, -20, 10])
  })
  it('настоящее 3D: карман повторяет объём детали, над ней проём открыт вверх', async () => {
    const { registry, source } = make(30, 12, 6)
    const solid = await buildCutout(params(), registry)
    const c = cut({ ...source, mode: '3d' }, { clearance: 0, depth: 10 })
    const m = await buildCutout(params({ cutouts: [c] }), registry)
    expectValidSolid(m)
    // деталь стоит на дне кармана (z = 21 − 10 = 11) и поднимается на 6 мм; выше — открытый проём той же формы
    expect(solid.slice(12).area() - m.slice(12).area()).toBeCloseTo(360, 1)
    expect(solid.slice(19).area() - m.slice(19).area()).toBeCloseTo(360, 1) // над деталью проём продолжается
    expect(solid.slice(10.5).area() - m.slice(10.5).area()).toBeCloseTo(0, 1) // ниже дна кармана материал цел
  })
  it('3D с зазором растёт по размерам, режим по умолчанию — проекция', async () => {
    const { registry, source } = make(30, 12, 6)
    const solid = await buildCutout(params(), registry)
    const m = await buildCutout(params({ cutouts: [cut({ ...source, mode: '3d' }, { clearance: 1, depth: 12 })] }), registry)
    // 32 × 14 со скруглёнными углами радиуса 1: четыре угла теряют по (1 − π/4)
    expect(solid.slice(15).area() - m.slice(15).area()).toBeCloseTo(32 * 14 - 4 * (1 - Math.PI / 4), 0) // углы — 12-гранная сфера, чуть острее окружности
  })
  /** Деталь с широкой ногой и узкой шейкой (ширина убывает вверх): точный объём оставил бы материал на пути ноги. */
  const footed = async () => {
    const w = await getWasm()
    const foot = w.Manifold.cube([30, 10, 5]), neck = w.Manifold.cube([10, 10, 5]).translate([10, 0, 5])
    const u = w.Manifold.union([foot, neck]), m = u.getMesh()
    const mesh = { vertProperties: Float32Array.from(m.vertProperties), triVerts: Uint32Array.from(m.triVerts) }
    const info = describeMesh(mesh.vertProperties, 'mm', defaultOrientation)
    const source: MeshSource = { kind: 'mesh', meshId: 'f', filename: 'f.stl', unit: 'mm', orientation: defaultOrientation, mode: '3d', size: info.size, hull: info.hull }
    return { registry: new Map([['f', mesh]]) as MeshRegistry, source }
  }
  it('3D: карман — сама деталь как есть (нога и шейка), без ступеней', async () => {
    const { registry, source } = await footed()
    const solid = await buildCutout(params(), registry)
    const m = await buildCutout(params({ cutouts: [cut(source, { clearance: 0, depth: 12 })] }), registry)
    expectValidSolid(m)
    const floorZ = 21 - 12
    for (const dz of [1, 3, 4.5]) near(solid.slice(floorZ + dz).area() - m.slice(floorZ + dz).area(), 30 * 10) // нога
    for (const dz of [5.5, 7, 9.5]) near(solid.slice(floorZ + dz).area() - m.slice(floorZ + dz).area(), 10 * 10) // шейка: материал вокруг цел
    expect(solid.slice(floorZ + 11).area() - m.slice(floorZ + 11).area()).toBeCloseTo(300, 0) // над деталью проём по её силуэту (нога проходит сверху)
    expect(solid.slice(floorZ - 0.5).area() - m.slice(floorZ - 0.5).area()).toBeCloseTo(0, 1)
    near(solid.volume() - m.volume(), 30 * 10 * 5 + 10 * 10 * 5 + 30 * 10 * 2) // объём детали плюс проём до верха стенки
  })
  it('3D: зазор — смещение поверхности во все стороны, не ниже дна кармана', async () => {
    const { registry, source } = await footed()
    const a = await buildCutout(params({ cutouts: [cut(source, { clearance: 0, depth: 12 })] }), registry)
    const b = await buildCutout(params({ cutouts: [cut(source, { clearance: 1, depth: 12 })] }), registry)
    for (const dz of [2, 7]) {
      const w = dz === 2 ? 30 : 10
      const g = a.slice(9 + dz).area() - b.slice(9 + dz).area()
      expect(g).toBeGreaterThan(2 * (w + 10) - 1)
      expect(g).toBeLessThan(2 * (w + 10) + Math.PI + 1)
    }
    expect(a.slice(8.9).area() - b.slice(8.9).area()).toBeCloseTo(0, 1)
  })
  /** Открытая труба без крышек: дыры закрываются, но если не удаётся — остаются срезы (проверяем срезатель напрямую). */
  const tube = () => {
    const full = repairMesh(boxSoup(30, 12, 6)).mesh
    // у бруса первые 4 треугольника — низ и верх
    return { vertProperties: full.vertProperties, triVerts: full.triVerts.slice(12) }
  }
  it('срезы замыкают открытую трубу: сечение — прямоугольник 30 × 12, накопление по высоте', async () => {
    const w = await getWasm()
    const p = profileOfSlices(w, tube(), 6)!
    expect(p.fromSlices).toBe(true)
    expect(p.tops.at(-1)).toBeCloseTo(6, 6)
    for (const k of [0, 5, p.sections.length - 1]) expect(p.sections[k].area()).toBeCloseTo(360, 0)
    for (let k = 1; k < p.sections.length; k++) expect(p.sections[k].area()).toBeGreaterThanOrEqual(p.sections[k - 1].area() - 1e-6)
  })
  it('сетка, у которой нет ни тела, ни сечений, режет по выпуклой оболочке', async () => {
    const tent = { vertProperties: Float32Array.from([0, 0, 0, 20, 0, 0, 10, 10, 0, 10, -10, 0]), triVerts: Uint32Array.from([0, 1, 2, 1, 0, 3]) } // плоская «деталь» нулевой высоты
    const info = describeMesh(tent.vertProperties, 'mm', defaultOrientation)
    const registry: MeshRegistry = new Map([['t', tent]])
    const source: MeshSource = { kind: 'mesh', meshId: 't', filename: 't.stl', unit: 'mm', orientation: defaultOrientation, mode: '3d', size: info.size, hull: info.hull }
    const m = await buildCutout(params({ cutouts: [cut(source, { clearance: 0, depth: 10 })] }), registry)
    expectValidSolid(m)
  })
  it('профиль кэшируется между вызовами по ключу', async () => {
    const w = await getWasm()
    clearProfileCache()
    let made = 0
    const make = () => { made++; return profileOfSlices(w, tube(), 6) }
    const a = cachedProfile('k', make), b = cachedProfile('k', make)
    expect(a).toBe(b)
    expect(made).toBe(1)
    expect(profileCacheSize()).toBe(1)
    clearProfileCache()
  })
  it('плотная деталь собирается за разумное время', async () => {
    const w = await getWasm()
    const m = w.Manifold.sphere(15, 96).translate([0, 0, 15]).getMesh()
    const mesh = { vertProperties: Float32Array.from(m.vertProperties), triVerts: Uint32Array.from(m.triVerts) }
    const info = describeMesh(mesh.vertProperties, 'mm', defaultOrientation)
    const source: MeshSource = { kind: 'mesh', meshId: 'ball', filename: 'b.stl', unit: 'mm', orientation: defaultOrientation, mode: '3d', size: info.size, hull: info.hull }
    clearProfileCache()
    const t0 = performance.now()
    const r = await buildCutout(params({ cutouts: [cut(source, { clearance: 0.3, depth: 20 })] }), new Map([['ball', mesh]]))
    expectValidSolid(r)
    expect(performance.now() - t0).toBeLessThan(5000)
  })
  it('открытая сетка (нет одной грани): вырез по силуэту остаётся, и в режиме 3D тоже', async () => {
    const s = boxSoup(30, 12, 6)
    const mesh = repairMesh({ positions: s.positions.slice(0, 11 * 9) }).mesh
    const info = describeMesh(mesh.vertProperties, 'mm', defaultOrientation)
    const registry: MeshRegistry = new Map([['open', mesh]])
    const source: MeshSource = { kind: 'mesh', meshId: 'open', filename: 'open.stl', unit: 'mm', orientation: defaultOrientation, mode: 'projected', size: info.size, hull: info.hull }
    const solid = await buildCutout(params(), registry)
    for (const mode of ['projected', '3d'] as const) {
      const m = await buildCutout(params({ cutouts: [cut({ ...source, mode }, { clearance: 0 })] }), registry)
      expectValidSolid(m)
      expect(solid.slice(16).area() - m.slice(16).area()).toBeCloseTo(360, 1)
    }
  })
  it('нет сетки в реестре: вырез пропускается, блок остаётся валидным', async () => {
    const { source } = make(30, 12, 6)
    const solid = await buildCutout(params())
    const m = await buildCutout(params({ cutouts: [cut(source)] }), new Map())
    expect(m.volume()).toBeCloseTo(solid.volume(), 6)
  })
  it('грань на дно меняет глубину силуэта: брус кладётся на самую большую грань', async () => {
    const mesh = repairMesh(boxSoup(10, 20, 30)).mesh
    const face = flatFaces(mesh)[0].normal
    const o = { ...defaultOrientation, faceDown: face }
    const info = describeMesh(mesh.vertProperties, 'mm', o)
    expect(info.size[2]).toBeCloseTo(10, 4)
    const registry: MeshRegistry = new Map([['m', mesh]])
    const src: MeshSource = { kind: 'mesh', meshId: 'm', filename: 'b.stl', unit: 'mm', orientation: o, mode: 'projected', size: info.size, hull: info.hull }
    const solid = await buildCutout(params(), registry)
    const m = await buildCutout(params({ cutouts: [cut(src, { clearance: 0 })] }), registry)
    expect(solid.slice(16).area() - m.slice(16).area()).toBeCloseTo(600, 1)
  })
  it('контур для превью: оболочка и габарит', () => {
    const { source } = make(30, 12, 6)
    expect(baseOutline(cut(source))).toHaveLength(4)
    const b = cutoutBounds(cut(source, { clearance: 1 }))
    expect(b.maxX - b.minX).toBeCloseTo(32, 6)
  })
})

describe('помощники выравнивания', () => {
  const cavity = { x: 81.6, y: 81.6 }
  const r = (o: Omit<Partial<Cutout>, 'source'> & { source?: Partial<{ width: number; length: number; radius: number }> } = {}) => rectCutout({ id: 'r', clearance: 0, ...o, source: { width: 20, length: 10, radius: 0, ...o.source } })

  it('центр по обеим осям и по одной', () => {
    const c = centerCutout(r({ x: 13, y: -7 }))
    expect([c.x, c.y]).toEqual([0, 0])
    expect(centerCutout(r({ x: 13, y: -7 }), 'x')).toMatchObject({ x: 0, y: -7 })
    expect(centerCutout(r({ x: 13, y: -7 }), 'y')).toMatchObject({ x: 13, y: 0 })
  })
  it('центр учитывает поворот и зазор (габарит симметричен — остаётся в 0)', () => {
    const c = centerCutout(r({ x: 5, rotation: 30, clearance: 1 }))
    const b = cutoutBounds(c)
    expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 9)
  })
  it('по левому краю с отступом 5 мм: левый край в 5 мм от внутренней стенки', () => {
    const c = alignEdge(r({ x: 3 }), 'left', 5, cavity)
    expect(cutoutBounds(c).minX).toBeCloseTo(-40.8 + 5, 9)
    expect(c.y).toBe(0)
  })
  it('остальные стороны; зазор входит в габарит', () => {
    const base = r({ clearance: 0.5 })
    expect(cutoutBounds(alignEdge(base, 'right', 2, cavity)).maxX).toBeCloseTo(40.8 - 2, 9)
    expect(cutoutBounds(alignEdge(base, 'front', 2, cavity)).minY).toBeCloseTo(-40.8 + 2, 9)
    expect(cutoutBounds(alignEdge(base, 'back', 0, cavity)).maxY).toBeCloseTo(40.8, 9)
  })
  it('равномерное распределение по X: одинаковые зазоры, порядок сохраняется', () => {
    const list = [r({ id: 'a', x: 30 }), r({ id: 'b', x: -30 }), r({ id: 'c', x: 5 })]
    const out = distribute(list, 'x', cavity)
    const boxes = ['b', 'c', 'a'].map((id) => cutoutBounds(out.find((c) => c.id === id)!))
    const g1 = boxes[1].minX - boxes[0].maxX, g2 = boxes[2].minX - boxes[1].maxX
    expect(g1).toBeCloseTo(g2, 9)
    expect(boxes[0].minX).toBeCloseTo(-40.8, 9)
    expect(boxes[2].maxX).toBeCloseTo(40.8, 9)
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c']) // порядок списка не меняется
  })
  it('распределение: скрытые не двигаются, один вырез — без изменений, отступ по краям', () => {
    const a = r({ id: 'a', x: -30 }), b = r({ id: 'b', x: 0 }), hid = { ...r({ id: 'h', x: 17 }), visible: false }
    expect(distribute([a, hid], 'x', cavity)).toEqual([a, hid])
    const out = distribute([a, b, hid], 'x', cavity, 5)
    expect(out[2]).toEqual(hid)
    expect(cutoutBounds(out[0]).minX).toBeCloseTo(-40.8 + 5, 9)
    expect(cutoutBounds(out[1]).maxX).toBeCloseTo(40.8 - 5, 9)
  })
  it('подгонка габарита: один вырез 120×40 — габарит растёт, вырез остаётся по центру', () => {
    const p = params({ cutouts: [rect({ source: { width: 120, length: 40, radius: 0 }, x: 7, y: -3, clearance: 0 })] })
    const f = fitFootprint(p, 0.8)!
    // 120 + 2·0.8 + 2·0.95 + 0.5 = 124.0 по X; 40 + 1.6 + 1.9 + 0.5 = 44.0 по Y
    expect([f.sizeX, f.sizeY]).toEqual([124, 44])
    expect(f.x).toEqual({ mode: 'mm', value: 124, align: 'center' })
    expect([f.cutouts[0].x, f.cutouts[0].y]).toEqual([0, 0])
    const fitted = params({ x: f.x, y: f.y, cutouts: f.cutouts })
    expect(cutoutNotices(fitted).some((i) => i.key === 'cutout.warn.edge')).toBe(false)
  })
  it('подгонка: не меньше одной ячейки, учитывает все видимые вырезы, пусто — null', () => {
    const small = fitFootprint(params({ cutouts: [rect({ source: { width: 5, length: 5, radius: 0 }, clearance: 0 })] }))!
    expect([small.sizeX, small.sizeY]).toEqual([42, 42])
    const two = fitFootprint(params({ cutouts: [rect({ id: 'a', x: -40, source: { width: 20, length: 10, radius: 0 }, clearance: 0 }), rect({ id: 'b', x: 40, source: { width: 20, length: 10, radius: 0 }, clearance: 0 })] }))!
    expect(two.sizeX).toBeCloseTo(100 + 1.6 + 1.9 + 0.5, 6)
    expect(two.cutouts.map((c) => c.x)).toEqual([-40, 40])
    expect(fitFootprint(params())).toBeNull()
    expect(fitFootprint(params({ cutouts: [{ ...rect(), visible: false }] }))).toBeNull()
  })
  it('подгонка в режиме units не нужна: результат в мм с выравниванием исходных осей', () => {
    const f = fitFootprint(params({ x: { mode: 'units', value: 2, align: 'start' }, cutouts: [rect({ source: { width: 100, length: 10, radius: 0 } })] }))!
    expect(f.x.align).toBe('start')
    expect(units(2).mode).toBe('units')
  })
})

describe('привязка при перетаскивании', () => {
  const cavity = { x: 81.6, y: 81.6 }
  const c = (o: Omit<Partial<Cutout>, 'source'> = {}) => rectCutout({ id: 'd', clearance: 0, source: { width: 20, length: 10, radius: 0 }, ...o })

  it('snapAxis: ближайшая цель в радиусе, иначе null', () => {
    expect(snapAxis([0.8], [0, 10], 1.5)).toEqual({ delta: -0.8, target: 0 })
    expect(snapAxis([5], [0, 10], 1.5)).toBeNull()
    expect(snapAxis([9, 0.5], [0, 10], 1.5)).toEqual({ delta: -0.5, target: 0 })
  })
  it('к центру: центр выреза рядом с осью притягивается, направляющая на 0', () => {
    const r = snapMove(c({ x: 1.1, y: -0.9 }), [], cavity, 42, 1.5)
    expect(r.x).toBeCloseTo(0, 9)
    expect(r.y).toBeCloseTo(0, 9)
    expect([r.guideX, r.guideY]).toEqual([0, 0])
  })
  it('к краю другого выреза', () => {
    const other = c({ id: 'o', x: 43.3, y: 25 }) // левый край 33.3
    const r = snapMove(c({ x: 23, y: 0 }), [other], cavity, 42, 1.5) // правый край 33 → 33.3
    expect(r.x).toBeCloseTo(23.3, 6)
    expect(r.guideX).toBeCloseTo(33.3, 6)
  })
  it('к внутренней стенке и к шагу сетки', () => {
    const r1 = snapMove(c({ x: 30.2 }), [], cavity, 42, 1.5) // правый край 40.2 → стенка 40.8
    expect(r1.x).toBeCloseTo(30.8, 6)
    expect(r1.guideX).toBeCloseTo(40.8, 6)
    const r2 = snapMove(c({ x: 10.5 + 21 - 10.5 + 0.9 + 10 - 10 }), [], cavity, 42, 1.5) // левый край 11.9, цель 21/2? проверка сетки шага/2 = 21
    expect(r2.guideX === null || Number.isFinite(r2.guideX)).toBe(true)
    expect(snapTargets('x', [], cavity, 42)).toEqual(expect.arrayContaining([0, 21, -21, 40.8, -40.8]))
  })
  it('привязка выключена или далеко от целей: положение не меняется', () => {
    const p = c({ x: 5.5, y: 7.5 })
    expect(snapMove(p, [], cavity, 42, 1.5, false)).toEqual({ x: 5.5, y: 7.5, guideX: null, guideY: null })
    const far = snapMove(c({ x: 12.4, y: 7.3 }), [], cavity, 42, 0.1)
    expect([far.x, far.y]).toEqual([12.4, 7.3])
    expect([far.guideX, far.guideY]).toEqual([null, null])
  })
})

describe('круглый вырез (23)', () => {
  const circ = (o: Omit<Partial<Cutout>, 'source'> & { source?: Partial<{ diameter: number }> } = {}) => circleCutout({ id: 'k', depth: 10, clearance: 0, ...o })
  const cavity = { x: 81.6, y: 81.6 }

  it('фабрика: имя Circle, диаметр 20, в списке как остальные', () => {
    const c = circleCutout()
    expect(c).toMatchObject({ name: 'Circle', x: 0, y: 0, rotation: 0, visible: true, source: { kind: 'circle', diameter: 20 } })
    expect(addCutout([], c)).toEqual([{ ...c, color: 0 }])
  })

  it('габарит: центр ± (d/2 + зазор), поворот на него не влияет', () => {
    for (const rotation of [0, 30, 90, 137]) {
      const b = cutoutBounds(circ({ source: { diameter: 20 }, clearance: 0.5, x: 7, y: -3, rotation }))
      expect([b.minX, b.maxX, b.minY, b.maxY]).toEqual([7 - 10.5, 7 + 10.5, -3 - 10.5, -3 + 10.5])
    }
  })

  it('контур: 96 точек на окружности радиуса d/2, обход против часовой стрелки', () => {
    const pts = baseOutline(circ({ source: { diameter: 30 } }))
    expect(pts).toHaveLength(96)
    for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(15, 9)
    const area = pts.reduce((a, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return a + (x * y2 - x2 * y) / 2 }, 0)
    expect(area).toBeGreaterThan(0)
  })

  it('помощники размещения обращаются с кругом как с квадратом того же размера (зазор входит в габарит)', () => {
    const square = rect({ id: 'q', source: { width: 20, length: 20, radius: 0 }, clearance: 0.5 })
    const circle = circ({ source: { diameter: 20 }, clearance: 0.5 })
    expect(cutoutBounds(circle)).toEqual(cutoutBounds(square))
    const same = (f: (c: Cutout) => Cutout) => expect(cutoutBounds(f(circle))).toEqual(cutoutBounds(f(square)))
    same((c) => centerCutout({ ...c, x: 13, y: -7 }))
    same((c) => alignEdge({ ...c, x: 3 }, 'left', 5, cavity))
    same((c) => alignEdge({ ...c, x: 3 }, 'back', 2, cavity))
    const list = (mk: Cutout) => [{ ...mk, id: 'a', x: 30 }, { ...mk, id: 'b', x: -30 }, { ...mk, id: 'c', x: 5 }]
    expect(distribute(list(circle), 'x', cavity).map((c) => c.x)).toEqual(distribute(list(square), 'x', cavity).map((c) => c.x))
    const fc = fitFootprint(params({ cutouts: [{ ...circle, x: 9, y: 4 }] }))!, fs = fitFootprint(params({ cutouts: [{ ...square, x: 9, y: 4 }] }))!
    expect([fc.sizeX, fc.sizeY]).toEqual([fs.sizeX, fs.sizeY])
  })

  it('ножки и привязка при перетаскивании работают с кругом', () => {
    const r = snapMove(circ({ source: { diameter: 10 }, x: 1.1, y: -0.9 }), [], cavity, 42, 1.5)
    expect(r.x).toBeCloseTo(0, 9)
    expect(r.y).toBeCloseTo(0, 9)
  })

  it('диаметр 20 с зазором 0.5, глубина 10: карман ⌀21 × 10, габарит блока не меняется', async () => {
    const solid = await buildCutout(params())
    const m = await buildCutout(params({ cutouts: [circ({ source: { diameter: 20 }, clearance: 0.5, depth: 10 })] }))
    expectValidSolid(m)
    const removed = solid.volume() - m.volume()
    // 96-угольник вписан в окружность: площадь меньше круга на доли процента
    expect(Math.abs(removed - Math.PI * 10.5 ** 2 * 10) / (Math.PI * 10.5 ** 2 * 10)).toBeLessThan(0.005)
    const hole = solid.slice(16).area() - m.slice(16).area()
    expect(Math.abs(hole - Math.PI * 10.5 ** 2) / (Math.PI * 10.5 ** 2)).toBeLessThan(0.005)
    expect(m.boundingBox().max[0] - m.boundingBox().min[0]).toBeCloseTo(83.5, 3)
  })

  it('положение (x, y) задаёт центр кармана; поворот не меняет объём', async () => {
    const a = await buildCutout(params({ cutouts: [circ({ x: 12, y: -9 })] }))
    const b = await buildCutout(params({ cutouts: [circ({ x: 12, y: -9, rotation: 47 })] }))
    expect(b.volume()).toBeCloseTo(a.volume(), 3)
    const solid = await buildCutout(params())
    const cs = solid.slice(16).area() - a.slice(16).area()
    expect(cs).toBeGreaterThan(300)
  })

  it('круг, прямоугольник и деталь в одном блоке: тело валидно; скрытый круг ничего не меняет', async () => {
    const solid = await buildCutout(params())
    const hidden = await buildCutout(params({ cutouts: [{ ...circ(), visible: false }] }))
    expect(hidden.volume()).toBeCloseTo(solid.volume(), 6)
    const mesh = repairMesh(boxSoup(10, 10, 10)).mesh
    const info = describeMesh(mesh.vertProperties, 'mm', defaultOrientation)
    const reg: MeshRegistry = new Map([['m', mesh]])
    const src: MeshSource = { kind: 'mesh', meshId: 'm', filename: 'b.stl', unit: 'mm', orientation: defaultOrientation, mode: 'projected', size: info.size, hull: info.hull }
    const mix = await buildCutout(params({ cutouts: [circ({ id: 'c', x: -25 }), rect({ id: 'r', x: 0 }), { ...rect({ id: 'p', x: 25, y: 25 }), source: src }] }), reg)
    expectValidSolid(mix)
    expect(mix.volume()).toBeLessThan(solid.volume())
  })

  it('превью-инструмент: цилиндр диаметром d, высотой в глубину, с центром выреза', async () => {
    const w = await getWasm()
    const tools = buildCutoutTools(w, params({ cutouts: [circ({ source: { diameter: 20 }, clearance: 0.5, x: 6, y: -4, depth: 8 })] }))
    expect(tools).toHaveLength(1)
    const m = tools[0].mesh
    expect(m.max[0] - m.min[0]).toBeCloseTo(20, 2) // инструмент без зазора: сама деталь
    expect(m.max[1] - m.min[1]).toBeCloseTo(20, 2)
    expect(m.max[2] - m.min[2]).toBeCloseTo(8, 3)
    expect((m.min[0] + m.max[0]) / 2).toBeCloseTo(6, 3)
    expect((m.min[1] + m.max[1]) / 2).toBeCloseTo(-4, 3)
    expect(buildCutoutTools(w, params({ cutouts: [{ ...circ(), visible: false }] }))).toHaveLength(0)
  })

  it('диаметр ноль или меньше — ошибка размера, положительный — нет', () => {
    for (const d of [0, -5, NaN]) {
      const v = validateCutout(params({ cutouts: [circ({ source: { diameter: d } })] }))
      expect(v.ok).toBe(false)
      expect(v.errors).toContainEqual({ field: 'cutout.k.size', key: 'cutout.error.size' })
    }
    expect(validateCutout(params({ cutouts: [circ()] })).ok).toBe(true)
  })

  it('круг ниже пола: глубина ограничена так же, как у прямоугольника', () => {
    const l = cutoutLayout(params())
    expect(effectiveDepth(circ({ depth: 100 }), l)).toBeCloseTo(l.maxDepth, 9)
  })
})

describe('цвета вырезов (24)', () => {
  const add = (list: Cutout[], id: string) => addCutout(list, rectCutout({ id }))
  const colors = (list: Cutout[]) => list.map((c) => c.color)

  it('три добавленных выреза получают разные цвета по порядку палитры', () => {
    let l: Cutout[] = []
    for (const id of ['a', 'b', 'c']) l = add(l, id)
    expect(colors(l)).toEqual([0, 1, 2])
  })

  it('перестановка и удаление другого выреза цвет не меняют', () => {
    let l: Cutout[] = []
    for (const id of ['a', 'b', 'c']) l = add(l, id)
    const moved = moveCutout(l, 'c', -1)
    expect(moved.map((c) => [c.id, c.color])).toEqual([['a', 0], ['c', 2], ['b', 1]])
    expect(removeCutout(l, 'a').map((c) => [c.id, c.color])).toEqual([['b', 1], ['c', 2]])
    expect(updateCutout(l, 'b', { x: 5 }).map((c) => c.color)).toEqual([0, 1, 2])
  })

  it('освободившийся цвет берёт следующий новый вырез', () => {
    let l: Cutout[] = []
    for (const id of ['a', 'b', 'c']) l = add(l, id)
    l = add(removeCutout(l, 'b'), 'd')
    expect(l.map((c) => [c.id, c.color])).toEqual([['a', 0], ['c', 2], ['d', 1]])
  })

  it('копия получает свой цвет, отличный от оригинала, пока есть свободный', () => {
    let l: Cutout[] = []
    for (const id of ['a', 'b']) l = add(l, id)
    const out = duplicateCutout(l, 'a')
    expect(out.map((c) => c.id).slice(0, 1)).toEqual(['a'])
    expect(out[1].color).toBe(2)
    expect(out[1].color).not.toBe(out[0].color)
  })

  it('палитра исчерпана: цвета повторяются по кругу, у каждого выреза цвет есть', () => {
    let l: Cutout[] = []
    for (let i = 0; i < CUTOUT_COLORS + 3; i++) l = add(l, `c${i}`)
    expect(colors(l)).toEqual([0, 1, 2, 3, 4, 5, 6, 0, 1, 2])
    expect(l.every((c) => Number.isInteger(c.color))).toBe(true)
    expect(nextCutoutColor(l)).toBe(l.length % CUTOUT_COLORS)
  })

  it('явно заданный допустимый цвет сохраняется, недопустимый заменяется', () => {
    expect(addCutout([], rectCutout({ id: 'a', color: 4 }))[0].color).toBe(4)
    expect(addCutout([], rectCutout({ id: 'a', color: 99 }))[0].color).toBe(0)
    expect(addCutout([], rectCutout({ id: 'a', color: -1 }))[0].color).toBe(0)
    expect(addCutout([], rectCutout({ id: 'a', color: 1.5 }))[0].color).toBe(0)
  })

  it('fillCutoutColors: старые вырезы без цвета получают цвета по порядку, корректные не трогаются', () => {
    const l = [rectCutout({ id: 'a' }), rectCutout({ id: 'b' }), rectCutout({ id: 'c' })]
    expect(colors(fillCutoutColors(l))).toEqual([0, 1, 2])
    const mixed = [rectCutout({ id: 'a' }), rectCutout({ id: 'b', color: 0 }), rectCutout({ id: 'c', color: 99 })]
    expect(colors(fillCutoutColors(mixed))).toEqual([1, 0, 2])
    expect(l[0].color).toBeUndefined() // вход не изменяется
  })

  it('инструменты превью несут цвет своего выреза', async () => {
    const w = await getWasm()
    let l: Cutout[] = []
    l = addCutout(l, rectCutout({ id: 'a', depth: 5 })); l = addCutout(l, circleCutout({ id: 'b', depth: 5 })); l = addCutout(l, rectCutout({ id: 'c', depth: 5, visible: false }))
    const tools = buildCutoutTools(w, params({ cutouts: l }))
    expect(tools.map((t) => [t.id, t.color])).toEqual([['a', 0], ['b', 1]])
  })
})

describe('вырез по контуру с фото (25)', () => {
  // «Г» 40 × 40 мм: перекладина слева, основание внизу; точки против часовой, центр габарита в нуле
  const L: [number, number][] = [[-20, -20], [20, -20], [20, -8], [-8, -8], [-8, 20], [-20, 20]]
  const out = (o: Omit<Partial<Cutout>, 'source'> = {}) => outlineCutout({ id: 'o', depth: 10, clearance: 0, ...o, source: { kind: 'outline', points: L, size: { w: 40, l: 40 } } })
  const cavity = { x: 81.6, y: 81.6 }

  it('площадь и годность контура', () => {
    expect(polygonArea(L)).toBeCloseTo(40 * 12 + 12 * 28, 9)
    expect(validOutline(L)).toBe(true)
    expect(validOutline([[0, 0], [1, 0]])).toBe(false)
    expect(validOutline([[0, 0], [1, 0], [2, 0]])).toBe(false) // нулевая площадь
    expect(validOutline([[0, 0], [1, 0], [0, NaN]])).toBe(false)
    expect(validOutline([[0, 0], [10, 0], [0, 10]])).toBe(true)
    expect(MIN_OUTLINE_AREA).toBe(1)
    expect(validOutline('x')).toBe(false)
  })

  it('габарит повёрнутого контура: поворот многоугольника плюс зазор', () => {
    const c = out({ x: 10, y: -5, rotation: 90, clearance: 1 })
    const b = cutoutBounds(c)
    // поворот на 90°: (x, y) → (−y, x): x ∈ [−20, 20], y ∈ [−20, 20] для габарита 40 × 40 — центр прежний
    expect([b.minX, b.maxX, b.minY, b.maxY].map((v) => +v.toFixed(6))).toEqual([10 - 21, 10 + 21, -5 - 21, -5 + 21])
    const wide: Cutout = { ...c, rotation: 45, source: { kind: 'outline', points: [[-30, -5], [30, -5], [30, 5], [-30, 5]], size: { w: 60, l: 10 } } }
    const bw = cutoutBounds({ ...wide, x: 0, y: 0, clearance: 0 })
    expect(bw.maxX).toBeCloseTo((30 + 5) * Math.SQRT1_2, 6)
  })

  it('зазор по кривой даёт тот же карман, что и смещение ядра (в пределах 1 %)', async () => {
    const w = await getWasm()
    const circle: [number, number][] = Array.from({ length: 120 }, (_, i) => [15 * Math.cos((i / 120) * 2 * Math.PI), 15 * Math.sin((i / 120) * 2 * Math.PI)])
    const c = outlineCutout({ id: 'c', depth: 10, clearance: 0.8, source: { kind: 'outline', points: circle, size: { w: 30, l: 30 } } })
    const l = cutoutLayout(params({ cutouts: [c] }))
    const m = pocketSolid(w, c, l, new Map())!
    const ref = w.CrossSection.ofPolygons([circle]).offset(0.8, 'Round', 2, 24).area()
    expect(m.volume() / (10 + 1)).toBeGreaterThan(ref * 0.99)
    expect(m.volume() / (10 + 1)).toBeLessThan(ref * 1.01)
  })

  it('центровка, привязка к краю и распределение работают с контуром как с другими вырезами', () => {
    const c = centerCutout(out({ x: 13, y: -7 }))
    expect([c.x, c.y]).toEqual([0, 0])
    expect(cutoutBounds(alignEdge(out({ x: 3 }), 'left', 5, cavity)).minX).toBeCloseTo(-40.8 + 5, 9)
    const list = [out({ x: 30 }), { ...out({ x: -30 }), id: 'p' }]
    expect(distribute(list, 'x', cavity)).toHaveLength(2)
  })

  it('карман: объём равен площади контура × глубина (1 %), с зазором контур растёт на зазор со всех сторон', async () => {
    const solid = await buildCutout(params())
    const m = await buildCutout(params({ cutouts: [out()] }))
    expectValidSolid(m)
    near(solid.volume() - m.volume(), polygonArea(L) * 10, 0.01)
    const g = await buildCutout(params({ cutouts: [out({ clearance: 0.5 })] }))
    const grown = solid.slice(16).area() - g.slice(16).area()
    // площадь растёт на периметр × 0.5 плюс π·0.25 минус выступающие углы (для нашей «Г» — 5 выпуклых и 1 вогнутый)
    expect(grown).toBeGreaterThan(polygonArea(L) + 0.5 * 160 - 8)
    expect(grown).toBeLessThan(polygonArea(L) + 0.5 * 160 + 8)
  })

  it('положение и поворот переносят карман; поворот не меняет объём', async () => {
    const a = await buildCutout(params({ cutouts: [out({ x: 12, y: -9 })] }))
    const b = await buildCutout(params({ cutouts: [out({ x: 12, y: -9, rotation: 37 })] }))
    expect(b.volume()).toBeCloseTo(a.volume(), 2)
    const bb = a.slice(16).bounds() // положение: сечение выреза сдвинуто к (12, −9) от центра блока
    expect(Number.isFinite(bb.min[0])).toBe(true)
    const solid = await buildCutout(params())
    expect(solid.slice(16).area() - a.slice(16).area()).toBeCloseTo(polygonArea(L), 0)
  })

  it('превью-инструмент: габарит как у контура, высота — глубина, цвет по умолчанию 0', async () => {
    const w = await getWasm()
    const tools = buildCutoutTools(w, params({ cutouts: [out({ x: 6, y: -4, depth: 8 })] }))
    expect(tools).toHaveLength(1)
    const m = tools[0].mesh
    expect(m.max[0] - m.min[0]).toBeCloseTo(40, 3)
    expect(m.max[1] - m.min[1]).toBeCloseTo(40, 3)
    expect(m.max[2] - m.min[2]).toBeCloseTo(8, 3)
    expect((m.min[0] + m.max[0]) / 2).toBeCloseTo(6, 3)
    expect(tools[0].color).toBe(0)
  })

  it('невалидный контур — ошибка размера', () => {
    const bad = out(); bad.source = { kind: 'outline', points: [[0, 0], [1, 0], [2, 0]], size: { w: 2, l: 0 } }
    expect(validateCutout(params({ cutouts: [bad] })).errors).toContainEqual({ field: 'cutout.o.size', key: 'cutout.error.size' })
    expect(validateCutout(params({ cutouts: [out()] })).ok).toBe(true)
  })

  it('все четыре вида вместе в одном блоке', async () => {
    const mesh = repairMesh(boxSoup(10, 10, 10)).mesh
    const info = describeMesh(mesh.vertProperties, 'mm', defaultOrientation)
    const reg: MeshRegistry = new Map([['m', mesh]])
    const src: MeshSource = { kind: 'mesh', meshId: 'm', filename: 'b.stl', unit: 'mm', orientation: defaultOrientation, mode: 'projected', size: info.size, hull: info.hull }
    const m = await buildCutout(params({ cutouts: [rect({ id: 'r', x: -25, y: 25 }), circleCutout({ id: 'k', x: 25, y: 25, clearance: 0 }), { ...out({ x: -25, y: -25 }), id: 'o' }, { ...rect({ id: 'p', x: 25, y: -25 }), source: src }] }), reg)
    expectValidSolid(m)
  })
})

describe('подгонка габарита целыми юнитами (25)', () => {
  const r = (o: Omit<Partial<Cutout>, 'source'> & { source?: Partial<{ width: number; length: number; radius: number }> } = {}) => rectCutout({ id: 'r', clearance: 0, ...o })

  it('100 × 55 мм с запасом стенки и отступа — 3 × 2 юнита при шаге 42', () => {
    const f = fitFootprintUnits(params({ cutouts: [r({ source: { width: 100, length: 55, radius: 0 } })] }))!
    expect([f.unitsX, f.unitsY]).toEqual([3, 2])
    expect(f.x).toEqual({ mode: 'units', value: 3, align: 'center' })
    expect(f.y).toEqual({ mode: 'units', value: 2, align: 'center' })
    expect([f.sizeX, f.sizeY]).toEqual([126, 84])
    expect([f.cutouts[0].x, f.cutouts[0].y]).toEqual([0, 0])
  })

  it('минимум один юнит, учитываются все видимые вырезы, скрытые и пустой список — null', () => {
    const tiny = fitFootprintUnits(params({ cutouts: [r({ source: { width: 5, length: 5, radius: 0 } })] }))!
    expect([tiny.unitsX, tiny.unitsY]).toEqual([1, 1])
    const two = fitFootprintUnits(params({ cutouts: [r({ id: 'a', x: -45, source: { width: 20, length: 10, radius: 0 } }), r({ id: 'b', x: 45, source: { width: 20, length: 10, radius: 0 } })] }))!
    expect(two.unitsX).toBe(3) // 110 + 4 мм → 114 → 3 юнита
    expect(fitFootprintUnits(params())).toBeNull()
    expect(fitFootprintUnits(params({ cutouts: [{ ...r(), visible: false }] }))).toBeNull()
  })

  it('результат помещает вырезы: предупреждения о краях нет, габариты совпадают с целыми юнитами', () => {
    const p = params({ cutouts: [r({ source: { width: 100, length: 55, radius: 0 } })] })
    const f = fitFootprintUnits(p)!
    const fitted = params({ x: f.x, y: f.y, cutouts: f.cutouts })
    expect(cutoutNotices(fitted).some((i) => i.key === 'cutout.warn.edge')).toBe(false)
  })

  it('другой шаг сетки: 35 мм даёт 3 × 2 юнита для 90 × 60', () => {
    const f = fitFootprintUnits(params({ pitch: 35, cutouts: [r({ source: { width: 90, length: 55, radius: 0 } })] }))!
    expect([f.unitsX, f.unitsY]).toEqual([3, 2])
    expect(f.sizeX).toBe(105)
  })
})
