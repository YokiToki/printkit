import { describe, expect, it } from 'vitest'
import { History } from './history'

describe('editor/history', () => {
  it('manages undo and redo order', () => {
    const history = new History<number>()

    history.push('Step 1', 0, 1)
    history.push('Step 2', 1, 2)

    expect(history.canUndo()).toBe(true)
    expect(history.canRedo()).toBe(false)
    expect(history.currentUndoLabel()).toBe('Step 2')

    const u1 = history.undo()
    expect(u1).toEqual({ state: 1, label: 'Step 2' })
    expect(history.canRedo()).toBe(true)
    expect(history.currentRedoLabel()).toBe('Step 2')

    const u2 = history.undo()
    expect(u2).toEqual({ state: 0, label: 'Step 1' })
    expect(history.canUndo()).toBe(false)

    const r1 = history.redo()
    expect(r1).toEqual({ state: 1, label: 'Step 1' })

    const r2 = history.redo()
    expect(r2).toEqual({ state: 2, label: 'Step 2' })
    expect(history.canRedo()).toBe(false)
  })

  it('discards redo stack when a new push occurs', () => {
    const history = new History<string>()
    history.push('Add A', '', 'A')
    history.push('Add B', 'A', 'AB')

    history.undo()
    expect(history.canRedo()).toBe(true)

    history.push('Add C', 'A', 'AC')
    expect(history.canRedo()).toBe(false)
    expect(history.redo()).toBeNull()
  })

  it('merges continuous edits with the same mergeKey within mergeWindow', () => {
    const history = new History<string>({ mergeWindowMs: 800 })
    let time = 1000

    history.push('Type 1', '', '1', 'type-name', time)
    time += 300
    history.push('Type 2', '1', '12', 'type-name', time)
    time += 400
    history.push('Type 3', '12', '123', 'type-name', time)

    expect(history.getUndoCount()).toBe(1)
    const u = history.undo()
    // It should undo all continuous keystrokes back to the initial state
    expect(u).toEqual({ state: '', label: 'Type 3' })

    const r = history.redo()
    expect(r).toEqual({ state: '123', label: 'Type 3' })
  })

  it('does not merge if mergeKey differs or window expired', () => {
    const history = new History<string>({ mergeWindowMs: 800 })
    let time = 1000

    history.push('Type A', '', 'A', 'key-1', time)
    time += 200
    history.push('Type B', 'A', 'AB', 'key-2', time) // different key
    expect(history.getUndoCount()).toBe(2)

    time += 900 // window expired
    history.push('Type C', 'AB', 'ABC', 'key-2', time)
    expect(history.getUndoCount()).toBe(3)
  })

  it('enforces capacity limit', () => {
    const history = new History<number>({ capacity: 3 })
    history.push('1', 0, 1)
    history.push('2', 1, 2)
    history.push('3', 2, 3)
    history.push('4', 3, 4)

    expect(history.getUndoCount()).toBe(3)
    // Oldest (1) was shifted out, so 3 undos should take us down to 1
    expect(history.undo()?.state).toBe(3)
    expect(history.undo()?.state).toBe(2)
    expect(history.undo()?.state).toBe(1)
    expect(history.canUndo()).toBe(false)
  })

  it('clears history', () => {
    const history = new History<number>()
    history.push('1', 0, 1)
    history.undo()
    expect(history.canRedo()).toBe(true)

    history.clear()
    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(false)
  })
})
