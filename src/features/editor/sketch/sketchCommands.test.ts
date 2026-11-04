import { describe, it, expect, vi } from 'vitest'
import { createEmptyScene } from '../../../editor/scene'
import { History } from '../../../editor/history'
import { addLine } from '../../../editor/sketch/model'
import {
  addSketchCommand,
  updateDimensionCommand,
  dragPointCommand,
  renameSketchCommand,
  deleteSketchCommand,
} from './sketchCommands'

describe('5.4 Sketch commands and undo/redo history', () => {
  it('each command is undoable, drag and typed values merge, undo restores positions without solving', () => {
    let doc = createEmptyScene()
    const history = new History<typeof doc>()

    const dispatch = (label: string, next: typeof doc, mergeKey?: string) => {
      history.push(label, doc, next, mergeKey)
      doc = next
    }

    // 1. Add Sketch
    const addRes = addSketchCommand(doc, 'Sketch 1', { base: 'XY', offset: 0 })
    dispatch('Add Sketch', addRes.doc)
    const sketchId = addRes.sketchId
    expect(doc.sketches?.length).toBe(1)
    expect(history.canUndo()).toBe(true)

    // Add a line with distance constraint and fixed origin
    let currentSketch = doc.sketches![0]
    const lineRes = addLine(currentSketch, { x: 0, y: 0 }, { x: 20, y: 0 })
    currentSketch = lineRes.sketch
    currentSketch.points[lineRes.p1Id].fixed = true
    currentSketch.constraints.push({
      id: 'dist-con',
      kind: 'distance',
      refs: [lineRes.p1Id, lineRes.p2Id],
      value: 20,
    })
    doc = {
      ...doc,
      sketches: [currentSketch],
    }

    // 2. Type dimension value (40)
    const dim1Doc = updateDimensionCommand(doc, sketchId, 'dist-con', 40)
    dispatch('Set Dimension', dim1Doc, 'dim-type')
    expect(doc.sketches![0].points[lineRes.p2Id].x).toBeCloseTo(40, 1)

    // Type dimension value again (50) with the same mergeKey
    const dim2Doc = updateDimensionCommand(doc, sketchId, 'dist-con', 50)
    dispatch('Set Dimension', dim2Doc, 'dim-type')
    expect(doc.sketches![0].points[lineRes.p2Id].x).toBeCloseTo(50, 1)

    // 3. Drag point (mergeKey: drag-sketch)
    const drag1Doc = dragPointCommand(doc, sketchId, lineRes.p2Id, { x: 55, y: 0 })
    dispatch('Drag Point', drag1Doc, 'drag-sketch')

    const drag2Doc = dragPointCommand(doc, sketchId, lineRes.p2Id, { x: 60, y: 0 })
    dispatch('Drag Point', drag2Doc, 'drag-sketch')

    // Undo drag: should jump back before both drags because they merged!
    const undoDrag = history.undo()
    expect(undoDrag).not.toBeNull()
    doc = undoDrag!.state
    expect(doc.sketches![0].points[lineRes.p2Id].x).toBeCloseTo(50, 1)

    // Undo dimension: should jump back to 20 because dim-type calls merged!
    const undoDim = history.undo()
    expect(undoDim).not.toBeNull()
    doc = undoDim!.state
    expect(doc.sketches![0].points[lineRes.p2Id].x).toBeCloseTo(20, 1)

    // Redo dimension: goes back to 50
    const redoDim = history.redo()
    expect(redoDim).not.toBeNull()
    doc = redoDim!.state
    expect(doc.sketches![0].points[lineRes.p2Id].x).toBeCloseTo(50, 1)

    // New action clears redo stack
    const renameDoc = renameSketchCommand(doc, sketchId, 'RenamedSketch')
    dispatch('Rename Sketch', renameDoc)
    expect(history.canRedo()).toBe(false)
    expect(doc.sketches![0].name).toBe('RenamedSketch')
  })
})
