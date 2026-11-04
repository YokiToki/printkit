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
  selectedPointIds: string[]
  selectedCurveIds: string[]
  inferred?: SnapResult
  preview?: {
    points?: Record<string, { x: number; y: number }>
    curves?: Record<string, Curve>
  }
}

export interface ToolEvent {
  type: 'down' | 'move' | 'up' | 'key'
  pos?: { x: number; y: number }
  key?: string
  shift?: boolean
  ctrl?: boolean
  alt?: boolean
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

export interface StateMachineResult {
  state: ToolState
  sketch: Sketch
  command?: {
    label: string
    mergeKey?: string
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
      nextState.preview = undefined
      nextState.inferred = undefined
      return { state: nextState, sketch: s }
    }
    nextState.selectedPointIds = []
    nextState.selectedCurveIds = []
    nextState.preview = undefined
    return { state: nextState, sketch: s }
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

        // Chain next line
        nextState.stage = 1
        nextState.startPt = { x: pt.x, y: pt.y, pointId: p2Id }
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
        return {
          state: nextState,
          sketch: s,
          command: { label: 'Add Polygon' },
        }
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
