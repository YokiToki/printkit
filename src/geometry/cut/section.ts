import type { CrossSection, Manifold, Mat4 } from 'manifold-3d'
import { normalizePlane, type PlaneDefinition, type Vec3 } from './plane'

export interface PlaneFrame {
  origin: Vec3
  u: Vec3
  v: Vec3
  normal: Vec3
  toWorld: (p: [number, number], zOffset?: number) => Vec3
  toPlane: (p: Vec3) => [number, number]
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2])
  if (len < 1e-9) return [0, 0, 1]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

/**
 * Builds an orthonormal frame on the plane such that:
 * - normal is the plane normal
 * - u, v lie in the plane
 * - origin is the closest point on the plane to (0,0,0) (i.e. normal * originOffset)
 */
export function buildPlaneFrame(normal: Vec3, originOffset: number): PlaneFrame {
  const n = normalize3(normal)
  const origin: Vec3 = [n[0] * originOffset, n[1] * originOffset, n[2] * originOffset]

  // Choose an arbitrary vector not parallel to n
  const ref: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]
  const u = normalize3(cross3(ref, n))
  const v = normalize3(cross3(n, u))

  return {
    origin,
    u,
    v,
    normal: n,
    toWorld: (pt, zOffset = 0) => [
      origin[0] + pt[0] * u[0] + pt[1] * v[0] + zOffset * n[0],
      origin[1] + pt[0] * u[1] + pt[1] * v[1] + zOffset * n[1],
      origin[2] + pt[0] * u[2] + pt[1] * v[2] + zOffset * n[2],
    ],
    toPlane: (p) => {
      const rel: Vec3 = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]]
      return [dot3(rel, u), dot3(rel, v)]
    },
  }
}

export interface CutSectionResult {
  frame: PlaneFrame
  crossSection: CrossSection
  polygons: [number, number][][]
  area: number
  isEmpty: boolean
}

/**
 * Computes the 2D cross section of a solid at the given cutting plane,
 * expressed in the plane's (u, v) coordinates.
 */
export function getCutSection(
  solid: Manifold,
  planeDef: PlaneDefinition
): CutSectionResult {
  const { normal, originOffset } = normalizePlane(planeDef)
  const frame = buildPlaneFrame(normal, originOffset)

  // 4x4 Column-major transformation matrix mapping World -> Plane Frame coordinates
  const tx = -dot3(frame.origin, frame.u)
  const ty = -dot3(frame.origin, frame.v)
  const tz = -dot3(frame.origin, frame.normal)

  const mat: Mat4 = [
    frame.u[0], frame.v[0], frame.normal[0], 0,
    frame.u[1], frame.v[1], frame.normal[1], 0,
    frame.u[2], frame.v[2], frame.normal[2], 0,
    tx, ty, tz, 1,
  ]

  // Transform solid into plane frame and slice at z = 0
  const transformed = solid.transform(mat)
  const crossSection = transformed.slice(0)
  const rawPolygons = crossSection.toPolygons()

  // Convert raw polygons to typed arrays
  const polygons: [number, number][][] = []
  for (const loop of rawPolygons) {
    const pts: [number, number][] = []
    for (let i = 0; i < loop.length; i++) {
      pts.push([loop[i][0], loop[i][1]])
    }
    polygons.push(pts)
  }

  return {
    frame,
    crossSection,
    polygons,
    area: crossSection.area(),
    isEmpty: crossSection.isEmpty(),
  }
}

/**
 * Computes inset of a cross section by a margin distance (in mm).
 */
export function insetSection(
  crossSection: CrossSection,
  margin: number
): { crossSection: CrossSection; polygons: [number, number][][]; isEmpty: boolean } {
  if (margin <= 1e-6) {
    const polys = crossSection.toPolygons().map((loop) =>
      loop.map((p) => [p[0], p[1]] as [number, number])
    )
    return {
      crossSection,
      polygons: polys,
      isEmpty: crossSection.isEmpty(),
    }
  }

  const inset = crossSection.offset(-margin)
  const polys = inset.toPolygons().map((loop) =>
    loop.map((p) => [p[0], p[1]] as [number, number])
  )
  return {
    crossSection: inset,
    polygons: polys,
    isEmpty: inset.isEmpty(),
  }
}

/**
 * Chains line segments into closed 2D polygon loops.
 */
function chainSegmentsToPolygons(
  segments: Array<[[number, number], [number, number]]>,
  tol = 0.05
): [number, number][][] {
  const tolSq = tol * tol
  const distSq = (a: [number, number], b: [number, number]) => {
    const dx = a[0] - b[0]
    const dy = a[1] - b[1]
    return dx * dx + dy * dy
  }

  const unused = new Set<number>()
  for (let i = 0; i < segments.length; i++) unused.add(i)

  const loops: [number, number][][] = []

  while (unused.size > 0) {
    const firstIdx = unused.values().next().value!
    unused.delete(firstIdx)

    const loop: [number, number][] = [segments[firstIdx][0], segments[firstIdx][1]]
    let closed = false

    while (!closed) {
      const tail = loop[loop.length - 1]
      let foundNext = false

      for (const idx of unused) {
        const seg = segments[idx]
        if (distSq(tail, seg[0]) < tolSq) {
          loop.push(seg[1])
          unused.delete(idx)
          foundNext = true
          break
        } else if (distSq(tail, seg[1]) < tolSq) {
          loop.push(seg[0])
          unused.delete(idx)
          foundNext = true
          break
        }
      }

      if (!foundNext) {
        break
      }

      if (distSq(loop[loop.length - 1], loop[0]) < tolSq) {
        loop.pop()
        closed = true
      }
    }

    if (loop.length >= 3) {
      loops.push(loop)
    }
  }

  return loops
}

export interface MeshDataSliceInput {
  vertProperties?: Float32Array | ArrayLike<number>
  triVerts?: Uint32Array | ArrayLike<number>
  numProp?: number
  vertices?: Float32Array | ArrayLike<number>
  indices?: Uint32Array | ArrayLike<number>
}

/**
 * Slices a 3D indexed triangle mesh with a plane to produce 2D section polygon loops
 * expressed in the plane's (u, v) coordinates.
 * Pure TypeScript, zero WASM/worker dependency, suitable for real-time UI previews.
 */
export function getMeshSectionPolygons(
  meshOrVerts: MeshDataSliceInput | ArrayLike<number>,
  indicesOrPlane: ArrayLike<number> | PlaneDefinition,
  planeOrUndefined?: PlaneDefinition
): [number, number][][] {
  let vertices: ArrayLike<number> = []
  let indices: ArrayLike<number> = []
  let numProp = 3
  let planeDef: PlaneDefinition

  if (typeof (meshOrVerts as any).length !== 'number') {
    const m = meshOrVerts as MeshDataSliceInput
    vertices = m.vertProperties ?? m.vertices ?? []
    indices = m.triVerts ?? m.indices ?? []
    numProp = m.numProp ?? 3
    planeDef = indicesOrPlane as PlaneDefinition
  } else {
    vertices = meshOrVerts as ArrayLike<number>
    indices = indicesOrPlane as ArrayLike<number>
    numProp = 3
    planeDef = planeOrUndefined!
  }

  if (vertices.length < numProp * 3 || indices.length < 3 || !planeDef) return []

  const { normal, originOffset } = normalizePlane(planeDef)
  const frame = buildPlaneFrame(normal, originOffset)

  const numVerts = Math.floor(vertices.length / numProp)
  const dists = new Float64Array(numVerts)
  const nx = frame.normal[0]
  const ny = frame.normal[1]
  const nz = frame.normal[2]

  for (let i = 0; i < numVerts; i++) {
    const vx = vertices[i * numProp]
    const vy = vertices[i * numProp + 1]
    const vz = vertices[i * numProp + 2]
    dists[i] = nx * vx + ny * vy + nz * vz - originOffset
  }

  const segments: Array<[[number, number], [number, number]]> = []
  const numTris = Math.floor(indices.length / 3)

  for (let t = 0; t < numTris; t++) {
    const i0 = indices[t * 3]
    const i1 = indices[t * 3 + 1]
    const i2 = indices[t * 3 + 2]

    const d0 = dists[i0]
    const d1 = dists[i1]
    const d2 = dists[i2]

    const pos = (d0 > 1e-6 ? 1 : 0) + (d1 > 1e-6 ? 1 : 0) + (d2 > 1e-6 ? 1 : 0)
    const neg = (d0 < -1e-6 ? 1 : 0) + (d1 < -1e-6 ? 1 : 0) + (d2 < -1e-6 ? 1 : 0)

    if (pos === 0 || neg === 0) continue

    const pts: [number, number][] = []

    const checkEdge = (va: number, vb: number, da: number, db: number) => {
      if ((da > 1e-6 && db < -1e-6) || (da < -1e-6 && db > 1e-6)) {
        const factor = -da / (db - da)
        const wx = vertices[va * numProp] + factor * (vertices[vb * numProp] - vertices[va * numProp])
        const wy = vertices[va * numProp + 1] + factor * (vertices[vb * numProp + 1] - vertices[va * numProp + 1])
        const wz = vertices[va * numProp + 2] + factor * (vertices[vb * numProp + 2] - vertices[va * numProp + 2])
        pts.push(frame.toPlane([wx, wy, wz]))
      }
    }

    checkEdge(i0, i1, d0, d1)
    checkEdge(i1, i2, d1, d2)
    checkEdge(i2, i0, d2, d0)

    if (pts.length === 2) {
      segments.push([pts[0], pts[1]])
    }
  }

  if (segments.length === 0) return []

  return chainSegmentsToPolygons(segments)
}
