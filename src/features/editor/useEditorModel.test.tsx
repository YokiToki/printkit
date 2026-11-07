// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { addObject, createEmptyScene, type EditorObject, type SceneDoc } from '../../editor/scene'
import type { ModelResult } from '../../geometry/model'
import { useEditorModel } from './useEditorModel'

describe('editor/useEditorModel', () => {
  const dummyMesh = {
    vertProperties: new Float32Array(),
    triVerts: new Uint32Array(),
    numProp: 3,
    min: [0, 0, 0] as [number, number, number],
    max: [10, 10, 10] as [number, number, number],
    volume: 1000,
  }

  const boxObj: EditorObject = {
    id: 'box-1',
    name: 'Box 1',
    visible: true,
    locked: false,
    color: 0,
    source: {
      kind: 'primitive',
      shape: 'box',
      params: { width: 10, depth: 10, height: 10 },
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  }

  it('moving an object does not start a model job, but changing parameter regenerates', async () => {
    vi.useFakeTimers()

    const generateMock = vi.fn().mockImplementation(async (_mode: string, params: { objects: { id: string }[] }) => {
      const result: ModelResult = {
        parts: params.objects.map((o) => ({
          label: o.id,
          col: 0,
          row: 0,
          oversize: false,
          mesh: dummyMesh,
        })),
      }
      return result
    })

    const initialDoc: SceneDoc = addObject(createEmptyScene(), boxObj)

    const { result, rerender } = renderHook(
      ({ doc }) => useEditorModel(doc, { client: { generate: generateMock }, debounce: 0 }),
      { initialProps: { doc: initialDoc } }
    )

    // Initial trigger
    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(result.current.partsById.has('box-1')).toBe(true)

    // 1. Move the object (transform.position changed)
    const movedDoc: SceneDoc = {
      ...initialDoc,
      objects: [
        {
          ...boxObj,
          transform: {
            ...boxObj.transform,
            position: [100, 200, 300],
          },
        },
      ],
    }

    rerender({ doc: movedDoc })

    await act(async () => {
      vi.advanceTimersByTime(50)
    })

    // Moving MUST NOT start another generate call!
    expect(generateMock).toHaveBeenCalledTimes(1)

    // 2. Change primitive parameter (width 10 -> 20)
    const changedDoc: SceneDoc = {
      ...initialDoc,
      objects: [
        {
          ...boxObj,
          source: {
            kind: 'primitive',
            shape: 'box',
            params: { width: 20, depth: 10, height: 10 },
          },
        },
      ],
    }

    rerender({ doc: changedDoc })

    await act(async () => {
      vi.advanceTimersByTime(50)
    })

    // Changing primitive parameter MUST trigger generate
    expect(generateMock).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('passes doc.cuts to generate parameters and regenerates when cuts change', async () => {
    vi.useFakeTimers()

    const generateMock = vi.fn().mockImplementation(async (_mode: string, params: any) => {
      return {
        parts: (params.cuts?.length ?? 0) > 0
          ? [
              { label: 'box-1 A', col: 0, row: 0, oversize: false, mesh: dummyMesh },
              { label: 'box-1 B', col: 1, row: 0, oversize: false, mesh: dummyMesh },
            ]
          : [{ label: 'box-1', col: 0, row: 0, oversize: false, mesh: dummyMesh }],
      }
    })

    const initialDoc: SceneDoc = addObject(createEmptyScene(), boxObj)

    const { result, rerender } = renderHook(
      ({ doc }) => useEditorModel(doc, { client: { generate: generateMock }, debounce: 0 }),
      { initialProps: { doc: initialDoc } }
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(generateMock.mock.calls[0][1].cuts).toBeUndefined()
    expect(result.current.partsById.has('box-1')).toBe(true)

    // Add cut group to doc
    const cutDoc: SceneDoc = {
      ...initialDoc,
      cuts: [
        {
          id: 'cg-1',
          sourceObjectId: 'box-1',
          type: 'plane',
          plane: {
            plane: { kind: 'axis', axis: 'z', position: 5 },
            mode: 'both',
          },
        },
      ],
    }

    rerender({ doc: cutDoc })

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(generateMock.mock.calls[1][1].cuts).toEqual(cutDoc.cuts)
    expect(result.current.partsById.has('box-1 A')).toBe(true)
    expect(result.current.partsById.has('box-1 B')).toBe(true)

    vi.useRealTimers()
  })
})
