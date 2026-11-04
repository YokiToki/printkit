import type { Sketch, Curve, LineCurve, CircleCurve, ArcCurve } from '../../editor/sketch/model'

export interface ProfileRegion {
  id: string
  outerLoop: [number, number][] // CCW
  holes: [number, number][][] // CW
}

export interface ProfileError {
  code: 'sketch.error.openProfile' | 'sketch.error.selfIntersect' | 'sketch.error.noProfiles'
  point?: [number, number]
}

export interface ProfileOptions {
  chordTolerance?: number
  circleSegments?: number
}

export interface ProfileResult {
  regions: ProfileRegion[]
  errors?: ProfileError[]
}

// Point-in-polygon (ray casting)
export function pointInPolygon(pt: [number, number], poly: [number, number][]): boolean {
  let inside = false
  const [px, py] = pt
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Polygon area (shoelace)
export function polygonArea(poly: [number, number][]): number {
  let area = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1]
  }
  return area / 2
}

// Ensure winding: positive = CCW, negative = CW
export function ensureWinding(poly: [number, number][], ccw: boolean): [number, number][] {
  const area = polygonArea(poly)
  if ((ccw && area < 0) || (!ccw && area > 0)) {
    return [...poly].reverse()
  }
  return poly
}

function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): [number, number] | null {
  const d1x = p2[0] - p1[0]
  const d1y = p2[1] - p1[1]
  const d2x = p4[0] - p3[0]
  const d2y = p4[1] - p3[1]
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-9) return null

  const s = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denom
  const t = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / denom

  // Strict interior intersection
  if (s > 1e-5 && s < 1 - 1e-5 && t > 1e-5 && t < 1 - 1e-5) {
    return [p1[0] + s * d1x, p1[1] + s * d1y]
  }
  return null
}

export function extractProfiles(sketch: Sketch, options: ProfileOptions = {}): ProfileResult {
  const chordTol = options.chordTolerance ?? 0.01
  const defaultCircleSegs = options.circleSegments ?? 96

  // 1. Filter out construction curves
  const curves = Object.values(sketch.curves).filter(c => !c.construction)
  if (curves.length === 0) {
    return { regions: [], errors: [{ code: 'sketch.error.noProfiles' }] }
  }

  const discretisedLoops: [number, number][][] = []
  const circles: CircleCurve[] = []
  const pathCurves: (LineCurve | ArcCurve)[] = []

  for (const c of curves) {
    if (c.kind === 'circle') {
      circles.push(c)
    } else {
      pathCurves.push(c)
    }
  }

  // Discretise circles
  for (const c of circles) {
    const center = sketch.points[c.c]
    if (!center) continue
    const segs = Math.max(
      16,
      Math.min(360, Math.ceil(Math.PI / Math.acos(Math.max(-1, Math.min(1, 1 - chordTol / c.r))))),
    ) || defaultCircleSegs
    const pts: [number, number][] = []
    for (let i = 0; i < segs; i++) {
      const angle = (i * 2 * Math.PI) / segs
      pts.push([center.x + c.r * Math.cos(angle), center.y + c.r * Math.sin(angle)])
    }
    discretisedLoops.push(pts)
  }

  // Build graph for lines and arcs
  if (pathCurves.length > 0) {
    // Map of point positions with merging within 1e-5
    const ptCoords: Record<string, [number, number]> = {}
    for (const [id, pt] of Object.entries(sketch.points)) {
      ptCoords[id] = [pt.x, pt.y]
    }

    // Build adjacency: nodeId -> edges [{ to, curveId, isReversed }]
    interface Edge {
      to: string
      curve: LineCurve | ArcCurve
      isReversed: boolean
    }
    const adj: Record<string, Edge[]> = {}

    for (const c of pathCurves) {
      const startId = c.a
      const endId = c.b
      if (!adj[startId]) adj[startId] = []
      if (!adj[endId]) adj[endId] = []
      adj[startId].push({ to: endId, curve: c, isReversed: false })
      adj[endId].push({ to: startId, curve: c, isReversed: true })
    }

    // Check for open ends (nodes with degree === 1)
    for (const [nodeId, edges] of Object.entries(adj)) {
      if (edges.length === 1) {
        const p = ptCoords[nodeId] ?? [0, 0]
        return {
          regions: [],
          errors: [{ code: 'sketch.error.openProfile', point: p }],
        }
      }
    }

    // Decompose into cycles using standard traversal
    const visitedEdges = new Set<string>()

    function getEdgeKey(curveId: string, isReversed: boolean): string {
      return `${curveId}_${isReversed ? 'rev' : 'fwd'}`
    }

    for (const startNode of Object.keys(adj)) {
      for (const firstEdge of adj[startNode]) {
        const firstKey = getEdgeKey(firstEdge.curve.id, firstEdge.isReversed)
        if (visitedEdges.has(firstKey)) continue

        const cycleEdges: Edge[] = []
        let currNode = startNode
        let nextEdge: Edge | null = firstEdge
        let lastCurveId = ''

        while (nextEdge) {
          cycleEdges.push(nextEdge)
          visitedEdges.add(getEdgeKey(nextEdge.curve.id, nextEdge.isReversed))
          lastCurveId = nextEdge.curve.id
          currNode = nextEdge.to
          if (currNode === startNode) break

          // Pick next edge that doesn't immediately backtrack along the same curve
          const candidates = adj[currNode].filter(
            e => e.curve.id !== lastCurveId && !visitedEdges.has(getEdgeKey(e.curve.id, e.isReversed)),
          )
          nextEdge = candidates.length > 0 ? candidates[0] : null
        }

        if (currNode === startNode && cycleEdges.length >= 2) {
          // Also mark reverse edges of this cycle to avoid duplicate reverse cycle
          for (const e of cycleEdges) {
            visitedEdges.add(getEdgeKey(e.curve.id, !e.isReversed))
          }

          // Discretise this cycle
          const loopPts: [number, number][] = []

          for (const edge of cycleEdges) {
            const c = edge.curve
            if (c.kind === 'line') {
              const startPt = ptCoords[edge.isReversed ? c.b : c.a]
              loopPts.push(startPt)
            } else if (c.kind === 'arc') {
              const center = ptCoords[c.c]
              const startPt = ptCoords[edge.isReversed ? c.b : c.a]
              const endPt = ptCoords[edge.isReversed ? c.a : c.b]
              const r = Math.hypot(startPt[0] - center[0], startPt[1] - center[1])
              let a1 = Math.atan2(startPt[1] - center[1], startPt[0] - center[0])
              let a2 = Math.atan2(endPt[1] - center[1], endPt[0] - center[0])

              let dAngle: number
              if (!edge.isReversed) {
                // Forward: arc was CCW from a to b
                dAngle = a2 - a1
                while (dAngle <= 0) dAngle += 2 * Math.PI
              } else {
                // Reversed: arc traversal goes CW from b to a
                dAngle = a2 - a1
                while (dAngle >= 0) dAngle -= 2 * Math.PI
              }

              const segs = Math.max(4, Math.ceil(Math.abs(dAngle) / (Math.PI / 16)))
              for (let i = 0; i < segs; i++) {
                const angle = a1 + (dAngle * i) / segs
                loopPts.push([center[0] + r * Math.cos(angle), center[1] + r * Math.sin(angle)])
              }
            }
          }

          if (loopPts.length >= 3) {
            discretisedLoops.push(loopPts)
          }
        }
      }
    }
  }

  if (discretisedLoops.length === 0) {
    return { regions: [], errors: [{ code: 'sketch.error.noProfiles' }] }
  }

  // 4. Check for self-intersections and crossings between loops
  for (let l1 = 0; l1 < discretisedLoops.length; l1++) {
    const loop1 = discretisedLoops[l1]
    const n1 = loop1.length
    for (let i = 0; i < n1; i++) {
      const e1a = loop1[i]
      const e1b = loop1[(i + 1) % n1]

      // Check with other loops
      for (let l2 = l1 + 1; l2 < discretisedLoops.length; l2++) {
        const loop2 = discretisedLoops[l2]
        const n2 = loop2.length
        for (let j = 0; j < n2; j++) {
          const e2a = loop2[j]
          const e2b = loop2[(j + 1) % n2]
          const inter = segmentsIntersect(e1a, e1b, e2a, e2b)
          if (inter) {
            return {
              regions: [],
              errors: [{ code: 'sketch.error.selfIntersect', point: inter }],
            }
          }
        }
      }
    }
  }

  // 5. Build containment tree and nesting
  // For each loop, count how many other loops contain it
  interface LoopNode {
    id: string
    poly: [number, number][]
    area: number
    containmentCount: number
    containedIn: number[] // indices of enclosing loops
  }

  const nodes: LoopNode[] = discretisedLoops.map((poly, idx) => ({
    id: `loop_${idx}`,
    poly,
    area: Math.abs(polygonArea(poly)),
    containmentCount: 0,
    containedIn: [],
  }))

  for (let i = 0; i < nodes.length; i++) {
    // Pick first point of loop i (or average of first few to be safe)
    const testPt = nodes[i].poly[0]
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue
      if (pointInPolygon(testPt, nodes[j].poly)) {
        nodes[i].containmentCount++
        nodes[i].containedIn.push(j)
      }
    }
  }

  // A loop with an even number of enclosing loops is an outer boundary of a region (0 = top-level, 2 = island inside hole)
  // A loop with an odd number of enclosing loops is a hole of the immediate enclosing region (the one with highest containmentCount < its own)
  const regions: ProfileRegion[] = []
  const loopToRegionIndex: Record<number, number> = {}

  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].containmentCount % 2 === 0) {
      // Outer boundary (CCW)
      const outerLoop = ensureWinding(nodes[i].poly, true)
      loopToRegionIndex[i] = regions.length
      regions.push({
        id: `region_${regions.length + 1}`,
        outerLoop,
        holes: [],
      })
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].containmentCount % 2 === 1) {
      // Hole (CW)
      const holeLoop = ensureWinding(nodes[i].poly, false)
      // Find the immediate parent region (enclosing loop with containmentCount = this.containmentCount - 1)
      let parentLoopIdx = -1
      let maxParentCount = -1
      for (const parentIdx of nodes[i].containedIn) {
        if (nodes[parentIdx].containmentCount % 2 === 0 && nodes[parentIdx].containmentCount > maxParentCount) {
          maxParentCount = nodes[parentIdx].containmentCount
          parentLoopIdx = parentIdx
        }
      }
      if (parentLoopIdx !== -1 && loopToRegionIndex[parentLoopIdx] !== undefined) {
        regions[loopToRegionIndex[parentLoopIdx]].holes.push(holeLoop)
      }
    }
  }

  return { regions }
}
