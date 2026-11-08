/**
 * Push / Pull: перемещение плоских граней вдоль нормали.
 * React-free, работает с manifold.
 */
import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { Mat4 } from '../../matrix'
import { getWasm } from '../../wasm'
import type { FaceRef } from '../../topology/reference'
import { resolveFace } from '../../topology/reference'
import type { FaceRegion, MeshTopology } from '../../topology'
import { projectLoops } from '../../topology/faces'
import { vDot, vMul, vNorm, vSub, type Vec3 } from '../../topology/classify'

export interface PushPullParams {
  /** Ссылки на грани в локальных координатах объекта. */
  faces: FaceRef[]
  /** Расстояние вдоль нормали, мм. Положительное — наружу. */
  distance: number
}

export interface PushPullResult {
  solid?: Manifold
  error?: string
  errorParams?: Record<string, string | number>
  warning?: string
  warningParams?: Record<string, string | number>
}

/** Перекрытие с телом для гарантированно замкнутого объединения, мм. */
const OVERLAP = 0.01

interface PlaneGroup {
  normal: Vec3
  planeD: number
  regions: FaceRegion[]
}

/** Группировка граней по общей плоскости и нормали. */
function groupByPlane(regions: FaceRegion[]): PlaneGroup[] {
  const groups: PlaneGroup[] = []
  for (const r of regions) {
    if (!r.normal) continue
    const n = r.normal
    const d = r.planeD ?? -vDot(n, r.centroid)
    let found: PlaneGroup | undefined
    for (const g of groups) {
      if (vDot(g.normal, n) > 0.9999 && Math.abs(g.planeD - d) < 0.01) {
        found = g
        break
      }
    }
    if (found) found.regions.push(r)
    else groups.push({ normal: n, planeD: d, regions: [r] })
  }
  return groups
}

/**
 * Глубина материала за гранью вдоль нормали, мм.
 * Считается по вершинам текущей сетки.
 */
function materialDepth(topology: MeshTopology, region: FaceRegion): number {
  const n = region.normal
  if (!n) return 0
  const index = topology.index
  let min = 0
  for (let v = 0; v < index.numVerts; v++) {
    const i = v * index.numProp
    const d =
      n[0] * (index.positions[i] - region.centroid[0]) +
      n[1] * (index.positions[i + 1] - region.centroid[1]) +
      n[2] * (index.positions[i + 2] - region.centroid[2])
    if (d < min) min = d
  }
  return -min
}

/** Призма по контурам граней, вытянутая вдоль нормали. */
function buildPrism(
  w: ManifoldToplevel,
  group: PlaneGroup,
  height: number,
  offset: number
): Manifold | null {
  const loops: Vec3[][] = []
  for (const r of group.regions) loops.push(...r.loops)
  if (loops.length === 0) return null

  const origin = group.regions[0].centroid
  const { contours, basis } = projectLoops(loops, group.normal, origin)
  const cs = w.CrossSection.ofPolygons(contours as [number, number][][], 'EvenOdd')
  const solid = cs.extrude(height).translate([0, 0, offset])
  const mat: Mat4 = [
    basis.x[0], basis.x[1], basis.x[2], 0,
    basis.y[0], basis.y[1], basis.y[2], 0,
    basis.z[0], basis.z[1], basis.z[2], 0,
    origin[0], origin[1], origin[2], 1,
  ]
  return solid.transform(mat)
}

/**
 * Сдвиг плоских граней вдоль нормали. Положительное расстояние тянет грань
 * наружу, отрицательное вдавливает внутрь (с ограничением по глубине).
 */
export async function applyPushPull(
  solid: Manifold,
  params: PushPullParams,
  topology: MeshTopology
): Promise<PushPullResult> {
  const w = await getWasm()
  if (!params.faces || params.faces.length === 0) {
    return { error: 'face.error.noFaces' }
  }

  const resolved: FaceRegion[] = []
  for (const ref of params.faces) {
    const res = resolveFace(topology.faces, ref, topology.diagonal)
    if (res.status === 'missing') return { error: 'face.error.missing' }
    if (res.status === 'ambiguous') return { error: 'face.error.ambiguous' }
    if (res.value.kind !== 'planar') return { error: 'face.error.notPlanar' }
    resolved.push(res.value)
  }

  const groups = groupByPlane(resolved)
  if (groups.length === 0) return { error: 'face.error.notPlanar' }

  // Входное тело принадлежит вызывающему коду — не удаляем его.
  let current = solid
  let owned = false
  let warning: string | undefined
  let warningParams: Record<string, string | number> | undefined

  for (const group of groups) {
    let distance = params.distance
    if (distance < 0) {
      // Вдавливание: не глубже материала за гранью.
      const depth = Math.min(...group.regions.map((r) => materialDepth(topology, r)))
      const limit = Math.max(0, depth - OVERLAP)
      if (-distance > limit) {
        if (limit <= 0) return { error: 'face.error.noMaterial' }
        distance = -limit
        warning = 'face.warning.clamped'
        warningParams = { max: Number(limit.toFixed(2)) }
      }
    }

    if (distance === 0) continue

    if (distance > 0) {
      const prism = buildPrism(w, group, distance + OVERLAP, -OVERLAP)
      if (!prism) return { error: 'face.error.emptyFace' }
      const next = current.add(prism)
      if (owned) current.delete()
      prism.delete()
      current = next
      owned = true
    } else {
      const prism = buildPrism(w, group, -distance, distance)
      if (!prism) return { error: 'face.error.emptyFace' }
      const next = current.subtract(prism)
      if (owned) current.delete()
      prism.delete()
      current = next
      owned = true
    }
  }

  return { solid: current, warning, warningParams }
}

/** Отпечаток нормали грани для подсказок интерфейса. */
export function faceNormalOf(region: FaceRegion): Vec3 {
  return vNorm(region.normal ?? [0, 0, 1])
}

/** Проекция точки на плоскость грани (для расчёта смещения). */
export function offsetPoint(region: FaceRegion, p: Vec3, distance: number): Vec3 {
  const n = faceNormalOf(region)
  return vSub(p, vMul(n, -distance))
}
