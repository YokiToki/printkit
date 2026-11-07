export type Vec2 = [number, number]
export type Polygon = Vec2[]

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

function pointInLoop(p: Vec2, loop: Polygon): boolean {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = loop[i][0], yi = loop[i][1]
    const xj = loop[j][0], yj = loop[j][1]
    const intersect =
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Signed distance to polygon: positive inside, negative outside.
 */
export function signedDistToPolygon(p: Vec2, loops: Polygon[]): number {
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

export function poleOfInaccessibility(
  loops: Polygon[],
  precision = 0.2
): { point: Vec2; distance: number } {
  if (loops.length === 0) {
    return { point: [0, 0], distance: -1 }
  }

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
  if (cellSize <= 1e-4) {
    return { point: [(minX + maxX) / 2, (minY + maxY) / 2], distance: 0 }
  }

  const h = cellSize / 2

  interface Cell {
    x: number
    y: number
    h: number
    d: number
    max: number
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

  let bestCell: Cell = {
    x: minX + width / 2,
    y: minY + height / 2,
    h: 0,
    d: signedDistToPolygon([minX + width / 2, minY + height / 2], loops),
    max: 0,
  }
  for (const cell of cells) {
    if (cell.d > bestCell.d) bestCell = cell
  }

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

export interface PlacedConnector {
  point: Vec2
  distanceToEdge: number
  valid: boolean
  issue?: 'outside' | 'thin'
}

export interface PlaceOptions {
  count?: number
  margin?: number // minimum edge clearance, mm
  gridStep?: number
  manualPositions?: Vec2[]
}

/**
 * Places connectors on a 2D section.
 * If manual positions are supplied, validates each against the section boundaries.
 * Otherwise, uses farthest-point sampling starting from the pole of inaccessibility.
 */
export function placeConnectors(
  sectionLoops: Polygon[],
  options: PlaceOptions = {}
): PlacedConnector[] {
  const { count = 2, margin = 2.0, gridStep = 1.0, manualPositions } = options

  if (manualPositions && manualPositions.length > 0) {
    return manualPositions.map((pos) => {
      const dist = signedDistToPolygon(pos, sectionLoops)
      if (dist < 0) {
        return { point: pos, distanceToEdge: dist, valid: false, issue: 'outside' }
      }
      if (dist < margin) {
        return { point: pos, distanceToEdge: dist, valid: false, issue: 'thin' }
      }
      return { point: pos, distanceToEdge: dist, valid: true }
    })
  }

  if (count <= 0 || sectionLoops.length === 0) return []

  const pole = poleOfInaccessibility(sectionLoops)
  if (pole.distance <= 0) {
    return [{ point: pole.point, distanceToEdge: pole.distance, valid: false, issue: 'outside' }]
  }

  // If section is too thin to satisfy the requested margin
  if (pole.distance < margin) {
    return [{ point: pole.point, distanceToEdge: pole.distance, valid: false, issue: 'thin' }]
  }

  // Bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const loop of sectionLoops) {
    for (const [x, y] of loop) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  // Generate candidate points
  const candidates: Vec2[] = []
  for (let x = minX + margin; x <= maxX - margin; x += gridStep) {
    for (let y = minY + margin; y <= maxY - margin; y += gridStep) {
      if (signedDistToPolygon([x, y], sectionLoops) >= margin) {
        candidates.push([x, y])
      }
    }
  }

  if (candidates.length === 0) {
    return [{ point: pole.point, distanceToEdge: pole.distance, valid: true }]
  }

  // Find candidate closest to pole
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < candidates.length; i++) {
    const d = Math.hypot(candidates[i][0] - pole.point[0], candidates[i][1] - pole.point[1])
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }

  const placed: Vec2[] = [candidates[bestIdx]]
  const minDistToPlaced = new Float32Array(candidates.length)
  for (let i = 0; i < candidates.length; i++) {
    minDistToPlaced[i] = Math.hypot(candidates[i][0] - placed[0][0], candidates[i][1] - placed[0][1])
  }

  while (placed.length < count) {
    let nextBest = -1
    let maxMinDist = -1
    for (let i = 0; i < candidates.length; i++) {
      if (minDistToPlaced[i] > maxMinDist) {
        maxMinDist = minDistToPlaced[i]
        nextBest = i
      }
    }

    if (nextBest < 0 || maxMinDist < 1e-3) break
    const nextPt = candidates[nextBest]
    placed.push(nextPt)

    for (let i = 0; i < candidates.length; i++) {
      const d = Math.hypot(candidates[i][0] - nextPt[0], candidates[i][1] - nextPt[1])
      if (d < minDistToPlaced[i]) minDistToPlaced[i] = d
    }
  }

  return placed.map((pt) => ({
    point: pt,
    distanceToEdge: signedDistToPolygon(pt, sectionLoops),
    valid: true,
  }))
}
