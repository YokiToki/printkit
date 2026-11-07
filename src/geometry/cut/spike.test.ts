import { describe, expect, it } from 'vitest'
import { getWasm } from '../wasm'

type Vec2 = [number, number]
type Polygon = Vec2[] // list of vertices forming a loop

/**
 * Computes distance from point p to line segment [a, b].
 */
function pointToSegmentDistSq(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (l2 < 1e-12) {
    const px = p[0] - a[0]
    const py = p[1] - a[1]
    return px * px + py * py
  }
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  const projX = a[0] + t * dx
  const projY = a[1] + t * dy
  const rx = p[0] - projX
  const ry = p[1] - projY
  return rx * rx + ry * ry
}

/**
 * Checks whether point p is inside polygon loop using ray casting.
 */
function pointInLoop(p: Vec2, loop: Polygon): boolean {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = loop[i][0], yi = loop[i][1]
    const xj = loop[j][0], yj = loop[j][1]
    const intersect = ((yi > p[1]) !== (yj > p[1])) &&
      (p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Signed distance to multi-loop polygon (outer loops clockwise or CCW, holes reverse or handled via winding).
 * Positive if inside, negative if outside.
 */
function signedDistToPolygon(p: Vec2, loops: Polygon[]): number {
  let inside = false
  let minDistSq = Infinity

  for (const loop of loops) {
    if (pointInLoop(p, loop)) {
      inside = !inside
    }
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const d = pointToSegmentDistSq(p, loop[i], loop[j])
      if (d < minDistSq) minDistSq = d
    }
  }

  const dist = Math.sqrt(minDistSq)
  return inside ? dist : -dist
}

/**
 * Pole of Inaccessibility (Polylabel algorithm) for 2D section.
 * Finds center of maximum inscribed circle.
 */
export function poleOfInaccessibility(
  loops: Polygon[],
  precision = 0.2
): { point: Vec2; distance: number } {
  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const loop of loops) {
    for (const [x, y] of loop) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  const width = maxX - minX
  const height = maxY - minY
  const cellSize = Math.min(width, height)
  let h = cellSize / 2

  // Initial grid of candidate points
  interface Cell {
    x: number
    y: number
    h: number
    d: number // distance to boundary at center
    max: number // upper bound on distance inside cell: d + h * sqrt(2)
  }

  const cells: Cell[] = []
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      const cx = x + h
      const cy = y + h
      const d = signedDistToPolygon([cx, cy], loops)
      cells.push({ x: cx, y: cy, h, d, max: d + h * Math.SQRT2 })
    }
  }

  let bestCell: Cell = { x: minX + width / 2, y: minY + height / 2, h: 0, d: signedDistToPolygon([minX + width / 2, minY + height / 2], loops), max: 0 }
  for (const cell of cells) {
    if (cell.d > bestCell.d) bestCell = cell
  }

  // Priority queue / iterative quadtree subdivision
  const queue = cells.sort((a, b) => b.max - a.max)

  while (queue.length > 0) {
    const cell = queue.shift()!
    if (cell.d > bestCell.d) {
      bestCell = cell
    }

    if (cell.max - bestCell.d <= precision) continue

    const subH = cell.h / 2
    const subCells: Cell[] = [
      { x: cell.x - subH, y: cell.y - subH, h: subH, d: 0, max: 0 },
      { x: cell.x + subH, y: cell.y - subH, h: subH, d: 0, max: 0 },
      { x: cell.x - subH, y: cell.y + subH, h: subH, d: 0, max: 0 },
      { x: cell.x + subH, y: cell.y + subH, h: subH, d: 0, max: 0 },
    ]

    for (const sub of subCells) {
      sub.d = signedDistToPolygon([sub.x, sub.y], loops)
      sub.max = sub.d + subH * Math.SQRT2
      if (sub.max > bestCell.d) {
        queue.push(sub)
      }
    }
    queue.sort((a, b) => b.max - a.max)
  }

  return { point: [bestCell.x, bestCell.y], distance: bestCell.d }
}

/**
 * Farthest-point sampling to place `count` points inside section with at least `margin` clearance from boundary.
 */
export function placeFarthestPoints(
  loops: Polygon[],
  count: number,
  margin = 2.0,
  gridStep = 1.0
): Vec2[] {
  if (count <= 0) return []

  // 1. Gather all candidate grid points inside polygon with distance >= margin
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const loop of loops) {
    for (const [x, y] of loop) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  const candidates: Vec2[] = []
  for (let x = minX + margin; x <= maxX - margin; x += gridStep) {
    for (let y = minY + margin; y <= maxY - margin; y += gridStep) {
      if (signedDistToPolygon([x, y], loops) >= margin) {
        candidates.push([x, y])
      }
    }
  }

  if (candidates.length === 0) {
    // If margin is too big, fallback to pole of inaccessibility
    const pole = poleOfInaccessibility(loops)
    return [pole.point]
  }

  // First point is the pole of inaccessibility (or candidate closest to it)
  const pole = poleOfInaccessibility(loops)
  let firstIdx = 0
  let bestDistToPole = Infinity
  for (let i = 0; i < candidates.length; i++) {
    const [cx, cy] = candidates[i]
    const d = Math.hypot(cx - pole.point[0], cy - pole.point[1])
    if (d < bestDistToPole) {
      bestDistToPole = d
      firstIdx = i
    }
  }

  const placed: Vec2[] = [candidates[firstIdx]]
  if (count === 1) return placed

  // Iteratively pick candidates that maximize minimum distance to already placed points
  const minDistToPlaced = new Float32Array(candidates.length)
  for (let i = 0; i < candidates.length; i++) {
    const dx = candidates[i][0] - placed[0][0]
    const dy = candidates[i][1] - placed[0][1]
    minDistToPlaced[i] = Math.hypot(dx, dy)
  }

  while (placed.length < count) {
    let bestIdx = -1
    let maxMinDist = -1
    for (let i = 0; i < candidates.length; i++) {
      if (minDistToPlaced[i] > maxMinDist) {
        maxMinDist = minDistToPlaced[i]
        bestIdx = i
      }
    }

    if (bestIdx < 0 || maxMinDist < 1e-3) break
    const nextPt = candidates[bestIdx]
    placed.push(nextPt)

    // Update distances
    for (let i = 0; i < candidates.length; i++) {
      const d = Math.hypot(candidates[i][0] - nextPt[0], candidates[i][1] - nextPt[1])
      if (d < minDistToPlaced[i]) minDistToPlaced[i] = d
    }
  }

  return placed
}

describe('Task 1.1 Spike: Cut and Placement', () => {
  it('verifies splitByPlane, trimByPlane, and slice on manifold models with volume preservation', async () => {
    const w = await getWasm()

    // Create an L-bracket: (30 x 10 x 20) + (10 x 30 x 20)
    const base = w.Manifold.cube([30, 10, 20], false)
    const leg = w.Manifold.cube([10, 30, 20], false)
    const bracket = w.Manifold.union(base, leg)

    const initialVol = bracket.volume()
    expect(initialVol).toBeGreaterThan(0)
    expect(bracket.status()).toBe('NoError')

    // 1. Cut with splitByPlane along X = 15
    // Plane: normal [1, 0, 0], originOffset = 15
    const t0 = performance.now()
    const halves = bracket.splitByPlane([1, 0, 0], 15)
    const tSplit = performance.now() - t0

    expect(halves.length).toBe(2)
    const v1 = halves[0].volume()
    const v2 = halves[1].volume()
    expect(halves[0].status()).toBe('NoError')
    expect(halves[1].status()).toBe('NoError')
    expect(v1 + v2).toBeCloseTo(initialVol, 4)

    // 2. Cut with trimByPlane
    const t1 = performance.now()
    const trimmed = bracket.trimByPlane([1, 0, 0], 15)
    const tTrim = performance.now() - t1
    expect(trimmed.status()).toBe('NoError')
    expect(trimmed.volume()).toBeCloseTo(v1, 4)

    // 3. Slice at Z = 10
    const t2 = performance.now()
    const section = bracket.slice(10)
    const tSlice = performance.now() - t2
    expect(section.isEmpty()).toBe(false)
    expect(section.area()).toBeGreaterThan(0)

    console.log('Manifold performance timings:', {
      splitTimeMs: tSplit.toFixed(3),
      trimTimeMs: tTrim.toFixed(3),
      sliceTimeMs: tSlice.toFixed(3),
      initialVolume: initialVol,
      sumSplitVolumes: v1 + v2,
    })
  })

  it('prototypes pole of inaccessibility and farthest-point placement on 3 reference sections', () => {
    // 1. Rectangle 40 x 20 (-20..20, -10..10)
    const rect: Polygon[] = [
      [[-20, -10], [20, -10], [20, 10], [-20, 10]],
    ]
    const rectPole = poleOfInaccessibility(rect)
    expect(rectPole.point[0]).toBeCloseTo(0, 0.5)
    expect(rectPole.point[1]).toBeCloseTo(0, 0.5)
    expect(rectPole.distance).toBeCloseTo(10, 0.5) // distance to closest edge = 10

    const rectPoints2 = placeFarthestPoints(rect, 2, 2.0, 1.0)
    expect(rectPoints2.length).toBe(2)
    // In 40x20 rectangle, two points should separate along X axis
    expect(Math.abs(rectPoints2[0][0] - rectPoints2[1][0])).toBeGreaterThan(15)

    // 2. L-shape: 40x40 with thickness 10
    // (0,0) -> (40,0) -> (40,10) -> (10,10) -> (10,40) -> (0,40)
    const lShape: Polygon[] = [
      [[0, 0], [40, 0], [40, 10], [10, 10], [10, 40], [0, 40]],
    ]
    const lPole = poleOfInaccessibility(lShape)
    // Corner region junction has exact maximum inscribed circle radius ~5.86
    expect(lPole.distance).toBeCloseTo(5.86, 0.5)

    const lPoints3 = placeFarthestPoints(lShape, 3, 2.0, 1.0)
    expect(lPoints3.length).toBe(3)

    // 3. Ring (annulus): outer radius 20 (approx circle), inner radius 10
    const numPts = 32
    const outerLoop: Polygon = []
    const innerLoop: Polygon = []
    for (let i = 0; i < numPts; i++) {
      const a = (i * 2 * Math.PI) / numPts
      outerLoop.push([20 * Math.cos(a), 20 * Math.sin(a)])
      // inner loop in reverse order
      const aRev = -((i * 2 * Math.PI) / numPts)
      innerLoop.push([10 * Math.cos(aRev), 10 * Math.sin(aRev)])
    }
    const ring: Polygon[] = [outerLoop, innerLoop]
    const ringPole = poleOfInaccessibility(ring)
    // Annulus width is (20 - 10) = 10, max inscribed circle radius is 5
    expect(ringPole.distance).toBeCloseTo(5, 0.5)

    const ringPoints4 = placeFarthestPoints(ring, 4, 2.0, 1.0)
    expect(ringPoints4.length).toBe(4)
    // 4 points on the ring should be distributed around the ring (approx 90 deg apart)
    for (const pt of ringPoints4) {
      const r = Math.hypot(pt[0], pt[1])
      expect(r).toBeGreaterThan(12)
      expect(r).toBeLessThan(18)
    }

    console.log('Placement results:', {
      rectanglePole: rectPole,
      rectanglePoints2: rectPoints2,
      lPole: lPole,
      lPoints3: lPoints3,
      ringPole: ringPole,
      ringPoints4: ringPoints4,
    })
  })
})
