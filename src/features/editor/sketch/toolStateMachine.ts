import {
  type Sketch,
  type Curve,
  type Constraint,
  newId,
  addPoint,
  addLine,
  addCircle,
  addArc,
  mergePoints,
} from '../../../editor/sketch/model'
import { solve } from '../../../editor/sketch/solver'
import { inferSnap, type SnapResult } from '../../../editor/sketch/infer'
import { dimensionFor } from '../../../editor/sketch/measure'
import { rectangleMacro } from '../../../editor/sketch/tools/rectangle'
import { slotMacro } from '../../../editor/sketch/tools/slot'
import { polygonMacro } from '../../../editor/sketch/tools/polygon'
import { filletMacro } from '../../../editor/sketch/tools/fillet'
import { chamferMacro } from '../../../editor/sketch/tools/chamfer'
import { trimMacro } from '../../../editor/sketch/tools/trim'
import { mirrorMacro } from '../../../editor/sketch/tools/mirror'

export type SketchTool =
  | 'select'
  | 'line'
  | 'rect-2pt'
  | 'rect-center'
  | 'circle'
  | 'point'
  | 'arc-3pt'
  | 'arc-center'
  | 'slot'
  | 'polygon'
  | 'fillet'
  | 'chamfer'
  | 'trim'
  | 'mirror'
  | 'dimension'

export interface ToolState {
  tool: SketchTool
  construction: boolean
  stage: number
  startPt?: { x: number; y: number; pointId?: string }
  secondPt?: { x: number; y: number; pointId?: string }
  /** Значения, введённые в HUD на пройденных ступенях (радиус дуги по центру). */
  hud?: Record<string, number>
  /** В каких единицах введено поле размера: радиус или диаметр. */
  sizeMode?: 'radius' | 'diameter'
  selectedPointIds: string[]
  selectedCurveIds: string[]
  inferred?: SnapResult
  preview?: {
    points?: Record<string, { x: number; y: number }>
    curves?: Record<string, Curve>
  }
}

export interface ToolEvent {
  type: 'down' | 'move' | 'up' | 'key' | 'hud'
  pos?: { x: number; y: number }
  key?: string
  shift?: boolean
  ctrl?: boolean
  alt?: boolean
  /** Масштаб вида: допуски привязки заданы в пикселях экрана, а не в мм. */
  pixelsPerMm?: number
  /** Для типа 'hud': номер ступени и значения полей, введённые с клавиатуры. */
  stage?: number
  values?: Record<string, number>
  /** Единицы поля размера в этом вводе: радиус или диаметр. */
  sizeMode?: 'radius' | 'diameter'
}

export function initialToolState(tool: SketchTool = 'select', construction = false): ToolState {
  return {
    tool,
    construction,
    stage: 0,
    selectedPointIds: [],
    selectedCurveIds: [],
  }
}

/** Смена инструмента: выбор сохраняется там, где он нужен инструменту (зеркало, размер), иначе сбрасывается. */
export function switchTool(prev: ToolState, tool: SketchTool): ToolState {
  const next = initialToolState(tool, prev.construction)
  if (tool === 'select' || tool === 'mirror' || tool === 'dimension') {
    next.selectedPointIds = prev.selectedPointIds
    next.selectedCurveIds = prev.selectedCurveIds
  }
  return next
}

/** Окружность через три точки; дуга идёт против часовой стрелки от `a` к `b` через заданную точку. */
export function arcThrough(
  s: { x: number; y: number },
  e: { x: number; y: number },
  m: { x: number; y: number },
): { center: { x: number; y: number }; a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const d = 2 * (s.x * (e.y - m.y) + e.x * (m.y - s.y) + m.x * (s.y - e.y))
  if (Math.abs(d) < 1e-9) return null
  const s2 = s.x * s.x + s.y * s.y
  const e2 = e.x * e.x + e.y * e.y
  const m2 = m.x * m.x + m.y * m.y
  const center = {
    x: (s2 * (e.y - m.y) + e2 * (m.y - s.y) + m2 * (s.y - e.y)) / d,
    y: (s2 * (m.x - e.x) + e2 * (s.x - m.x) + m2 * (e.x - s.x)) / d,
  }
  const ang = (p: { x: number; y: number }) => Math.atan2(p.y - center.y, p.x - center.x)
  const ccw = (from: number, to: number) => {
    let v = to - from
    while (v < 0) v += 2 * Math.PI
    return v
  }
  const as = ang(s)
  return ccw(as, ang(m)) < ccw(as, ang(e)) ? { center, a: s, b: e } : { center, a: e, b: s }
}

export interface StateMachineResult {
  state: ToolState
  sketch: Sketch
  command?: {
    label: string
    mergeKey?: string
  }
}

/** Направление из центра на точку в градусах, 0…360. */
function angleFromCenterDeg(center: { x: number; y: number }, p: { x: number; y: number }): number {
  let deg = (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI
  if (deg < 0) deg += 360
  return deg
}

/** Дуга по центру, радиусу и углам в градусах с управляющим радиусом. */
function centerArc(
  sketch: Sketch,
  center: { x: number; y: number },
  r: number,
  a1Deg: number,
  a2Deg: number,
  construction = false,
): { sketch: Sketch; curveId: string } {
  const a1 = (a1Deg * Math.PI) / 180
  const a2 = (a2Deg * Math.PI) / 180
  const res = addArc(
    sketch,
    { x: center.x, y: center.y },
    { x: center.x + r * Math.cos(a1), y: center.y + r * Math.sin(a1) },
    { x: center.x + r * Math.cos(a2), y: center.y + r * Math.sin(a2) },
    construction,
  )
  res.sketch.constraints.push({ id: newId('con'), kind: 'radius', refs: [res.curveId], value: r })
  return { sketch: res.sketch, curveId: res.curveId }
}

/**
 * Завершение ступени ввода значениями из HUD: координаты и размеры создают
 * геометрию сразу с управляющими размерами (ограничениями-размерами).
 */
function handleHudCommit(
  sketch: Sketch,
  state: ToolState,
  stage: number,
  values: Record<string, number>,
  sizeMode: 'radius' | 'diameter',
  cursor?: { x: number; y: number },
): StateMachineResult {
  let s = sketch
  const nextState: ToolState = { ...state, hud: { ...state.hud, ...values }, sizeMode }
  let label: string | undefined
  const num = (name: string, fallback = 0): number => {
    const v = values[name]
    return typeof v === 'number' && isFinite(v) ? v : fallback
  }
  const x = num('x')
  const y = num('y')
  const selectResult = (): StateMachineResult => {
    nextState.stage = 0
    nextState.startPt = undefined
    nextState.secondPt = undefined
    nextState.hud = undefined
    nextState.preview = undefined
    nextState.tool = 'select' // фигура готова: следующий щелчок выбирает, а не рисует новую
    return { state: nextState, sketch: s, command: label ? { label } : undefined }
  }

  switch (state.tool) {
    case 'line': {
      if (stage === 0) {
        const res = addPoint(s, x, y)
        s = res.sketch
        nextState.stage = 1
        nextState.startPt = { x, y, pointId: res.pointId }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      }
      if (stage === 1 && state.startPt) {
        const p1 = state.startPt
        const resPt = addPoint(s, x, y)
        s = resPt.sketch
        let p1Id = p1.pointId
        if (!p1Id || !s.points[p1Id]) {
          const res = addPoint(s, p1.x, p1.y)
          s = res.sketch
          p1Id = res.pointId
        }
        const lineRes = addLine(s, p1Id, resPt.pointId, state.construction)
        s = lineRes.sketch
        const len = Math.hypot(x - p1.x, y - p1.y)
        if (len > 1e-4) {
          s.constraints.push({ id: newId('con'), kind: 'distance', refs: [lineRes.curveId], value: len })
        }
        return selectResult()
      }
      return { state: nextState, sketch: s }
    }

    case 'rect-2pt':
    case 'rect-center': {
      if (stage === 0) {
        nextState.stage = 1
        nextState.startPt = { x, y }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      }
      if (stage === 1 && state.startPt) {
        const p1 = state.startPt
        const w = Math.max(0.01, Math.abs(num('w')))
        const h = Math.max(0.01, Math.abs(num('h')))
        const sx = (cursor?.x ?? p1.x) >= p1.x ? 1 : -1
        const sy = (cursor?.y ?? p1.y) >= p1.y ? 1 : -1
        const isCenter = state.tool === 'rect-center'
        const res = rectangleMacro(s, {
          p1,
          p2: { x: p1.x + sx * w, y: p1.y + sy * h },
          isCenter,
          widthDim: w,
          heightDim: h,
        })
        s = res.sketch
        label = isCenter ? 'Add Center Rectangle' : 'Add Rectangle'
        return selectResult()
      }
      return { state: nextState, sketch: s }
    }

    case 'circle': {
      if (stage === 0) {
        const res = addPoint(s, x, y)
        s = res.sketch
        nextState.stage = 1
        nextState.startPt = { x, y, pointId: res.pointId }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      }
      if (stage === 1 && state.startPt) {
        const size = Math.abs(num('size'))
        if (size <= 0) return { state: nextState, sketch: s }
        const r = Math.max(0.1, sizeMode === 'diameter' ? size / 2 : size)
        const res = addCircle(s, state.startPt.pointId!, r, state.construction)
        s = res.sketch
        s.constraints.push(
          sizeMode === 'diameter'
            ? { id: newId('con'), kind: 'diameter', refs: [res.curveId], value: size }
            : { id: newId('con'), kind: 'radius', refs: [res.curveId], value: r },
        )
        label = 'Add Circle'
        return selectResult()
      }
      return { state: nextState, sketch: s }
    }

    case 'point': {
      const res = addPoint(s, x, y)
      s = res.sketch
      label = 'Add Point'
      return selectResult()
    }

    case 'arc-3pt': {
      if (stage === 0) {
        nextState.stage = 1
        nextState.startPt = { x, y }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      }
      if (stage === 1 && state.startPt) {
        nextState.stage = 2
        nextState.secondPt = { x, y }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      }
      if (stage === 2 && state.startPt && state.secondPt) {
        const arc = arcThrough(state.startPt, state.secondPt, { x, y })
        if (!arc) return { state: nextState, sketch: s } // три точки на одной прямой: дуги нет
        const res = addArc(s, arc.center, arc.a, arc.b, state.construction)
        s = res.sketch
        const r = Math.hypot(arc.a.x - arc.center.x, arc.a.y - arc.center.y)
        s.constraints.push({ id: newId('con'), kind: 'radius', refs: [res.curveId], value: r })
        label = 'Add Arc'
        return selectResult()
      }
      return { state: nextState, sketch: s }
    }

    case 'arc-center': {
      if (stage === 0) {
        nextState.stage = 1
        nextState.startPt = { x, y }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      }
      if (stage === 1 && state.startPt) {
        const r = Math.abs(num('size'))
        if (r <= 0) return { state: nextState, sketch: s }
        nextState.stage = 2
        nextState.hud = { ...nextState.hud, size: r }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      }
      if (stage === 2 && state.startPt) {
        const c = state.startPt
        const r = Math.max(0.1, nextState.hud?.size ?? 1)
        const arcRes = centerArc(s, c, r, num('a1'), num('a2'), state.construction)
        s = arcRes.sketch
        label = 'Add Center Arc'
        return selectResult()
      }
      return { state: nextState, sketch: s }
    }

    case 'polygon': {
      if (stage === 0) {
        nextState.stage = 1
        nextState.startPt = { x, y }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      }
      if (stage === 1 && state.startPt) {
        const r = Math.max(0.5, Math.abs(num('size')))
        const sides = num('n', 6)
        const res = polygonMacro(s, { center: state.startPt, radius: r, sides })
        s = res.sketch
        // Радиус на вспомогательной окружности задаёт размер многоугольника.
        const circleId = res.createdCurves[0]
        if (circleId) {
          s.constraints.push({ id: newId('con'), kind: 'radius', refs: [circleId], value: r })
        }
        label = 'Add Polygon'
        return selectResult()
      }
      return { state: nextState, sketch: s }
    }

    default:
      return { state: nextState, sketch: s }
  }
}

export function sketchToolReducer(
  sketch: Sketch,
  state: ToolState,
  event: ToolEvent,
): StateMachineResult {
  let s = sketch
  let nextState: ToolState = { ...state }

  // Handle escape: cancel current tool action or clear selection
  if (event.type === 'key' && event.key === 'Escape') {
    if (state.stage > 0) {
      nextState.stage = 0
      nextState.startPt = undefined
      nextState.secondPt = undefined
      nextState.hud = undefined
      nextState.sizeMode = undefined
      nextState.preview = undefined
      nextState.inferred = undefined
      return { state: nextState, sketch: s }
    }
    nextState.selectedPointIds = []
    nextState.selectedCurveIds = []
    nextState.preview = undefined
    return { state: nextState, sketch: s }
  }

  // Ввод значений с клавиатуры через плавающий HUD
  if (event.type === 'hud' && event.values) {
    return handleHudCommit(
      sketch,
      state,
      event.stage ?? state.stage,
      event.values,
      event.sizeMode ?? 'radius',
      event.pos,
    )
  }

  // Handle pointer move: update inference and preview
  if (event.type === 'move' && event.pos) {
    const rawPos = event.pos
    const disableInfer = !!event.ctrl
    const snap = disableInfer
      ? undefined
      : inferSnap(s, rawPos, {
          previousPoint: state.startPt,
          shiftKey: event.shift,
          ctrlKey: event.ctrl,
          pixelsPerMm: event.pixelsPerMm,
        })
    const activePos = snap?.pos ?? rawPos
    nextState.inferred = snap

    // Generate previews based on tool and stage
    if (state.tool === 'line' && state.stage === 1 && state.startPt) {
      const p1 = state.startPt
      const p2 = activePos
      nextState.preview = {
        points: { preview_start: p1, preview_end: p2 },
        curves: {
          preview_line: {
            id: 'preview_line',
            kind: 'line',
            a: 'preview_start',
            b: 'preview_end',
            construction: state.construction,
          },
        },
      }
    } else if ((state.tool === 'rect-2pt' || state.tool === 'rect-center') && state.stage === 1 && state.startPt) {
      const p1 = state.startPt
      let minX = Math.min(p1.x, activePos.x)
      let maxX = Math.max(p1.x, activePos.x)
      let minY = Math.min(p1.y, activePos.y)
      let maxY = Math.max(p1.y, activePos.y)
      if (state.tool === 'rect-center') {
        const dx = Math.abs(activePos.x - p1.x)
        const dy = Math.abs(activePos.y - p1.y)
        minX = p1.x - dx
        maxX = p1.x + dx
        minY = p1.y - dy
        maxY = p1.y + dy
      }
      nextState.preview = {
        points: {
          pr_1: { x: minX, y: minY },
          pr_2: { x: maxX, y: minY },
          pr_3: { x: maxX, y: maxY },
          pr_4: { x: minX, y: maxY },
        },
        curves: {
          pr_c1: { id: 'pr_c1', kind: 'line', a: 'pr_1', b: 'pr_2', construction: state.construction },
          pr_c2: { id: 'pr_c2', kind: 'line', a: 'pr_2', b: 'pr_3', construction: state.construction },
          pr_c3: { id: 'pr_c3', kind: 'line', a: 'pr_3', b: 'pr_4', construction: state.construction },
          pr_c4: { id: 'pr_c4', kind: 'line', a: 'pr_4', b: 'pr_1', construction: state.construction },
        },
      }
    } else if (state.tool === 'circle' && state.stage === 1 && state.startPt) {
      const r = Math.hypot(activePos.x - state.startPt.x, activePos.y - state.startPt.y)
      nextState.preview = {
        points: { pr_c: state.startPt },
        curves: {
          pr_circ: { id: 'pr_circ', kind: 'circle', c: 'pr_c', r, construction: state.construction },
        },
      }
    } else if (state.tool === 'arc-center' && state.stage === 1 && state.startPt) {
      nextState.preview = {
        points: { preview_start: state.startPt, preview_end: activePos },
        curves: {
          preview_line: {
            id: 'preview_line',
            kind: 'line',
            a: 'preview_start',
            b: 'preview_end',
            construction: true,
          },
        },
      }
    } else if (state.tool === 'arc-center' && state.stage === 2 && state.startPt) {
      // Радиус уже введён: показываем окружность, из которой вырежется дуга.
      const r = Math.max(0.1, state.hud?.size ?? Math.hypot(activePos.x - state.startPt.x, activePos.y - state.startPt.y))
      nextState.preview = {
        points: { pr_c: state.startPt },
        curves: {
          pr_circ: { id: 'pr_circ', kind: 'circle', c: 'pr_c', r, construction: true },
        },
      }
    } else if (state.tool === 'arc-3pt' && state.stage === 1 && state.startPt) {
      nextState.preview = {
        points: { preview_start: state.startPt, preview_end: activePos },
        curves: {
          preview_line: {
            id: 'preview_line',
            kind: 'line',
            a: 'preview_start',
            b: 'preview_end',
            construction: true,
          },
        },
      }
    } else if (state.tool === 'arc-3pt' && state.stage === 2 && state.startPt && state.secondPt) {
      const arc = arcThrough(state.startPt, state.secondPt, activePos)
      nextState.preview = arc
        ? {
            points: { pr_c: arc.center, pr_a: arc.a, pr_b: arc.b },
            curves: {
              pr_arc: { id: 'pr_arc', kind: 'arc', c: 'pr_c', a: 'pr_a', b: 'pr_b', construction: state.construction },
            },
          }
        : undefined
    } else {
      nextState.preview = undefined
    }

    return { state: nextState, sketch: s }
  }

  // Handle pointer down / clicks
  if (event.type === 'down' && event.pos) {
    const rawPos = event.pos
    const disableInfer = !!event.ctrl
    const snap = disableInfer
      ? undefined
      : inferSnap(s, rawPos, {
          previousPoint: state.startPt,
          shiftKey: event.shift,
          ctrlKey: event.ctrl,
          pixelsPerMm: event.pixelsPerMm,
        })
    const pt = snap?.pos ?? rawPos

    if (state.tool === 'line') {
      if (state.stage === 0) {
        // Start first line
        let p1Id = snap?.glyph === 'coincident' ? snap.targetId : undefined
        if (!p1Id) {
          const res = addPoint(s, pt.x, pt.y)
          s = res.sketch
          p1Id = res.pointId
        }
        nextState.stage = 1
        nextState.startPt = { x: pt.x, y: pt.y, pointId: p1Id }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      } else if (state.stage === 1 && state.startPt) {
        // Finish current line
        let p2Id = snap?.glyph === 'coincident' ? snap.targetId : undefined
        if (p2Id && p2Id === state.startPt.pointId) {
          // щелчок по точке, из которой линия уже идёт: нулевой длины не бывает
          return { state: nextState, sketch: s }
        }
        const closesOnExisting = !!p2Id
        if (!p2Id) {
          const res = addPoint(s, pt.x, pt.y)
          s = res.sketch
          p2Id = res.pointId
        }
        const lineRes = addLine(s, state.startPt.pointId!, p2Id, state.construction)
        s = lineRes.sketch

        // Add inferred constraints if any
        if (snap?.glyph === 'horizontal') {
          s.constraints.push({ id: newId('con'), kind: 'horizontal', refs: [lineRes.curveId] })
        } else if (snap?.glyph === 'vertical') {
          s.constraints.push({ id: newId('con'), kind: 'vertical', refs: [lineRes.curveId] })
        } else if (snap?.glyph === 'pointOnCurve' && snap.targetId) {
          s.constraints.push({ id: newId('con'), kind: 'pointOnLine', refs: [p2Id, snap.targetId] })
        }

        // Цепочка продолжается, пока линия не замкнулась на уже существующей точке
        nextState.stage = closesOnExisting ? 0 : 1
        nextState.startPt = closesOnExisting ? undefined : { x: pt.x, y: pt.y, pointId: p2Id }
        nextState.preview = undefined
        return {
          state: nextState,
          sketch: s,
          command: { label: 'Add Line' },
        }
      }
    } else if (state.tool === 'rect-2pt') {
      if (state.stage === 0) {
        nextState.stage = 1
        nextState.startPt = pt
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      } else if (state.stage === 1 && state.startPt) {
        const res = rectangleMacro(s, { p1: state.startPt, p2: pt })
        s = res.sketch
        nextState.stage = 0
        nextState.startPt = undefined
        nextState.preview = undefined
        nextState.tool = 'select' // фигура готова: следующий щелчок выбирает, а не рисует новую
        return {
          state: nextState,
          sketch: s,
          command: { label: 'Add Rectangle' },
        }
      }
    } else if (state.tool === 'rect-center') {
      if (state.stage === 0) {
        nextState.stage = 1
        nextState.startPt = pt
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      } else if (state.stage === 1 && state.startPt) {
        const dx = Math.abs(pt.x - state.startPt.x)
        const dy = Math.abs(pt.y - state.startPt.y)
        const p1 = { x: state.startPt.x - dx, y: state.startPt.y - dy }
        const p2 = { x: state.startPt.x + dx, y: state.startPt.y + dy }
        const res = rectangleMacro(s, { p1, p2 })
        s = res.sketch
        nextState.stage = 0
        nextState.startPt = undefined
        nextState.preview = undefined
        nextState.tool = 'select' // фигура готова: следующий щелчок выбирает, а не рисует новую
        return {
          state: nextState,
          sketch: s,
          command: { label: 'Add Center Rectangle' },
        }
      }
    } else if (state.tool === 'circle') {
      if (state.stage === 0) {
        let cId = snap?.glyph === 'coincident' ? snap.targetId : undefined
        if (!cId) {
          const res = addPoint(s, pt.x, pt.y)
          s = res.sketch
          cId = res.pointId
        }
        nextState.stage = 1
        nextState.startPt = { x: pt.x, y: pt.y, pointId: cId }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      } else if (state.stage === 1 && state.startPt) {
        const r = Math.max(0.1, Math.hypot(pt.x - state.startPt.x, pt.y - state.startPt.y))
        const res = addCircle(s, state.startPt.pointId!, r, state.construction)
        s = res.sketch
        nextState.stage = 0
        nextState.startPt = undefined
        nextState.preview = undefined
        nextState.tool = 'select' // фигура готова: следующий щелчок выбирает, а не рисует новую
        return {
          state: nextState,
          sketch: s,
          command: { label: 'Add Circle' },
        }
      }
    } else if (state.tool === 'slot') {
      if (state.stage === 0) {
        nextState.stage = 1
        nextState.startPt = pt
        return { state: nextState, sketch: s }
      } else if (state.stage === 1 && state.startPt) {
        nextState.stage = 2
        nextState.secondPt = pt
        return { state: nextState, sketch: s }
      } else if (state.stage === 2 && state.startPt && state.secondPt) {
        // Distance from pt to center line
        const dx = state.secondPt.x - state.startPt.x
        const dy = state.secondPt.y - state.startPt.y
        const len = Math.hypot(dx, dy) || 1
        const dist = Math.abs((pt.x - state.startPt.x) * -dy + (pt.y - state.startPt.y) * dx) / len
        const width = Math.max(0.5, dist * 2)
        const res = slotMacro(s, { p1: state.startPt, p2: state.secondPt, width })
        s = res.sketch
        nextState.stage = 0
        nextState.startPt = undefined
        nextState.secondPt = undefined
        nextState.tool = 'select' // фигура готова: следующий щелчок выбирает, а не рисует новую
        return {
          state: nextState,
          sketch: s,
          command: { label: 'Add Slot' },
        }
      }
    } else if (state.tool === 'polygon') {
      if (state.stage === 0) {
        nextState.stage = 1
        nextState.startPt = pt
        return { state: nextState, sketch: s }
      } else if (state.stage === 1 && state.startPt) {
        const r = Math.max(0.5, Math.hypot(pt.x - state.startPt.x, pt.y - state.startPt.y))
        const res = polygonMacro(s, { center: state.startPt, radius: r, sides: 6 })
        s = res.sketch
        nextState.stage = 0
        nextState.startPt = undefined
        nextState.tool = 'select' // фигура готова: следующий щелчок выбирает, а не рисует новую
        return {
          state: nextState,
          sketch: s,
          command: { label: 'Add Polygon' },
        }
      }
    } else if (state.tool === 'arc-3pt') {
      if (state.stage === 0) {
        nextState.stage = 1
        nextState.startPt = pt
        return { state: nextState, sketch: s }
      } else if (state.stage === 1 && state.startPt) {
        nextState.stage = 2
        nextState.secondPt = pt
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      } else if (state.stage === 2 && state.startPt && state.secondPt) {
        const arc = arcThrough(state.startPt, state.secondPt, pt)
        if (!arc) return { state: nextState, sketch: s } // три точки на одной прямой: дуги нет
        const res = addArc(s, arc.center, arc.a, arc.b, state.construction)
        s = res.sketch
        nextState.stage = 0
        nextState.startPt = undefined
        nextState.secondPt = undefined
        nextState.preview = undefined
        nextState.tool = 'select'
        return { state: nextState, sketch: s, command: { label: 'Add Arc' } }
      }
    } else if (state.tool === 'point') {
      const res = addPoint(s, pt.x, pt.y)
      s = res.sketch
      nextState.tool = 'select' // точка готова: следующий щелчок выбирает
      return { state: nextState, sketch: s, command: { label: 'Add Point' } }
    } else if (state.tool === 'arc-center') {
      // Щелчки: центр → начало (радиус и первый угол) → конец.
      if (state.stage === 0) {
        nextState.stage = 1
        nextState.startPt = pt
        return { state: nextState, sketch: s }
      } else if (state.stage === 1 && state.startPt) {
        const r = Math.max(0.1, Math.hypot(pt.x - state.startPt.x, pt.y - state.startPt.y))
        nextState.stage = 2
        nextState.hud = { ...state.hud, size: r, a1: angleFromCenterDeg(state.startPt, pt) }
        nextState.preview = undefined
        return { state: nextState, sketch: s }
      } else if (state.stage === 2 && state.startPt) {
        const r = Math.max(0.1, state.hud?.size ?? 1)
        const a1 = state.hud?.a1 ?? 0
        const a2 = angleFromCenterDeg(state.startPt, pt)
        const arcRes = centerArc(s, state.startPt, r, a1, a2, state.construction)
        s = arcRes.sketch
        nextState.stage = 0
        nextState.startPt = undefined
        nextState.hud = undefined
        nextState.preview = undefined
        nextState.tool = 'select'
        return { state: nextState, sketch: s, command: { label: 'Add Center Arc' } }
      }
    } else if (state.tool === 'dimension') {
      const target = snap?.targetId
      if (target && s.curves[target]) {
        // размер на отрезок, окружность или дугу: фиксирует текущее значение
        const dim = dimensionFor(s, target)
        if (dim) {
          s = { ...s, constraints: [...s.constraints, dim] }
          return { state: nextState, sketch: s, command: { label: 'Add Dimension' } }
        }
      } else if (snap?.glyph === 'coincident' && target && s.points[target]) {
        // два щелчка по точкам: расстояние между ними
        if (state.stage === 0) {
          nextState.stage = 1
          nextState.startPt = { x: pt.x, y: pt.y, pointId: target }
          return { state: nextState, sketch: s }
        }
        const firstId = state.startPt?.pointId
        if (state.stage === 1 && firstId && firstId !== target && s.points[firstId]) {
          const a = s.points[firstId]
          const b = s.points[target]
          s = {
            ...s,
            constraints: [
              ...s.constraints,
              { id: newId('con'), kind: 'distance', refs: [firstId, target], value: Math.hypot(b.x - a.x, b.y - a.y) },
            ],
          }
          nextState.stage = 0
          nextState.startPt = undefined
          return { state: nextState, sketch: s, command: { label: 'Add Dimension' } }
        }
      }
    } else if (state.tool === 'mirror') {
      // выбранные кривые отражаются относительно щёлкнутого отрезка
      const axisId = snap?.targetId
      const axis = axisId ? s.curves[axisId] : undefined
      if (axisId && axis?.kind === 'line' && state.selectedCurveIds.length > 0 && !state.selectedCurveIds.includes(axisId)) {
        const res = mirrorMacro(s, { curveIds: state.selectedCurveIds, axisLineId: axisId })
        s = res.sketch
        nextState.tool = 'select'
        nextState.selectedCurveIds = []
        nextState.selectedPointIds = []
        return { state: nextState, sketch: s, command: { label: 'Mirror' } }
      }
    } else if (state.tool === 'trim') {
      if (snap?.targetId && s.curves[snap.targetId]) {
        const res = trimMacro(s, { curveId: snap.targetId, clickPt: pt })
        if (res) {
          s = res.sketch
          return {
            state: nextState,
            sketch: s,
            command: { label: 'Trim' },
          }
        }
      }
    }
  }

  return { state: nextState, sketch: s }
}
