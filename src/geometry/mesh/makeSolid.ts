import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { IndexedMesh, TriSoup } from '../stl-import'
import { weld } from './weld'

export class MakeSolidBudgetError extends Error {
  totalCells: number
  memoryBytes: number
  suggestedResolution: number

  constructor(
    totalCells: number,
    memoryBytes: number,
    suggestedResolution: number,
    message?: string
  ) {
    super(
      message ??
        `Make Solid grid budget exceeded: ${totalCells.toLocaleString()} cells (${(
          memoryBytes / (1024 * 1024)
        ).toFixed(1)} MB). Suggested resolution: ${suggestedResolution.toFixed(2)} mm.`
    )
    this.name = 'MakeSolidBudgetError'
    this.totalCells = totalCells
    this.memoryBytes = memoryBytes
    this.suggestedResolution = suggestedResolution
  }
}

export interface MakeSolidOptions {
  /** Target grid cell edge length in mm. Default: max(0.2, bbox diagonal / 150) */
  resolution?: number
  /** Maximum allowed grid cells before refusing. Default: 12,500,000 (50 MB) */
  maxCells?: number
}

export interface MakeSolidReport {
  resolution: number
  totalCells: number
  memoryBytes: number
  volume: number
  triangles: number
}

/**
 * Computes generalized winding number of a triangle mesh at point P.
 * Van Oosterom & Strackee (1983).
 */
export function windingNumberAt(
  vertices: Float32Array | Float64Array,
  triVerts: Uint32Array,
  px: number,
  py: number,
  pz: number
): number {
  let totalSolidAngle = 0
  const numTris = triVerts.length / 3

  for (let i = 0; i < numTris; i++) {
    const i0 = triVerts[i * 3] * 3
    const i1 = triVerts[i * 3 + 1] * 3
    const i2 = triVerts[i * 3 + 2] * 3

    const ax = vertices[i0] - px
    const ay = vertices[i0 + 1] - py
    const az = vertices[i0 + 2] - pz

    const bx = vertices[i1] - px
    const by = vertices[i1 + 1] - py
    const bz = vertices[i1 + 2] - pz

    const cx = vertices[i2] - px
    const cy = vertices[i2 + 1] - py
    const cz = vertices[i2 + 2] - pz

    const la = Math.hypot(ax, ay, az)
    const lb = Math.hypot(bx, by, bz)
    const lc = Math.hypot(cx, cy, cz)

    if (la < 1e-9 || lb < 1e-9 || lc < 1e-9) continue

    const det =
      ax * (by * cz - bz * cy) -
      ay * (bx * cz - bz * cx) +
      az * (bx * cy - by * cx)

    const dotAB = ax * bx + ay * by + az * bz
    const dotAC = ax * cx + ay * cy + az * cz
    const dotBC = bx * cx + by * cy + bz * cz

    const denom = la * lb * lc + dotAB * lc + dotAC * lb + dotBC * la
    const omega = 2 * Math.atan2(det, denom)
    totalSolidAngle += omega
  }

  return totalSolidAngle / (4 * Math.PI)
}

/**
 * Reconstructs a watertight solid from a broken mesh using levelSet extraction
 * from the winding number field.
 */
export function makeSolid(
  w: ManifoldToplevel,
  mesh: TriSoup | IndexedMesh,
  options: MakeSolidOptions = {}
): { mesh: IndexedMesh; manifold: Manifold; report: MakeSolidReport } {
  const welded = 'triVerts' in mesh ? mesh : weld(mesh).mesh
  const { vertProperties, triVerts } = welded
  const numTris = triVerts.length / 3

  if (numTris === 0) {
    throw new Error('Cannot make solid from an empty mesh')
  }

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (let i = 0; i < vertProperties.length; i += 3) {
    const x = vertProperties[i], y = vertProperties[i + 1], z = vertProperties[i + 2]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }

  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ
  const diag = Math.hypot(dx, dy, dz)

  const res = options.resolution ?? Math.max(0.2, diag / 150)
  const maxCells = options.maxCells ?? 12_500_000

  const pad = res * 2
  const bounds = {
    min: [minX - pad, minY - pad, minZ - pad] as [number, number, number],
    max: [maxX + pad, maxY + pad, maxZ + pad] as [number, number, number],
  }

  const cellsX = Math.ceil((bounds.max[0] - bounds.min[0]) / res)
  const cellsY = Math.ceil((bounds.max[1] - bounds.min[1]) / res)
  const cellsZ = Math.ceil((bounds.max[2] - bounds.min[2]) / res)
  const totalCells = cellsX * cellsY * cellsZ
  const memoryBytes = totalCells * 4

  if (totalCells > maxCells) {
    // Calculate suggested resolution that fits in maxCells
    const targetVolume = (bounds.max[0] - bounds.min[0]) * (bounds.max[1] - bounds.min[1]) * (bounds.max[2] - bounds.min[2])
    const suggested = Math.cbrt(targetVolume / maxCells) * 1.05
    throw new MakeSolidBudgetError(totalCells, memoryBytes, Math.max(suggested, 0.2))
  }

  // Sample winding number field: inside is positive (wn > 0.5)
  const solid = w.Manifold.levelSet(
    (p: [number, number, number]) => {
      const wn = windingNumberAt(vertProperties, triVerts, p[0], p[1], p[2])
      return wn - 0.5
    },
    bounds,
    res,
    0,
    -1
  )

  const outMesh = solid.getMesh()
  const outIndexed: IndexedMesh = {
    vertProperties: outMesh.vertProperties,
    triVerts: outMesh.triVerts,
  }

  const vol = solid.volume()

  return {
    mesh: outIndexed,
    manifold: solid,
    report: {
      resolution: res,
      totalCells,
      memoryBytes,
      volume: Number(vol.toFixed(6)),
      triangles: outMesh.numTri,
    },
  }
}
