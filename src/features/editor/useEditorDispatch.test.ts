// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { addObject, createEmptyScene, removeObjects, updateObject, type EditorObject } from '../../editor/scene'
import { useEditorDispatch } from './useEditorDispatch'

describe('editor/useEditorDispatch', () => {
  const meshObj: EditorObject = {
    id: 'mesh-1',
    name: 'Bracket',
    visible: true,
    locked: false,
    color: 0,
    source: { kind: 'mesh', meshId: 'bracket-mesh-id', unit: 'mm' },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  }

  it('each command is undoable and redoable', () => {
    const initial = createEmptyScene()
    const { result } = renderHook(() => useEditorDispatch(initial))

    expect(result.current.canUndo).toBe(false)

    act(() => {
      result.current.dispatch('Add Bracket', (prev) => addObject(prev, meshObj))
    })

    expect(result.current.canUndo).toBe(true)
    expect(result.current.doc.objects).toHaveLength(1)

    act(() => {
      result.current.undo()
    })

    expect(result.current.doc.objects).toHaveLength(0)
    expect(result.current.canRedo).toBe(true)

    act(() => {
      result.current.redo()
    })

    expect(result.current.doc.objects).toHaveLength(1)
    expect(result.current.doc.objects[0].id).toBe('mesh-1')
  })

  it('merges continuous edits like gizmo drag or typing', () => {
    vi.useFakeTimers()
    const initial = addObject(createEmptyScene(), meshObj)
    const { result } = renderHook(() => useEditorDispatch(initial))

    act(() => {
      result.current.dispatch(
        'Move',
        (prev) => updateObject(prev, 'mesh-1', { transform: { ...meshObj.transform, position: [10, 0, 0] } }),
        'gizmo-drag'
      )
    })

    act(() => {
      vi.advanceTimersByTime(200)
      result.current.dispatch(
        'Move',
        (prev) => updateObject(prev, 'mesh-1', { transform: { ...meshObj.transform, position: [20, 0, 0] } }),
        'gizmo-drag'
      )
    })

    // Both drag events merged into 1 undo step!
    expect(result.current.history.getUndoCount()).toBe(1)

    act(() => {
      result.current.undo()
    })

    // Returns all the way back to initial position [0, 0, 0]
    expect(result.current.doc.objects[0].transform.position).toEqual([0, 0, 0])

    vi.useRealTimers()
  })

  it('clears redo stack when a new change is made', () => {
    const initial = addObject(createEmptyScene(), meshObj)
    const { result } = renderHook(() => useEditorDispatch(initial))

    act(() => {
      result.current.dispatch('Move', (prev) =>
        updateObject(prev, 'mesh-1', { transform: { ...meshObj.transform, position: [50, 0, 0] } })
      )
    })

    act(() => {
      result.current.undo()
    })
    expect(result.current.canRedo).toBe(true)

    act(() => {
      result.current.dispatch('Rename', (prev) =>
        updateObject(prev, 'mesh-1', { name: 'New Name' })
      )
    })
    expect(result.current.canRedo).toBe(false)
  })

  it('delete + undo restores the object with its mesh reference intact', () => {
    const initial = addObject(createEmptyScene(), meshObj)
    const { result } = renderHook(() => useEditorDispatch(initial))

    act(() => {
      result.current.dispatch('Delete', (prev) => removeObjects(prev, ['mesh-1']))
    })
    expect(result.current.doc.objects).toHaveLength(0)

    act(() => {
      result.current.undo()
    })
    expect(result.current.doc.objects).toHaveLength(1)
    const restored = result.current.doc.objects[0]
    expect(restored.id).toBe('mesh-1')
    expect(restored.source).toEqual(meshObj.source)
    expect((restored.source as { meshId: string }).meshId).toBe('bracket-mesh-id')
  })
})
