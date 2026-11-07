import type { Manifold } from 'manifold-3d'
import { normalizePlane, type Vec3 } from './plane'

export interface BedDimensions {
  x: number
  y: number
  z: number
}

export interface GridCuts {
  x?: number[]
  y?: number[]
  z?: number[]
}

export interface SplitPartInfo {
  label: string
  col: number
  row: number
  layer: number
  min: Vec3
  max: Vec3
  oversize: boolean
  manifold: Manifold
}

export interface AutoCutsOptions {
  usableBed: BedDimensions
  manualCuts?: GridCuts
  sectionSampler?: (axis: 'x' | 'y' | 'z', pos: number) => number
}

/**
 * Letter for column index: 0 -> 'A', 1 -> 'B', 25 -> 'Z', 26 -> 'AA'.
 */
export function columnLetter(col: number): string {
  let s = ''
  let c = col
  while (c >= 0) {
    s = String.fromCharCode(65 + (c % 26)) + s
    c = Math.floor(c / 26) - 1
  }
  return s
}

/**
 * Computes automatic cut positions along an axis.
 * Fewest parts, evenly spread, with optional section minimum optimization within +/- 10% of cut step.
 */
export function autoCutsAxis(
  minVal: number,
  maxVal: number,
  usableSpan: number,
  sectionSampler?: (pos: number) => number
): number[] {
  const span = maxVal - minVal
  if (span <= usableSpan || usableSpan <= 0) {
    return []
  }

  const numParts = Math.ceil(span / usableSpan)
  if (numParts <= 1) return []

  const step = span / numParts
  const cuts: number[] = []

  for (let i = 1; i < numParts; i++) {
    const nominalPos = minVal + i * step
    if (sectionSampler) {
      // Sample within +/- 10% of step to find area minimum
      const searchRadius = 0.1 * step
      let bestPos = nominalPos
      let minArea = Infinity
      const numSamples = 20

      for (let s = -numSamples; s <= numSamples; s++) {
        const testPos = nominalPos + (s / numSamples) * searchRadius
        const area = sectionSampler(testPos)
        if (area < minArea) {
          minArea = area
          bestPos = testPos
        }
      }
      cuts.push(bestPos)
    } else {
      cuts.push(nominalPos)
    }
  }

  return cuts
}

/**
 * Resolves the cuts to perform for a solid on a given bed,
 * respecting manual cuts and calculating auto cuts for unspecified axes.
 */
export function resolveGridCuts(
  solid: Manifold,
  options: AutoCutsOptions
): { x: number[]; y: number[]; z: number[] } {
  const bbox = solid.boundingBox()
  const { usableBed, manualCuts, sectionSampler } = options

  const cutsX = manualCuts?.x !== undefined
    ? manualCuts.x
    : autoCutsAxis(
        bbox.min[0],
        bbox.max[0],
        usableBed.x,
        sectionSampler ? (p) => sectionSampler('x', p) : undefined
      )

  const cutsY = manualCuts?.y !== undefined
    ? manualCuts.y
    : autoCutsAxis(
        bbox.min[1],
        bbox.max[1],
        usableBed.y,
        sectionSampler ? (p) => sectionSampler('y', p) : undefined
      )

  const cutsZ = manualCuts?.z !== undefined
    ? manualCuts.z
    : autoCutsAxis(
        bbox.min[2],
        bbox.max[2],
        usableBed.z,
        sectionSampler ? (p) => sectionSampler('z', p) : undefined
      )

  return {
    x: [...cutsX].sort((a, b) => a - b),
    y: [...cutsY].sort((a, b) => a - b),
    z: [...cutsZ].sort((a, b) => a - b),
  }
}

/**
 * Cuts a solid into derived parts using a grid of X, Y, Z planes.
 * Execution order: X, then Y, then Z.
 * Labels: A1, B1, A2, B2... (plus layer suffix -1, -2 if Z cuts are present).
 */
export function splitSolidGrid(
  solid: Manifold,
  cuts: { x: number[]; y: number[]; z: number[] },
  bed: BedDimensions
): SplitPartInfo[] {
  if (solid.isEmpty()) return []

  // 1. Split along X
  interface IntermediatePart {
    manifold: Manifold
    col: number
    row: number
    layer: number
  }

  let xParts: IntermediatePart[] = [{ manifold: solid, col: 0, row: 0, layer: 0 }]
  for (let c = 0; c < cuts.x.length; c++) {
    const cutX = cuts.x[c]
    const nextX: IntermediatePart[] = []
    for (const p of xParts) {
      if (p.col === c) {
        const { normal, originOffset } = normalizePlane({
          kind: 'axis',
          axis: 'x',
          position: cutX,
        })
        const halves = p.manifold.splitByPlane(normal, originOffset)
        nextX.push({ manifold: halves[1], col: c, row: 0, layer: 0 })
        nextX.push({ manifold: halves[0], col: c + 1, row: 0, layer: 0 })
      } else {
        nextX.push(p)
      }
    }
    xParts = nextX
  }

  // 2. Split along Y
  let yParts: IntermediatePart[] = []
  for (const xp of xParts) {
    let currentY: IntermediatePart[] = [xp]
    for (let r = 0; r < cuts.y.length; r++) {
      const cutY = cuts.y[r]
      const nextY: IntermediatePart[] = []
      for (const yp of currentY) {
        if (yp.row === r) {
          const { normal, originOffset } = normalizePlane({
            kind: 'axis',
            axis: 'y',
            position: cutY,
          })
          const halves = yp.manifold.splitByPlane(normal, originOffset)
          nextY.push({ manifold: halves[1], col: yp.col, row: r, layer: 0 })
          nextY.push({ manifold: halves[0], col: yp.col, row: r + 1, layer: 0 })
        } else {
          nextY.push(yp)
        }
      }
      currentY = nextY
    }
    yParts.push(...currentY)
  }

  // 3. Split along Z
  let zParts: IntermediatePart[] = []
  for (const yp of yParts) {
    let currentZ: IntermediatePart[] = [yp]
    for (let l = 0; l < cuts.z.length; l++) {
      const cutZ = cuts.z[l]
      const nextZ: IntermediatePart[] = []
      for (const zp of currentZ) {
        if (zp.layer === l) {
          const { normal, originOffset } = normalizePlane({
            kind: 'axis',
            axis: 'z',
            position: cutZ,
          })
          const halves = zp.manifold.splitByPlane(normal, originOffset)
          nextZ.push({ manifold: halves[1], col: zp.col, row: zp.row, layer: l })
          nextZ.push({ manifold: halves[0], col: zp.col, row: zp.row, layer: l + 1 })
        } else {
          nextZ.push(zp)
        }
      }
      currentZ = nextZ
    }
    zParts.push(...currentZ)
  }

  // 4. Construct final part info with bounding boxes and labels
  const results: SplitPartInfo[] = []
  const hasZ = cuts.z.length > 0

  for (const p of zParts) {
    if (p.manifold.isEmpty() || p.manifold.volume() < 1e-5) continue

    const bbox = p.manifold.boundingBox()
    const dx = bbox.max[0] - bbox.min[0]
    const dy = bbox.max[1] - bbox.min[1]
    const dz = bbox.max[2] - bbox.min[2]

    // Part is oversize if its dimensions exceed the bed
    const oversize = dx > bed.x + 1e-4 || dy > bed.y + 1e-4 || dz > bed.z + 1e-4

    const baseLabel = `${columnLetter(p.col)}${p.row + 1}`
    const label = hasZ ? `${baseLabel}-${p.layer + 1}` : baseLabel

    results.push({
      label,
      col: p.col,
      row: p.row,
      layer: p.layer,
      min: [bbox.min[0], bbox.min[1], bbox.min[2]],
      max: [bbox.max[0], bbox.max[1], bbox.max[2]],
      oversize,
      manifold: p.manifold,
    })
  }

  return results
}
