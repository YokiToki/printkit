import * as THREE from 'three'
import { planeFrame, type PlaneDefinition, type Sketch } from '../../editor/sketch/model'

export function lookAtPlane(
  plane: PlaneDefinition,
  center: { x: number; y: number } = { x: 0, y: 0 },
  distance = 200,
): {
  position: [number, number, number]
  target: [number, number, number]
  up: [number, number, number]
} {
  const frame = planeFrame(plane)
  const tx = frame.origin[0] + center.x * frame.xDir[0] + center.y * frame.yDir[0]
  const ty = frame.origin[1] + center.x * frame.xDir[1] + center.y * frame.yDir[1]
  const tz = frame.origin[2] + center.x * frame.xDir[2] + center.y * frame.yDir[2]

  const px = tx + frame.normal[0] * distance
  const py = ty + frame.normal[1] * distance
  const pz = tz + frame.normal[2] * distance

  return {
    position: [px, py, pz],
    target: [tx, ty, tz],
    up: [frame.yDir[0], frame.yDir[1], frame.yDir[2]],
  }
}

export interface CameraLike {
  matrixWorld: THREE.Matrix4
  projectionMatrixInverse: THREE.Matrix4
}

export function pointerToPlaneCoordinates(
  screenPos: { x: number; y: number },
  viewportSize: { width: number; height: number },
  camera: CameraLike,
  plane: PlaneDefinition,
): { x: number; y: number } | null {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) return null

  // Normalized device coordinates (-1 to +1)
  const ndcX = (screenPos.x / viewportSize.width) * 2 - 1
  const ndcY = 1 - (screenPos.y / viewportSize.height) * 2

  // Unproject near and far points
  const pNear = new THREE.Vector3(ndcX, ndcY, -1)
    .applyMatrix4(camera.projectionMatrixInverse)
    .applyMatrix4(camera.matrixWorld)

  const pFar = new THREE.Vector3(ndcX, ndcY, 1)
    .applyMatrix4(camera.projectionMatrixInverse)
    .applyMatrix4(camera.matrixWorld)

  const rayDir = pFar.clone().sub(pNear).normalize()

  // Intersect ray with plane
  const frame = planeFrame(plane)
  const p0 = new THREE.Vector3(...frame.origin)
  const normal = new THREE.Vector3(...frame.normal)

  const denom = normal.dot(rayDir)
  if (Math.abs(denom) < 1e-7) return null

  const t = p0.clone().sub(pNear).dot(normal) / denom
  const hit = pNear.clone().addScaledVector(rayDir, t)

  // Convert world hit point to 2D plane coordinates
  const diff = hit.sub(p0)
  const uDir = new THREE.Vector3(...frame.xDir)
  const vDir = new THREE.Vector3(...frame.yDir)

  return {
    x: diff.dot(uDir),
    y: diff.dot(vDir),
  }
}

function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export interface ScreenPickResult {
  kind: 'point' | 'curve'
  id: string
  distance: number
}

export function screenPick(
  pointerScreen: { x: number; y: number },
  sketch: Sketch,
  projectToScreen: (planePt: { x: number; y: number }) => { x: number; y: number } | null,
  thresholdPx = 6,
): ScreenPickResult | null {
  let closestPoint: { id: string; dist: number } | null = null

  // 1. Points priority
  for (const [id, pt] of Object.entries(sketch.points)) {
    const sp = projectToScreen(pt)
    if (!sp) continue
    const d = Math.hypot(sp.x - pointerScreen.x, sp.y - pointerScreen.y)
    if (d <= thresholdPx && (!closestPoint || d < closestPoint.dist)) {
      closestPoint = { id, dist: d }
    }
  }

  if (closestPoint) {
    return { kind: 'point', id: closestPoint.id, distance: closestPoint.dist }
  }

  // 2. Curves
  let closestCurve: { id: string; dist: number } | null = null

  for (const [id, curve] of Object.entries(sketch.curves)) {
    let d = Infinity

    if (curve.kind === 'line') {
      const p1 = sketch.points[curve.a]
      const p2 = sketch.points[curve.b]
      if (p1 && p2) {
        const sp1 = projectToScreen(p1)
        const sp2 = projectToScreen(p2)
        if (sp1 && sp2) {
          d = distToSegment(pointerScreen, sp1, sp2)
        }
      }
    } else if (curve.kind === 'circle') {
      const center = sketch.points[curve.c]
      if (center) {
        const spCenter = projectToScreen(center)
        const spRadius = projectToScreen({ x: center.x + curve.r, y: center.y })
        if (spCenter && spRadius) {
          const rPx = Math.hypot(spRadius.x - spCenter.x, spRadius.y - spCenter.y)
          const distToCenter = Math.hypot(pointerScreen.x - spCenter.x, pointerScreen.y - spCenter.y)
          d = Math.abs(distToCenter - rPx)
        }
      }
    } else if (curve.kind === 'arc') {
      const center = sketch.points[curve.c]
      const p1 = sketch.points[curve.a]
      const p2 = sketch.points[curve.b]
      if (center && p1 && p2) {
        const r = Math.hypot(p1.x - center.x, p1.y - center.y)
        let a1 = Math.atan2(p1.y - center.y, p1.x - center.x)
        let a2 = Math.atan2(p2.y - center.y, p2.x - center.x)
        let dAngle = a2 - a1
        while (dAngle <= 0) dAngle += 2 * Math.PI
        const segs = 16
        let prevSp: { x: number; y: number } | null = null
        for (let i = 0; i <= segs; i++) {
          const ang = a1 + (dAngle * i) / segs
          const curSp = projectToScreen({ x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) })
          if (prevSp && curSp) {
            const segDist = distToSegment(pointerScreen, prevSp, curSp)
            if (segDist < d) d = segDist
          }
          prevSp = curSp
        }
      }
    }

    if (d <= thresholdPx && (!closestCurve || d < closestCurve.dist)) {
      closestCurve = { id, dist: d }
    }
  }

  if (closestCurve) {
    return { kind: 'curve', id: closestCurve.id, distance: closestCurve.dist }
  }

  return null
}
