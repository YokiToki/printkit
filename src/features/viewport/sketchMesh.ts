import * as THREE from 'three'
import { type PlaneDefinition, type Sketch, type Curve, planeFrame } from '../../editor/sketch/model'

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
  /** Подсветка элементов, о которых говорит наведённое ограничение или строка списка. */
  highlight?: {
    points?: string[]
    curves?: string[]
  } | null
  preview?: {
    points?: Record<string, { x: number; y: number }>
    curves?: Record<string, Curve>
  }
  tool?: string
  toolStage?: number
  toolStartPt?: { x: number; y: number }
  cursorPlanePos?: { x: number; y: number } | null
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
const COLOR_HIGHLIGHT = 0x35d0ff // cyan

/** Размер точки на экране, CSS px: постоянный размер независимо от зума. */
export const POINT_SIZE_PX = 9
const POINT_SIZE_ACTIVE_PX = 13

/** Материалы общие для всех перестроений: пересоздание на каждое движение мыши было главным тормозом. */
const materialCache = new Map<string, THREE.Material>()
function cachedMaterial<T extends THREE.Material>(key: string, make: () => T): T {
  let m = materialCache.get(key)
  if (!m) {
    m = make()
    materialCache.set(key, m)
  }
  return m as T
}

function pointMaterial(): THREE.ShaderMaterial {
  const dpr = typeof window !== 'undefined' ? Math.max(1, Math.min(window.devicePixelRatio || 1, 3)) : 1
  return cachedMaterial(
    `points:dpr${dpr}`,
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        uniforms: { uPx: { value: dpr } },
        vertexShader: `
          attribute float size;
          attribute vec3 aColor;
          varying vec3 vColor;
          uniform float uPx;
          void main() {
            vColor = aColor;
            gl_PointSize = size * uPx;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            float border = smoothstep(0.48, 0.38, dist);
            vec3 c = mix(vec3(0.12, 0.15, 0.20), vColor, border);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
  )
}

function planeMatrix(plane: PlaneDefinition): THREE.Matrix4 {
  const frame = planeFrame(plane)
  const mat = new THREE.Matrix4()
  mat.set(
    frame.xDir[0], frame.yDir[0], frame.normal[0], frame.origin[0],
    frame.xDir[1], frame.yDir[1], frame.normal[1], frame.origin[1],
    frame.xDir[2], frame.yDir[2], frame.normal[2], frame.origin[2],
    0, 0, 0, 1,
  )
  return mat
}

function orientedGroup(plane: PlaneDefinition): THREE.Group {
  const group = new THREE.Group()
  group.matrixAutoUpdate = false
  group.matrix.copy(planeMatrix(plane))
  group.matrixWorldNeedsUpdate = true
  return group
}

/** Сетка плоскости: строится один раз на плоскость, а не на каждое изменение эскиза. */
export function buildSketchGrid(plane: PlaneDefinition, gridCfg?: ViewportSketchConfig['grid']): THREE.Group {
  const group = orientedGroup(plane)
  if (gridCfg?.visible === false) return group

  const gridSize = gridCfg?.size ?? 10
  const halfRange = 250
  const gridPositions: number[] = []

  for (let x = -halfRange; x <= halfRange; x += gridSize) {
    if (Math.abs(x) >= 1e-5) gridPositions.push(x, -halfRange, 0, x, halfRange, 0)
  }
  for (let y = -halfRange; y <= halfRange; y += gridSize) {
    if (Math.abs(y) >= 1e-5) gridPositions.push(-halfRange, y, 0, halfRange, y, 0)
  }

  // Фоновые линии сетки
  if (gridPositions.length > 0) {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3))
    group.add(
      new THREE.LineSegments(
        geom,
        cachedMaterial('grid', () => new THREE.LineBasicMaterial({ color: 0x272d36, transparent: true, opacity: 0.6 })),
      ),
    )
  }

  // Красная ось X (Y = 0)
  const xAxisGeom = new THREE.BufferGeometry()
  xAxisGeom.setAttribute('position', new THREE.Float32BufferAttribute([-halfRange, 0, 0.01, halfRange, 0, 0.01], 3))
  group.add(
    new THREE.LineSegments(
      xAxisGeom,
      cachedMaterial('axis:x', () => new THREE.LineBasicMaterial({ color: 0xf05060, transparent: true, opacity: 0.95 })),
    ),
  )

  // Зеленая ось Y (X = 0)
  const yAxisGeom = new THREE.BufferGeometry()
  yAxisGeom.setAttribute('position', new THREE.Float32BufferAttribute([0, -halfRange, 0.01, 0, halfRange, 0.01], 3))
  group.add(
    new THREE.LineSegments(
      yAxisGeom,
      cachedMaterial('axis:y', () => new THREE.LineBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.95 })),
    ),
  )

  // Маркер начала координат (0, 0)
  const originPositions: number[] = [
    -3, 0, 0.02, 3, 0, 0.02,
    0, -3, 0.02, 0, 3, 0.02,
  ]
  const originGeom = new THREE.BufferGeometry()
  originGeom.setAttribute('position', new THREE.Float32BufferAttribute(originPositions, 3))
  group.add(
    new THREE.LineSegments(
      originGeom,
      cachedMaterial('axis:origin', () => new THREE.LineBasicMaterial({ color: 0xf7c948 })),
    ),
  )

  return group
}

const Z_CURVE = 0.05

/** Кривые и точки эскиза: несколько вызовов отрисовки (по цвету), а не по объекту на каждый отрезок. */
export function buildSketchContent(config: ViewportSketchConfig): THREE.Group {
  const { plane, sketch, selection, hover, highlight, preview, dofStatus, conflicts } = config
  const group = orientedGroup(plane)

  const getPoint = (id: string): { x: number; y: number } | undefined => preview?.points?.[id] ?? sketch.points[id]
  const allCurves: Record<string, Curve> = { ...sketch.curves, ...(preview?.curves ?? {}) }

  const solid = new Map<number, number[]>()
  const dashed = new Map<number, number[]>()
  const push = (map: Map<number, number[]>, color: number, pts: Array<{ x: number; y: number }>) => {
    let arr = map.get(color)
    if (!arr) {
      arr = []
      map.set(color, arr)
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      arr.push(pts[i].x, pts[i].y, Z_CURVE, pts[i + 1].x, pts[i + 1].y, Z_CURVE)
    }
  }

  for (const [id, c] of Object.entries(allCurves)) {
    const isSelected = selection?.curves?.includes(id)
    const isHighlighted = highlight?.curves?.includes(id)
    const isHovered = hover?.kind === 'curve' && hover?.id === id
    const isConflict = conflicts?.curves?.includes(id)
    const isDefined = dofStatus?.curves?.[id]

    let color = COLOR_UNDERDEFINED
    if (isSelected) color = COLOR_SELECTED
    else if (isHighlighted) color = COLOR_HIGHLIGHT
    else if (isHovered) color = COLOR_HOVER
    else if (isConflict) color = COLOR_CONFLICT
    else if (c.construction) color = COLOR_CONSTRUCTION
    else if (isDefined) color = COLOR_DEFINED

    const pts: Array<{ x: number; y: number }> = []
    if (c.kind === 'line') {
      const p1 = getPoint(c.a)
      const p2 = getPoint(c.b)
      if (p1 && p2) pts.push(p1, p2)
    } else if (c.kind === 'circle') {
      const center = getPoint(c.c)
      if (center) {
        const segs = 64
        for (let i = 0; i <= segs; i++) {
          const ang = (i * 2 * Math.PI) / segs
          pts.push({ x: center.x + c.r * Math.cos(ang), y: center.y + c.r * Math.sin(ang) })
        }
      }
    } else if (c.kind === 'arc') {
      const center = getPoint(c.c)
      const p1 = getPoint(c.a)
      const p2 = getPoint(c.b)
      if (center && p1 && p2) {
        const r = Math.hypot(p1.x - center.x, p1.y - center.y)
        const a1 = Math.atan2(p1.y - center.y, p1.x - center.x)
        const a2 = Math.atan2(p2.y - center.y, p2.x - center.x)
        let dAngle = a2 - a1
        while (dAngle <= 0) dAngle += 2 * Math.PI
        const segs = 32
        for (let i = 0; i <= segs; i++) {
          const ang = a1 + (dAngle * i) / segs
          pts.push({ x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) })
        }
      }
    }
    if (pts.length >= 2) {
      push(c.construction ? dashed : solid, color, pts)
      if (isSelected || isHighlighted) {
        // Добавляем параллельные линии со смещением, чтобы выбранные линии были жирными и контрастными
        const offPts1: Array<{ x: number; y: number }> = []
        const offPts2: Array<{ x: number; y: number }> = []
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1]
          const dx = b.x - a.x, dy = b.y - a.y
          const len = Math.hypot(dx, dy) || 1
          const nx = (-dy / len) * 0.25, ny = (dx / len) * 0.25
          offPts1.push({ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny })
          offPts2.push({ x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny })
        }
        push(solid, color, offPts1)
        push(solid, color, offPts2)
      }
    }
  }

  for (const [color, positions] of solid) {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    group.add(new THREE.LineSegments(geom, cachedMaterial(`line:${color}`, () => new THREE.LineBasicMaterial({ color }))))
  }
  for (const [color, positions] of dashed) {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const lines = new THREE.LineSegments(
      geom,
      cachedMaterial(`dash:${color}`, () => new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 2 })),
    )
    lines.computeLineDistances()
    group.add(lines)
  }

  // Точки: один объект Points с постоянным экранным размером
  const allPoints: Record<string, { x: number; y: number }> = { ...sketch.points, ...(preview?.points ?? {}) }
  const ids = Object.keys(allPoints)
  if (ids.length > 0) {
    const positions = new Float32Array(ids.length * 3)
    const colors = new Float32Array(ids.length * 3)
    const sizes = new Float32Array(ids.length)
    const tmp = new THREE.Color()
    ids.forEach((id, i) => {
      const pt = allPoints[id]
      const isDirectSelected = selection?.points?.includes(id)
      const isCurveEndpointSelected = !!selection?.curves?.some((cid) => {
        const c = sketch.curves[cid]
        if (!c) return false
        if (c.kind === 'line') return c.a === id || c.b === id
        if (c.kind === 'circle') return c.c === id
        if (c.kind === 'arc') return c.a === id || c.b === id || c.c === id
        return false
      })
      const isSelected = isDirectSelected || isCurveEndpointSelected
      const isHighlighted = highlight?.points?.includes(id)
      const isHovered = hover?.kind === 'point' && hover?.id === id
      const isConflict = conflicts?.points?.includes(id)
      const isDefined = dofStatus?.points?.[id]

      let color = COLOR_UNDERDEFINED
      if (isSelected) color = COLOR_SELECTED
      else if (isHighlighted) color = COLOR_HIGHLIGHT
      else if (isHovered) color = COLOR_HOVER
      else if (isConflict) color = COLOR_CONFLICT
      else if (isDefined) color = COLOR_DEFINED

      tmp.set(color)
      positions.set([pt.x, pt.y, Z_CURVE + 0.01], i * 3)
      colors.set([tmp.r, tmp.g, tmp.b], i * 3)
      sizes[i] = isSelected || isHighlighted || isHovered ? POINT_SIZE_ACTIVE_PX : POINT_SIZE_PX
    })
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    const points = new THREE.Points(geom, pointMaterial())
    points.frustumCulled = false
    points.renderOrder = 5
    group.add(points)
  }

  return group
}

/** Сетка и содержимое одной группой (для тестов и разовых построений). */
export function buildSketchGroup(config: ViewportSketchConfig): THREE.Group {
  const group = new THREE.Group()
  group.add(buildSketchGrid(config.plane, config.grid), buildSketchContent(config))
  return group
}
