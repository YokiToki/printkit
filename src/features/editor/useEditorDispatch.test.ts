// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { addObject, createEmptyScene, removeObjects, updateObject, type EditorObject } from '../../editor/scene'
import { addOp, updateOp, removeOp, toggleOp, moveOp, type Op } from '../../editor/stack'
import { combineObjects, releaseTool } from '../../geometry/features/ops/boolean'
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

  it('handles stack commands undo/redo and mergeKey typing (Task 4.4)', () => {
    vi.useFakeTimers()
    const initial = addObject(createEmptyScene(), {
      ...meshObj,
      stack: [
        {
          id: 'op-1',
          kind: 'offset',
          enabled: true,
          params: { distance: 0.2 },
        },
        {
          id: 'op-2',
          kind: 'mirror',
          enabled: true,
          params: { plane: 'XY', origin: 'object', merge: true },
        },
      ],
    })

    const { result } = renderHook(() => useEditorDispatch(initial))

    // 1. Add op
    const newOp: Op = {
      id: 'op-3',
      kind: 'hollow',
      enabled: true,
      params: { wall: 2 },
    }
    act(() => {
      result.current.dispatch('Add Hollow', (prev) => ({
        ...prev,
        objects: prev.objects.map((o) => (o.id === 'mesh-1' ? { ...o, stack: addOp(o.stack ?? [], newOp) } : o)),
      }))
    })
    expect(result.current.doc.objects[0].stack).toHaveLength(3)

    // Undo add op
    act(() => {
      result.current.undo()
    })
    expect(result.current.doc.objects[0].stack).toHaveLength(2)

    // Redo add op
    act(() => {
      result.current.redo()
    })
    expect(result.current.doc.objects[0].stack).toHaveLength(3)

    // 2. Typing edits with mergeKey
    act(() => {
      result.current.dispatch(
        'Edit Offset',
        (prev) => ({
          ...prev,
          objects: prev.objects.map((o) =>
            o.id === 'mesh-1' ? { ...o, stack: updateOp(o.stack ?? [], 'op-1', { params: { distance: 0.5 } }) } : o
          ),
        }),
        'offset-dist-op-1'
      )
    })
    act(() => {
      vi.advanceTimersByTime(150)
      result.current.dispatch(
        'Edit Offset',
        (prev) => ({
          ...prev,
          objects: prev.objects.map((o) =>
            o.id === 'mesh-1' ? { ...o, stack: updateOp(o.stack ?? [], 'op-1', { params: { distance: 0.8 } }) } : o
          ),
        }),
        'offset-dist-op-1'
      )
    })

    // Both typing events merged into 1 undo step!
    act(() => {
      result.current.undo()
    })
    // Reverts back to 0.2
    expect((result.current.doc.objects[0].stack![0] as any).params.distance).toBe(0.2)

    // 3. Reorder op
    act(() => {
      result.current.dispatch('Reorder', (prev) => ({
        ...prev,
        objects: prev.objects.map((o) =>
          o.id === 'mesh-1' ? { ...o, stack: moveOp(o.stack ?? [], 0, 1) } : o
        ),
      }))
    })
    expect(result.current.doc.objects[0].stack![0].id).toBe('op-2')
    act(() => {
      result.current.undo()
    })
    expect(result.current.doc.objects[0].stack![0].id).toBe('op-1')

    // 4. Combine and release tool
    const toolObj: EditorObject = {
      id: 'tool-1',
      name: 'Cylinder',
      visible: true,
      locked: false,
      color: 1,
      source: { kind: 'primitive', shape: 'cylinder', params: {} },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }
    act(() => {
      result.current.dispatch('Add Tool', (prev) => addObject(prev, toolObj))
    })
    act(() => {
      result.current.dispatch('Combine', (prev) => combineObjects(prev, 'mesh-1', ['tool-1'], 'subtract'))
    })
    // tool-1 is hidden and boolean op added to mesh-1
    expect(result.current.doc.objects.find((o) => o.id === 'tool-1')?.visible).toBe(false)
    const boolOp = result.current.doc.objects[0].stack?.find((op) => op.kind === 'boolean')
    expect(boolOp).toBeDefined()

    // Release tool
    act(() => {
      result.current.dispatch('Release tool', (prev) => releaseTool(prev, 'mesh-1', boolOp!.id, 'tool-1'))
    })
    expect(result.current.doc.objects.find((o) => o.id === 'tool-1')?.visible).toBe(true)

    // Undo release
    act(() => {
      result.current.undo()
    })
    expect(result.current.doc.objects.find((o) => o.id === 'tool-1')?.visible).toBe(false)

    vi.useRealTimers()
  })
})
