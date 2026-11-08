/**
 * Фаска и скругление рёбер в 3D: инструмент строится из профиля в сечении
 * перпендикулярном ребру (прямое ребро) или в плоскости оси (круглое ребро).
 * React-free, работает с manifold.
 */
import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { Mat4 } from '../../matrix'
import { getWasm } from '../../wasm'
import type { EdgeRef } from '../../topology/reference'
import { resolveEdge } from '../../topology/reference'
import type { EdgeChain, FaceRegion, MeshTopology } from '../../topology'
import { faceDirections } from '../../topology/edges'
import { vAdd, vCross, vDot, vLen, vMul, vNorm, vSub, type Vec3 } from '../../topology/classify'

export interface EdgeBreakParams {
  /** Ссылки на рёбра в локальных координатах объекта. */
  edges: EdgeRef[]
  kind: 'chamfer' | 'fillet'
  /** Размер фаски или радиус скругления, мм. */
  size: number
}

export interface EdgeBreakResult {
  solid?: Manifold
  error?: string
  errorParams?: Record<string, string | number>
  warning?: string
  warningParams?: Record<string, string | number>
}

/** Допуск отклонения дуги от окружности, мм. */
const ARC_SAGITTA = 0.002
/** Границы числа сегментов дуги. */
const ARC_MIN_SEGMENTS = 4
const ARC_MAX_SEGMENTS = 48
/** Минимальный и максимальный двугранный угол, градусы. */
const MIN_DIHEDRAL = (20 * Math.PI) / 180
const MAX_DIHEDRAL = (160 * Math.PI) / 180
/** Доля от размера смежной грани, до которой допустим размер инструмента. */
const SIZE_RATIO = 0.5
/** Перекрытие инструментов в углах, мм. */
const OVERLAP = 0.01

interface EdgeGeometry {
  chain: EdgeChain
  /** Точка на ребре — начало профиля. */
  p: Vec3
  /** Направление ребра. */
  e: Vec3
  /** Нормали смежных граней. */
  n0: Vec3
  n1: Vec3
  /** Направления вдоль граней, уходящие от ребра. */
  v0: Vec3
  v1: Vec3
  convex: boolean
}

/** Геометрия ребра: точка, направление, нормали и направления вдоль граней. */
function edgeGeometry(chain: EdgeChain, topology: MeshTopology): EdgeGeometry | null {
  const dirs = faceDirections(topology.index, chain, topology.faces)
  if (!dirs) return null
  const { v0, v1, n0, n1, p, e } = dirs
  return { chain, p, e, n0, n1, v0, v1, convex: chain.convex }
}

/** Протяжённость смежной грани поперёк ребра, мм. */
function faceExtent(region: FaceRegion | undefined, edgePoint: Vec3, edgeDir: Vec3): number {
  if (!region) return Infinity
  let max = 0
  for (const loop of region.loops) {
    for (const p of loop) {
      const d = vSub(p, edgePoint)
      const along = vDot(d, edgeDir)
      const perp = vSub(d, vMul(edgeDir, along))
      const dist = vLen(perp)
      if (dist > max) max = dist
    }
  }
  return max
}

/**
 * Профиль инструмента в трёх измерениях: O, T0, дуга, T1 (для скругления)
 * или O, O+d·v0, O+d·v1 (для фаски).
 */
function buildProfile(
  geo: EdgeGeometry,
  kind: 'chamfer' | 'fillet',
  size: number,
  arcAxis: Vec3
): { points: Vec3[]; centre: Vec3 } | null {
  const { p: O, n0, n1, v0, v1, convex } = geo
  const sign = convex ? 1 : -1

  if (kind === 'chamfer') {
    return {
      points: [O, vAdd(O, vMul(v0, size)), vAdd(O, vMul(v1, size))],
      centre: O,
    }
  }

  const centre = vSub(O, vMul(vAdd(n0, n1), sign * size))
  const t0 = vAdd(centre, vMul(n0, sign * size))
  const t1 = vAdd(centre, vMul(n1, sign * size))

  const u = vNorm(vSub(t0, centre))
  const v = vCross(arcAxis, u)
  if (vLen(v) < 1e-9) return null
  const d1 = vSub(t1, centre)
  const a2 = Math.atan2(vDot(d1, v), vDot(d1, u))
  const dMid = vSub(O, centre)
  const aMid = Math.atan2(vDot(dMid, v), vDot(dMid, u))

  // Дуга идёт от T0 к T1 в ту сторону, где проходит точка, ближайшая к O.
  let sweep = a2
  while (sweep - aMid > Math.PI) sweep -= 2 * Math.PI
  while (sweep - aMid < -Math.PI) sweep += 2 * Math.PI

  const perSegment = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - ARC_SAGITTA / size)))
  const segments = Math.max(
    ARC_MIN_SEGMENTS,
    Math.min(ARC_MAX_SEGMENTS, Math.ceil(Math.abs(sweep) / Math.max(perSegment, 1e-6)))
  )

  const points: Vec3[] = [O, t0]
  for (let i = 1; i < segments; i++) {
    const a = (sweep * i) / segments
    points.push(
      vAdd(centre, vAdd(vMul(u, size * Math.cos(a)), vMul(v, size * Math.sin(a))))
    )
  }
  points.push(t1)
  return { points, centre }
}

/** Призма профиля вдоль прямого ребра. */
function buildPrism(
  w: ManifoldToplevel,
  geo: EdgeGeometry,
  profile: Vec3[]
): Manifold | null {
  const { p, e, v0, v1 } = geo
  const x = vNorm(v0)
  const yRaw = vSub(v1, vMul(x, vDot(v1, x)))
  const y = vNorm(yRaw)
  if (vLen(yRaw) < 1e-9) return null
  const z = vNorm(e)

  const contours = profile.map((q) => {
    const d = vSub(q, p)
    return [vDot(d, x), vDot(d, y)] as [number, number]
  })

  const length = geo.chain.length
  const cs = w.CrossSection.ofPolygons([contours], 'EvenOdd')
  const solid = cs.extrude(length).translate([0, 0, -length / 2])
  const mat: Mat4 = [
    x[0], x[1], x[2], 0,
    y[0], y[1], y[2], 0,
    z[0], z[1], z[2], 0,
    p[0], p[1], p[2], 1,
  ]
  return solid.transform(mat)
}

/** Кольцо: профиль в плоскости оси, вращённый вокруг оси. */
function buildRing(
  w: ManifoldToplevel,
  geo: EdgeGeometry,
  profile: Vec3[],
  centre: Vec3,
  axis: Vec3,
  segments: number
): Manifold | null {
  const radial = vSub(geo.p, centre)
  const along = vDot(radial, axis)
  const rHat = vNorm(vSub(radial, vMul(axis, along)))
  const aHat = vNorm(axis)

  const contours = profile.map((q) => {
    const d = vSub(q, centre)
    return [vDot(d, rHat), vDot(d, aHat)] as [number, number]
  })
  if (contours.some((c) => c[0] < -1e-6)) return null

  const cs = w.CrossSection.ofPolygons([contours], 'EvenOdd')
  const solid = w.Manifold.revolve(cs, segments, 360)
  // После вращения локальная X — радиальное направление, локальная Z — ось,
  // локальная Y — касательное направление.
  const tan = vNorm(vCross(axis, rHat))
  const mat: Mat4 = [
    rHat[0], rHat[1], rHat[2], 0,
    tan[0], tan[1], tan[2], 0,
    axis[0], axis[1], axis[2], 0,
    centre[0], centre[1], centre[2], 1,
  ]
  return solid.transform(mat)
}

/**
 * Фаска или скругление выбранных рёбер.
 */
export async function applyEdgeBreak(
  solid: Manifold,
  params: EdgeBreakParams,
  topology: MeshTopology
): Promise<EdgeBreakResult> {
  const w = await getWasm()
  if (!params.edges || params.edges.length === 0) {
    return { error: 'edge.error.noEdges' }
  }
  if (!(params.size > 0)) {
    return { error: 'edge.error.invalidSize' }
  }

  const chains: EdgeChain[] = []
  for (const ref of params.edges) {
    const res = resolveEdge(topology.edges, ref, topology.diagonal)
    if (res.status === 'missing') return { error: 'edge.error.missing' }
    if (res.status === 'ambiguous') return { error: 'edge.error.ambiguous' }
    chains.push(res.value)
  }

  const cutters: Manifold[] = []
  const fillers: Manifold[] = []
  const segments = 64

  for (const chain of chains) {
    if (chain.kind === 'free') {
      return { error: 'edge.error.notLineOrCircle' }
    }
    const geo = edgeGeometry(chain, topology)
    if (!geo) return { error: 'edge.error.unsupportedFace' }

    // Обе смежные грани должны быть плоскими или цилиндрическими.
    const face0 = topology.faces[chain.faces[0]]
    const face1 = topology.faces[chain.faces[1]]
    const okKind = (f?: FaceRegion) =>
      !!f && (f.kind === 'planar' || f.kind === 'cylinder' || f.kind === 'cone')
    if (!okKind(face0) || !okKind(face1)) {
      return { error: 'edge.error.unsupportedFace' }
    }

    // Двугранный угол в допустимом диапазоне.
    const theta = Math.acos(Math.max(-1, Math.min(1, vDot(geo.n0, geo.n1))))
    if (theta < MIN_DIHEDRAL || theta > MAX_DIHEDRAL) {
      return {
        error: 'edge.error.dihedral',
        errorParams: { angle: Math.round((theta * 180) / Math.PI) },
      }
    }

    // Предельный размер: половина протяжённости смежной грани.
    const extent = Math.min(
      faceExtent(face0, geo.p, geo.e),
      faceExtent(face1, geo.p, geo.e)
    )
    const maxSize = Number((extent * SIZE_RATIO).toFixed(2))
    if (Number.isFinite(maxSize) && params.size > maxSize) {
      return { error: 'edge.error.tooLarge', errorParams: { max: maxSize } }
    }

    const isCircle = chain.kind === 'circle'
    // Дуга профиля всегда лежит в плоскости, перпендикулярной ребру:
    // для круглого ребра это плоскость, содержащая ось вращения.
    const arcAxis = geo.e
    const profile = buildProfile(geo, params.kind, params.size, arcAxis)
    if (!profile) return { error: 'edge.error.unsupportedFace' }

    let tool: Manifold | null = null
    if (isCircle) {
      // Ось вращения кольца — ось окружности, а не касательное направление ребра.
      tool = buildRing(w, geo, profile.points, chain.centre as Vec3, chain.axis as Vec3, segments)
    } else {
      tool = buildPrism(w, geo, profile.points)
    }
    if (!tool) return { error: 'edge.error.unsupportedFace' }

    if (geo.convex) cutters.push(tool)
    else fillers.push(tool)
  }

  // Входное тело принадлежит вызывающему коду — не удаляем его.
  let current = solid
  let owned = false
  const unionAll = (tools: Manifold[]): Manifold | null => {
    if (tools.length === 0) return null
    let acc = tools[0]
    for (let i = 1; i < tools.length; i++) {
      const next = acc.add(tools[i])
      acc.delete()
      acc = next
    }
    return acc
  }

  const cutter = unionAll(cutters)
  if (cutter) {
    const next = current.subtract(cutter)
    if (owned) current.delete()
    cutter.delete()
    current = next
    owned = true
  }

  const filler = unionAll(fillers)
  if (filler) {
    const next = current.add(filler)
    if (owned) current.delete()
    filler.delete()
    current = next
    owned = true
  }

  return { solid: current }
}
