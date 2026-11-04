import * as THREE from 'three'
import {
  type PlaneDefinition,
  type Sketch,
  type Curve,
  type LineCurve,
  type CircleCurve,
  type ArcCurve,
  planeFrame,
} from '../../editor/sketch/model'

export interface ViewportSketchConfig {
  plane: PlaneDefinition
  sketch: Sketch
  selection?: {
    points?: string[]
    curves?: string[]
  }
  hover?: {
    kind: 'point' | 'curve'
    id: string
  } | null
  preview?: {
    points?: Record<string, { x: number; y: number }>
    curves?: Record<string, Curve>
  }
  tool?: string
  grid?: {
    size?: number
    visible?: boolean
  }
  dofStatus?: {
    points?: Record<string, boolean>
    curves?: Record<string, boolean>
  }
  conflicts?: {
    constraints?: string[]
    curves?: string[]
    points?: string[]
  }
}

const COLOR_UNDERDEFINED = 0x7c9cff // blue
const COLOR_DEFINED = 0xe6e9ee // white / dark text
const COLOR_CONFLICT = 0xf0707b // red
const COLOR_CONSTRUCTION = 0x8893a2 // muted grey
const COLOR_SELECTED = 0xf0944a // orange
const COLOR_HOVER = 0xffffff // bright white

export function buildSketchGroup(config: ViewportSketchConfig): THREE.Group {
  const group = new THREE.Group()
  const { plane, sketch, selection, hover, preview, grid: gridCfg, dofStatus, conflicts } = config

  // Orient group to plane frame
  const frame = planeFrame(plane)
  const mat = new THREE.Matrix4()
  mat.set(
    frame.xDir[0], frame.yDir[0], frame.normal[0], frame.origin[0],
    frame.xDir[1], frame.yDir[1], frame.normal[1], frame.origin[1],
    frame.xDir[2], frame.yDir[2], frame.normal[2], frame.origin[2],
    0, 0, 0, 1,
  )
  group.matrixAutoUpdate = false
  group.matrix.copy(mat)
  group.matrixWorldNeedsUpdate = true

  // 1. Plane Grid
  if (gridCfg?.visible !== false) {
    const gridSize = gridCfg?.size ?? 10
    const halfRange = 200
    const gridPositions: number[] = []
    const axisPositions: number[] = []

    for (let x = -halfRange; x <= halfRange; x += gridSize) {
      if (Math.abs(x) < 1e-5) {
        axisPositions.push(x, -halfRange, 0, x, halfRange, 0)
      } else {
        gridPositions.push(x, -halfRange, 0, x, halfRange, 0)
      }
    }
    for (let y = -halfRange; y <= halfRange; y += gridSize) {
      if (Math.abs(y) < 1e-5) {
        axisPositions.push(-halfRange, y, 0, halfRange, y, 0)
      } else {
        gridPositions.push(-halfRange, y, 0, halfRange, y, 0)
      }
    }

    if (gridPositions.length > 0) {
      const gridGeom = new THREE.BufferGeometry()
      gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3))
      const gridMat = new THREE.LineBasicMaterial({ color: 0x272d36, transparent: true, opacity: 0.6 })
      group.add(new THREE.LineSegments(gridGeom, gridMat))
    }

    if (axisPositions.length > 0) {
      const axisGeom = new THREE.BufferGeometry()
      axisGeom.setAttribute('position', new THREE.Float32BufferAttribute(axisPositions, 3))
      const axisMat = new THREE.LineBasicMaterial({ color: 0x414b59, transparent: true, opacity: 0.9 })
      group.add(new THREE.LineSegments(axisGeom, axisMat))
    }
  }

  // Helper to resolve points (sketch points + preview points)
  const getPoint = (id: string): { x: number; y: number } | undefined => {
    return preview?.points?.[id] ?? sketch.points[id]
  }

  // Combine curves
  const allCurves: Record<string, Curve> = {
    ...sketch.curves,
    ...(preview?.curves ?? {}),
  }

  // 2. Render Curves
  const zOffset = 0.05

  for (const [id, c] of Object.entries(allCurves)) {
    const isSelected = selection?.curves?.includes(id)
    const isHovered = hover?.kind === 'curve' && hover?.id === id
    const isConflict = conflicts?.curves?.includes(id)
    const isDefined = dofStatus?.curves?.[id]

    let color = COLOR_UNDERDEFINED
    if (isSelected) color = COLOR_SELECTED
    else if (isHovered) color = COLOR_HOVER
    else if (isConflict) color = COLOR_CONFLICT
    else if (c.construction) color = COLOR_CONSTRUCTION
    else if (isDefined) color = COLOR_DEFINED

    const pts: THREE.Vector3[] = []

    if (c.kind === 'line') {
      const p1 = getPoint(c.a)
      const p2 = getPoint(c.b)
      if (p1 && p2) {
        pts.push(new THREE.Vector3(p1.x, p1.y, zOffset), new THREE.Vector3(p2.x, p2.y, zOffset))
      }
    } else if (c.kind === 'circle') {
      const center = getPoint(c.c)
      if (center) {
        const segs = 64
        for (let i = 0; i <= segs; i++) {
          const ang = (i * 2 * Math.PI) / segs
          pts.push(new THREE.Vector3(center.x + c.r * Math.cos(ang), center.y + c.r * Math.sin(ang), zOffset))
        }
      }
    } else if (c.kind === 'arc') {
      const center = getPoint(c.c)
      const p1 = getPoint(c.a)
      const p2 = getPoint(c.b)
      if (center && p1 && p2) {
        const r = Math.hypot(p1.x - center.x, p1.y - center.y)
        let a1 = Math.atan2(p1.y - center.y, p1.x - center.x)
        let a2 = Math.atan2(p2.y - center.y, p2.x - center.x)
        let dAngle = a2 - a1
        while (dAngle <= 0) dAngle += 2 * Math.PI
        const segs = 32
        for (let i = 0; i <= segs; i++) {
          const ang = a1 + (dAngle * i) / segs
          pts.push(new THREE.Vector3(center.x + r * Math.cos(ang), center.y + r * Math.sin(ang), zOffset))
        }
      }
    }

    if (pts.length >= 2) {
      const geom = new THREE.BufferGeometry().setFromPoints(pts)
      if (c.construction) {
        const mat = new THREE.LineDashedMaterial({
          color,
          dashSize: 3,
          gapSize: 2,
        })
        const line = new THREE.Line(geom, mat)
        line.computeLineDistances()
        group.add(line)
      } else {
        const mat = new THREE.LineBasicMaterial({
          color,
          linewidth: isSelected || isHovered ? 2 : 1,
        })
        group.add(new THREE.Line(geom, mat))
      }
    }
  }

  // 3. Render Points
  const allPoints: Record<string, { x: number; y: number }> = {
    ...sketch.points,
    ...(preview?.points ?? {}),
  }

  const pointGeom = new THREE.CircleGeometry(1.2, 16)

  for (const [id, pt] of Object.entries(allPoints)) {
    const isSelected = selection?.points?.includes(id)
    const isHovered = hover?.kind === 'point' && hover?.id === id
    const isConflict = conflicts?.points?.includes(id)
    const isDefined = dofStatus?.points?.[id]

    let color = COLOR_UNDERDEFINED
    if (isSelected) color = COLOR_SELECTED
    else if (isHovered) color = COLOR_HOVER
    else if (isConflict) color = COLOR_CONFLICT
    else if (isDefined) color = COLOR_DEFINED

    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false })
    const mesh = new THREE.Mesh(pointGeom, mat)
    mesh.position.set(pt.x, pt.y, zOffset + 0.01)
    group.add(mesh)
  }

  return group
}
