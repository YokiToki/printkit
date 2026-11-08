/**
 * Топология меша: смежность, плоские области, гладкие участки и их
 * классификация (плоскость / цилиндр / конус / сфера).
 * React-free, без three.js и manifold.
 */
import { weld } from '../mesh/weld'
import type { IndexedMesh, TriSoup } from '../stl-import'
import {
  fitCylinder,
  fitPlane,
  fitSphere,
  vAdd,
  vCross,
  vDot,
  vLen,
  vMul,
  vNorm,
  vSub,
  type Vec3,
} from './classify'

export type { Vec3 }

export interface TopologyOptions {
  /** Порог копланарности соседних треугольников, градусы. Default 1 */
  coplanarAngleDeg?: number
  /** Порог сглаживания для гладких участков, градусы. Default 30 */
  smoothAngleDeg?: number
  /** Допуск отклонения от плоскости, мм. Default 0.02 */
  distanceTolerance?: number
  /** Порог признания цилиндром/конусом/сферой, мм. Default 0.05 */
  fitTolerance?: number
  /** Максимальное число треугольников для режимов граней и рёбер. Default 1 500 000 */
  maxTriangles?: number
}

export const DEFAULT_TOPOLOGY_OPTIONS: Required<TopologyOptions> = {
  coplanarAngleDeg: 1,
  smoothAngleDeg: 30,
  distanceTolerance: 0.02,
  fitTolerance: 0.05,
  maxTriangles: 1_500_000,
}

export interface MeshIndex {
  positions: Float32Array
  numProp: number
  triVerts: Uint32Array
  numTris: number
  numVerts: number
  /** Нормаль каждого треугольника (3 значения на треугольник). */
  triNormal: Float32Array
  /** Площадь каждого треугольника. */
  triArea: Float32Array
  /** Идентификаторы вершин треугольников (3 на треугольник). */
  triVertex: Uint32Array
  edgeA: Uint32Array
  edgeB: Uint32Array
  /** Смежные треугольники ребра; -1 — граница сетки. */
  edgeTri0: Int32Array
  edgeTri1: Int32Array
  /** Двугранный угол ребра в радианах (π у граничных рёбер). */
  edgeDihedral: Float32Array
  numEdges: number
  bounds: { min: Vec3; max: Vec3 }
  diagonal: number
}

export type FaceKind = 'planar' | 'cylinder' | 'cone' | 'sphere' | 'smooth'

export interface FaceRegion {
  id: number
  tris: number[]
  kind: FaceKind
  /** Нормаль плоской области (для planарных). */
  normal?: Vec3
  /** Уравнение плоскости: dot(n, p) + d = 0. */
  planeD?: number
  /** Ось цилиндра/конуса. */
  axis?: Vec3
  /** Радиус цилиндра/конуса. */
  radius?: number
  /** Вершина конуса. */
  apex?: Vec3
  area: number
  centroid: Vec3
  /** Граничные петли области в мировых координатах. */
  loops: Vec3[][]
  /** Остаток подгонки, мм. */
  residual: number
}

export interface FaceSegmentation {
  faces: FaceRegion[]
  /** Идентификатор области для каждого треугольника, -1 — нет. */
  triToFace: Int32Array
}

const KEY_SHIFT = 2097152 // 2^21

export function buildMeshIndex(
  mesh: TriSoup | IndexedMesh | { vertProperties: Float32Array; triVerts: Uint32Array; numProp?: number }
): MeshIndex {
  let positions: Float32Array
  let triVerts: Uint32Array
  let numProp = 3

  if ('triVerts' in mesh) {
    positions = mesh.vertProperties
    triVerts = mesh.triVerts
    if ('numProp' in mesh && typeof mesh.numProp === 'number') numProp = mesh.numProp
  } else {
    const welded = weld(mesh).mesh
    positions = welded.vertProperties
    triVerts = welded.triVerts
  }

  const numTris = Math.floor(triVerts.length / 3)
  const numVerts = Math.floor(positions.length / numProp)

  const triNormal = new Float32Array(numTris * 3)
  const triArea = new Float32Array(numTris)
  const triVertex = new Uint32Array(numTris * 3)

  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let v = 0; v < numVerts; v++) {
    const i = v * numProp
    const x = positions[i]
    const y = positions[i + 1]
    const z = positions[i + 2]
    if (x < min[0]) min[0] = x
    if (y < min[1]) min[1] = y
    if (z < min[2]) min[2] = z
    if (x > max[0]) max[0] = x
    if (y > max[1]) max[1] = y
    if (z > max[2]) max[2] = z
  }
  const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2])

  const getV = (v: number): Vec3 => {
    const i = v * numProp
    return [positions[i], positions[i + 1], positions[i + 2]]
  }

  for (let t = 0; t < numTris; t++) {
    const a = triVerts[t * 3]
    const b = triVerts[t * 3 + 1]
    const c = triVerts[t * 3 + 2]
    triVertex[t * 3] = a
    triVertex[t * 3 + 1] = b
    triVertex[t * 3 + 2] = c
    const p0 = getV(a)
    const p1 = getV(b)
    const p2 = getV(c)
    const n = vCross(vSub(p1, p0), vSub(p2, p0))
    const l = vLen(n)
    triArea[t] = l * 0.5
    if (l > 1e-12) {
      triNormal[t * 3] = n[0] / l
      triNormal[t * 3 + 1] = n[1] / l
      triNormal[t * 3 + 2] = n[2] / l
    } else {
      triNormal[t * 3 + 2] = 1
    }
  }

  // Рёбра: сортированные пары вершин.
  const edgeMap = new Map<number, number>()
  const edgeA: number[] = []
  const edgeB: number[] = []
  const edgeTri0: number[] = []
  const edgeTri1: number[] = []

  for (let t = 0; t < numTris; t++) {
    for (let k = 0; k < 3; k++) {
      const a = triVertex[t * 3 + k]
      const b = triVertex[t * 3 + ((k + 1) % 3)]
      const lo = a < b ? a : b
      const hi = a < b ? b : a
      const key = lo * KEY_SHIFT + hi
      let e = edgeMap.get(key)
      if (e === undefined) {
        e = edgeA.length
        edgeMap.set(key, e)
        edgeA.push(lo)
        edgeB.push(hi)
        edgeTri0.push(t)
        edgeTri1.push(-1)
      } else {
        edgeTri1[e] = t
      }
    }
  }

  const numEdges = edgeA.length
  const edgeDihedral = new Float32Array(numEdges)
  for (let e = 0; e < numEdges; e++) {
    const t0 = edgeTri0[e]
    const t1 = edgeTri1[e]
    if (t1 < 0) {
      edgeDihedral[e] = Math.PI
      continue
    }
    const n0: Vec3 = [triNormal[t0 * 3], triNormal[t0 * 3 + 1], triNormal[t0 * 3 + 2]]
    const n1: Vec3 = [triNormal[t1 * 3], triNormal[t1 * 3 + 1], triNormal[t1 * 3 + 2]]
    const d = vDot(n0, n1)
    edgeDihedral[e] = Math.acos(Math.max(-1, Math.min(1, d)))
  }

  return {
    positions,
    numProp,
    triVerts,
    numTris,
    numVerts,
    triNormal,
    triArea,
    triVertex,
    edgeA: Uint32Array.from(edgeA),
    edgeB: Uint32Array.from(edgeB),
    edgeTri0: Int32Array.from(edgeTri0),
    edgeTri1: Int32Array.from(edgeTri1),
    edgeDihedral,
    numEdges,
    bounds: { min, max },
    diagonal,
  }
}

class UnionFind {
  private parent: Int32Array
  constructor(n: number) {
    this.parent = new Int32Array(n)
    for (let i = 0; i < n; i++) this.parent[i] = i
  }
  find(x: number): number {
    let r = x
    while (this.parent[r] !== r) r = this.parent[r]
    while (this.parent[x] !== r) {
      const next = this.parent[x]
      this.parent[x] = r
      x = next
    }
    return r
  }
  union(a: number, b: number) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[rb] = ra
  }
}

/**
 * Сегментация меша на области.
 *
 * 1. Плоские области — компоненты треугольников с двугранным углом ≤ порога
 *    копланарности (по умолчанию 1°).
 * 2. Гладкие группы — компоненты с двугранным углом ≤ порога сглаживания
 *    (по умолчанию 30°). Если группа хорошо подгоняется цилиндром, конусом
 *    или сферой, она становится одной гладкой гранью; иначе распадается
 *    обратно на плоские области и участки произвольной формы.
 */
export function segmentFaces(index: MeshIndex, options: TopologyOptions = {}): FaceSegmentation {
  const opts = { ...DEFAULT_TOPOLOGY_OPTIONS, ...options }
  const cosCoplanar = Math.cos((opts.coplanarAngleDeg * Math.PI) / 180)
  const cosSmooth = Math.cos((opts.smoothAngleDeg * Math.PI) / 180)

  const flatUf = new UnionFind(index.numTris)
  const smoothUf = new UnionFind(index.numTris)
  const patchUf = new UnionFind(index.numTris)

  const cosOfEdge = (e: number): number => {
    const t0 = index.edgeTri0[e]
    const t1 = index.edgeTri1[e]
    return vDot(
      [index.triNormal[t0 * 3], index.triNormal[t0 * 3 + 1], index.triNormal[t0 * 3 + 2]],
      [index.triNormal[t1 * 3], index.triNormal[t1 * 3 + 1], index.triNormal[t1 * 3 + 2]],
    )
  }

  // 1. Плоские компоненты.
  for (let e = 0; e < index.numEdges; e++) {
    if (index.edgeTri1[e] < 0) continue
    if (cosOfEdge(e) >= cosCoplanar) flatUf.union(index.edgeTri0[e], index.edgeTri1[e])
  }

  const flatGroups = new Map<number, number[]>()
  for (let t = 0; t < index.numTris; t++) {
    const r = flatUf.find(t)
    let g = flatGroups.get(r)
    if (!g) {
      g = []
      flatGroups.set(r, g)
    }
    g.push(t)
  }
  const flatOfTri = new Int32Array(index.numTris).fill(-1)
  let flatId = 0
  for (const g of flatGroups.values()) {
    for (const t of g) flatOfTri[t] = flatId
    flatId++
  }

  // 2. Гладкие группы и участки произвольной формы.
  for (let e = 0; e < index.numEdges; e++) {
    if (index.edgeTri1[e] < 0) continue
    if (cosOfEdge(e) < cosSmooth) continue
    const t0 = index.edgeTri0[e]
    const t1 = index.edgeTri1[e]
    smoothUf.union(t0, t1)
    if (flatOfTri[t0] !== flatOfTri[t1]) patchUf.union(t0, t1)
  }

  const smoothGroups = new Map<number, number[]>()
  for (let t = 0; t < index.numTris; t++) {
    const r = smoothUf.find(t)
    let g = smoothGroups.get(r)
    if (!g) {
      g = []
      smoothGroups.set(r, g)
    }
    g.push(t)
  }

  const triToFace = new Int32Array(index.numTris).fill(-1)
  const faces: FaceRegion[] = []

  const emit = (tris: number[], kindHint: 'flat' | 'smooth' | 'primitive') => {
    const id = faces.length
    for (const t of tris) triToFace[t] = id
    faces.push(buildFaceRegion(index, tris, id, opts, kindHint))
  }

  for (const group of smoothGroups.values()) {
    const groupSet = new Set(group)
    // Плоские области, целиком лежащие в группе.
    const flatsInGroup: number[][] = []
    const flatSeen = new Set<number>()
    for (const t of group) {
      const f = flatOfTri[t]
      if (f < 0 || flatSeen.has(f)) continue
      flatSeen.add(f)
      const fg = flatGroups.get(flatUf.find(t))!
      if (fg.every((x) => groupSet.has(x))) flatsInGroup.push(fg)
    }
    const rest = group.filter((t) => !flatSeen.has(flatOfTri[t]))

    if (flatsInGroup.length === 1 && rest.length === 0) {
      emit(flatsInGroup[0], 'flat')
      continue
    }

    // Пробуем подогнать примитив по всей группе.
    const prim = fitPrimitive(collectRegionPoints(index, group), collectRegionNormals(index, group), opts)
    if (prim) {
      emit(group, 'primitive')
      const face = faces[faces.length - 1]
      Object.assign(face, prim)
      continue
    }

    // Примитива не вышло — возвращаем плоские области и участки.
    for (const fg of flatsInGroup) emit(fg, 'flat')
    const patches = new Map<number, number[]>()
    for (const t of rest) {
      const r = patchUf.find(t)
      let g = patches.get(r)
      if (!g) {
        g = []
        patches.set(r, g)
      }
      g.push(t)
    }
    for (const g of patches.values()) emit(g, 'smooth')
  }

  return { faces, triToFace }
}

/** Подгонка примитива по точкам области: сфера, цилиндр или конус. */
function fitPrimitive(
  points: Vec3[],
  normals: Vec3[],
  opts: Required<TopologyOptions>
): Partial<FaceRegion> | null {
  // Сначала цилиндр/конус: кольцо точек цилиндра случайно подгоняется под
  // сферу (радиус √2·R), поэтому сферу проверяем последней.
  const cyl = fitCylinder(points, normals)
  if (cyl) {
    const variation = Math.abs(cyl.taper) * cyl.extent
    if (cyl.residual <= opts.fitTolerance && variation <= Math.max(0.05, 0.02 * Math.abs(cyl.radius))) {
      return { kind: 'cylinder', axis: cyl.axis, radius: cyl.radius, residual: cyl.residual }
    }
    if (cyl.residual <= opts.fitTolerance * 3 && Math.abs(cyl.taper) > 1e-6 && cyl.apex) {
      return {
        kind: 'cone',
        axis: cyl.axis,
        radius: cyl.radius,
        apex: cyl.apex,
        residual: cyl.residual,
      }
    }
  }
  const sphere = fitSphere(points)
  if (sphere && sphere.residual <= opts.fitTolerance) {
    return { kind: 'sphere', radius: sphere.radius, residual: sphere.residual }
  }
  return null
}

function collectRegionPoints(index: MeshIndex, tris: number[]): Vec3[] {
  const pts: Vec3[] = []
  const seen = new Set<number>()
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const v = index.triVertex[t * 3 + k]
      if (seen.has(v)) continue
      seen.add(v)
      const i = v * index.numProp
      pts.push([index.positions[i], index.positions[i + 1], index.positions[i + 2]])
    }
  }
  return pts
}

/** Средняя нормаль треугольников области. */
function averageNormal(index: MeshIndex, tris: number[]): Vec3 {
  const n: Vec3 = [0, 0, 0]
  for (const t of tris) {
    n[0] += index.triNormal[t * 3]
    n[1] += index.triNormal[t * 3 + 1]
    n[2] += index.triNormal[t * 3 + 2]
  }
  return vNorm(n)
}

function collectRegionNormals(index: MeshIndex, tris: number[]): Vec3[] {
  const out: Vec3[] = []
  for (const t of tris) {
    out.push([index.triNormal[t * 3], index.triNormal[t * 3 + 1], index.triNormal[t * 3 + 2]])
  }
  return out
}

function buildFaceRegion(
  index: MeshIndex,
  tris: number[],
  id: number,
  opts: Required<TopologyOptions>,
  kindHint: 'flat' | 'smooth' | 'primitive' = 'flat'
): FaceRegion {
  let area = 0
  const centroid: Vec3 = [0, 0, 0]
  for (const t of tris) {
    const a = area
    area += index.triArea[t]
    const p0 = vertexPos(index, index.triVertex[t * 3])
    const p1 = vertexPos(index, index.triVertex[t * 3 + 1])
    const p2 = vertexPos(index, index.triVertex[t * 3 + 2])
    const c: Vec3 = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3]
    const w = index.triArea[t]
    centroid[0] += c[0] * w
    centroid[1] += c[1] * w
    centroid[2] += c[2] * w
    void a
  }
  if (area > 0) {
    centroid[0] /= area
    centroid[1] /= area
    centroid[2] /= area
  }

  const pts = collectRegionPoints(index, tris)
  const plane = fitPlane(pts)

  const region: FaceRegion = {
    id,
    tris,
    kind: 'smooth',
    area,
    centroid,
    loops: [],
    residual: plane.residual,
  }

  if (kindHint === 'primitive') {
    // Вид поверхности определён примитивной подгонкой (см. fitPrimitive).
    const prim = fitPrimitive(pts, collectRegionNormals(index, tris), opts)
    if (prim) {
      region.kind = prim.kind ?? 'smooth'
      region.axis = prim.axis
      region.radius = prim.radius
      region.apex = prim.apex
      region.residual = prim.residual ?? region.residual
    } else {
      region.kind = 'smooth'
    }
  } else if (kindHint === 'flat' && plane.residual <= opts.distanceTolerance) {
    region.kind = 'planar'
    // Нормаль PCA не ориентирована — выравниваем её по средней нормали
    // треугольников области, чтобы она смотрела наружу от тела.
    const outward = averageNormal(index, tris)
    const normal = vDot(plane.normal, outward) >= 0 ? plane.normal : vMul(plane.normal, -1)
    region.normal = normal
    region.planeD = -vDot(normal, region.centroid)
    region.residual = plane.residual
  } else {
    // Гладкий участок: пробуем цилиндр/конус/сферу.
    const prim = fitPrimitive(pts, collectRegionNormals(index, tris), opts)
    if (prim) {
      region.kind = prim.kind ?? 'smooth'
      region.axis = prim.axis
      region.radius = prim.radius
      region.apex = prim.apex
      region.residual = prim.residual ?? region.residual
      if (region.kind === 'sphere') {
        const sphere = fitSphere(pts)
        if (sphere) region.centroid = sphere.centre
      }
    }
  }

  region.loops = boundaryLoops(index, tris)
  return region
}

export function vertexPos(index: MeshIndex, v: number): Vec3 {
  const i = v * index.numProp
  return [index.positions[i], index.positions[i + 1], index.positions[i + 2]]
}

/**
 * Граничные петли области: рёбра, у которых соседний треугольник принадлежит
 * другой области (или ребро граничное). Петли замкнуты и идут по вершинам.
 */
export function boundaryLoops(index: MeshIndex, tris: number[]): Vec3[][] {
  const inRegion = new Set(tris)
  const edges: number[] = []
  for (let e = 0; e < index.numEdges; e++) {
    const t0 = index.edgeTri0[e]
    const t1 = index.edgeTri1[e]
    const in0 = inRegion.has(t0)
    const in1 = t1 >= 0 && inRegion.has(t1)
    // Ребро лежит на границе области, если область принадлежит только одной
    // из его сторон (вторая сторона — другая область или конец сетки).
    if (in0 !== in1) edges.push(e)
  }
  if (edges.length === 0) return []

  const byVertex = new Map<number, number[]>()
  for (const e of edges) {
    const a = index.edgeA[e]
    const b = index.edgeB[e]
    if (!byVertex.has(a)) byVertex.set(a, [])
    if (!byVertex.has(b)) byVertex.set(b, [])
    byVertex.get(a)!.push(e)
    byVertex.get(b)!.push(e)
  }

  const used = new Set<number>()
  const loops: Vec3[][] = []
  for (const start of edges) {
    if (used.has(start)) continue
    used.add(start)
    const loopVerts: number[] = [index.edgeA[start], index.edgeB[start]]
    let current = index.edgeB[start]
    const first = index.edgeA[start]
    let guard = 0
    while (current !== first && guard++ < edges.length + 4) {
      const candidates = (byVertex.get(current) ?? []).filter((e) => !used.has(e))
      if (candidates.length === 0) break
      const e = candidates[0]
      used.add(e)
      const a = index.edgeA[e]
      const b = index.edgeB[e]
      const next = a === current ? b : a
      loopVerts.push(next)
      current = next
    }
    if (loopVerts.length >= 3) {
      loops.push(loopVerts.map((v) => vertexPos(index, v)))
    }
  }
  return loops
}

/**
 * Проекция петель области на её плоскость: возвращает контуры в локальных
 * координатах (x, y) с нормалью в +z.
 */
export function projectLoops(
  loops: Vec3[][],
  normal: Vec3,
  origin: Vec3
): { contours: [number, number][][]; basis: { x: Vec3; y: Vec3; z: Vec3 } } {
  const z = vNorm(normal)
  const helper: Vec3 = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const x = vNorm(vCross(helper, z))
  const y = vCross(z, x)
  const contours = loops.map((loop) =>
    loop.map((p) => {
      const d = vSub(p, origin)
      return [vDot(d, x), vDot(d, y)] as [number, number]
    })
  )
  return { contours, basis: { x, y, z } }
}

/** Площадь контура (знаков��я). */
export function signedArea(contour: [number, number][]): number {
  let a = 0
  for (let i = 0; i < contour.length; i++) {
    const p = contour[i]
    const q = contour[(i + 1) % contour.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

/** Точка области, ближайшая к заданной (в пределах области). */
export function closestPointOnRegion(region: FaceRegion, p: Vec3): Vec3 {
  let best = region.centroid
  let bestD = Infinity
  for (const loop of region.loops) {
    for (const q of loop) {
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2
      if (d < bestD) {
        bestD = d
        best = q
      }
    }
  }
  return best
}

/** Проекция точки на плоскость области. */
export function projectToPlane(region: FaceRegion, p: Vec3): Vec3 {
  if (!region.normal) return p
  const n = region.normal
  const d = region.planeD ?? -vDot(n, region.centroid)
  const dist = vDot(n, p) + d
  return vSub(p, vMul(n, dist))
}

export { vAdd, vSub, vMul, vDot, vLen, vNorm, vCross }
