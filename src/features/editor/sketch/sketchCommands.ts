import type { SceneDoc } from '../../../editor/scene'
import {
  type Sketch,
  type PlaneDefinition,
  type Constraint,
  createSketch,
  removeCurve,
} from '../../../editor/sketch/model'
import { solve } from '../../../editor/sketch/solver'

export function addSketchCommand(
  doc: SceneDoc,
  name: string,
  plane: PlaneDefinition,
): { doc: SceneDoc; sketchId: string } {
  const sketch = createSketch(name, plane)
  return {
    doc: {
      ...doc,
      sketches: [...(doc.sketches ?? []), sketch],
    },
    sketchId: sketch.id,
  }
}

export function updateSketchInDoc(
  doc: SceneDoc,
  sketchId: string,
  updater: (prev: Sketch) => Sketch,
): SceneDoc {
  if (!doc.sketches) return doc
  return {
    ...doc,
    sketches: doc.sketches.map((s) => (s.id === sketchId ? updater(s) : s)),
  }
}

export function deleteSketchCommand(doc: SceneDoc, sketchId: string): SceneDoc {
  if (!doc.sketches) return doc
  return {
    ...doc,
    sketches: doc.sketches.filter((s) => s.id !== sketchId),
  }
}

export function renameSketchCommand(doc: SceneDoc, sketchId: string, name: string): SceneDoc {
  return updateSketchInDoc(doc, sketchId, (s) => ({ ...s, name }))
}

export function toggleSketchVisibleCommand(doc: SceneDoc, sketchId: string): SceneDoc {
  return updateSketchInDoc(doc, sketchId, (s) => ({ ...s, visible: !s.visible }))
}

export function updateDimensionCommand(
  doc: SceneDoc,
  sketchId: string,
  constraintId: string,
  value: number,
): SceneDoc {
  return updateSketchInDoc(doc, sketchId, (s) => {
    const updatedConstraints = s.constraints.map((c) =>
      c.id === constraintId ? { ...c, value } : c,
    )
    const sketchWithNewVal = { ...s, constraints: updatedConstraints }
    const solveRes = solve(sketchWithNewVal)
    if (solveRes.ok) {
      const updatedPoints = { ...s.points }
      for (const [id, pos] of Object.entries(solveRes.positions)) {
        if (updatedPoints[id]) {
          updatedPoints[id] = { ...updatedPoints[id], x: pos.x, y: pos.y }
        }
      }
      return { ...sketchWithNewVal, points: updatedPoints }
    }
    return sketchWithNewVal
  })
}

export function dragPointCommand(
  doc: SceneDoc,
  sketchId: string,
  pointId: string,
  targetPos: { x: number; y: number },
): SceneDoc {
  return updateSketchInDoc(doc, sketchId, (s) => {
    if (!s.points[pointId]) return s
    const solveRes = solve(s, {
      drag: { pointId, x: targetPos.x, y: targetPos.y },
    })
    const updatedPoints = { ...s.points }
    if (solveRes.ok) {
      for (const [id, pos] of Object.entries(solveRes.positions)) {
        if (updatedPoints[id]) {
          updatedPoints[id] = { ...updatedPoints[id], x: pos.x, y: pos.y }
        }
      }
    } else {
      updatedPoints[pointId] = { ...updatedPoints[pointId], x: targetPos.x, y: targetPos.y }
    }
    return { ...s, points: updatedPoints }
  })
}

export function deleteConstraintCommand(
  doc: SceneDoc,
  sketchId: string,
  constraintId: string,
): SceneDoc {
  return updateSketchInDoc(doc, sketchId, (s) => ({
    ...s,
    constraints: s.constraints.filter((c) => c.id !== constraintId),
  }))
}

export function deleteSelectionCommand(
  doc: SceneDoc,
  sketchId: string,
  curveIds: string[],
  pointIds: string[],
): SceneDoc {
  return updateSketchInDoc(doc, sketchId, (s) => {
    let nextSketch = s
    for (const cId of curveIds) {
      nextSketch = removeCurve(nextSketch, cId)
    }
    // Also delete any isolated points selected
    if (pointIds.length > 0) {
      const newPts = { ...nextSketch.points }
      for (const pId of pointIds) {
        delete newPts[pId]
      }
      const newCons = nextSketch.constraints.filter((c) => !c.refs.some((r) => pointIds.includes(r)))
      nextSketch = { ...nextSketch, points: newPts, constraints: newCons }
    }
    return nextSketch
  })
}
