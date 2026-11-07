import { describe, expect, it } from 'vitest'
import { createEmptyScene, type EditorObject, type SceneDoc } from '../../editor/scene'
import { type MeshData } from '../../geometry/mesh'
import { editorParts } from './editorParts'

const makeDoc = (objects: EditorObject[]): SceneDoc => ({
  ...createEmptyScene(),
  objects,
})

function createTestBox(w = 10, d = 10, h = 10): MeshData {
  const halfW = w / 2, halfD = d / 2
  const vertProperties = new Float32Array([
    -halfW, -halfD, 0,
    halfW, -halfD, 0,
    halfW, halfD, 0,
    -halfW, halfD, 0,
    -halfW, -halfD, h,
    halfW, -halfD, h,
    halfW, halfD, h,
    -halfW, halfD, h,
  ])
  const triVerts = new Uint32Array([
    0, 2, 1, 0, 3, 2, // bottom
    4, 5, 6, 4, 6, 7, // top
    0, 1, 5, 0, 5, 4, // front
    2, 3, 7, 2, 7, 6, // back
    3, 0, 4, 3, 4, 7, // left
    1, 2, 6, 1, 6, 5, // right
  ])
  return {
    vertProperties,
    triVerts,
    numProp: 3,
    min: [-halfW, -halfD, 0],
    max: [halfW, halfD, h],
    volume: w * d * h,
  }
}

function createOpenMesh(): MeshData {
  // A single triangle (open surface)
  const vertProperties = new Float32Array([
    0, 0, 0,
    10, 0, 0,
    0, 10, 0,
  ])
  const triVerts = new Uint32Array([0, 1, 2])
  return {
    vertProperties,
    triVerts,
    numProp: 3,
    min: [0, 0, 0],
    max: [10, 10, 0],
    volume: 0,
  }
}

describe('editorParts', () => {
  it('applies matrices accurately for position, rotation and scale, matching bbox and volume', () => {
    const box = createTestBox(10, 10, 10) // 10x10x10 cube, vol = 1000
    const obj: EditorObject = {
      id: 'b1',
      name: 'Cube',
      visible: true,
      locked: false,
      color: 0,
      source: { kind: 'primitive', shape: 'box', params: { width: 10, depth: 10, height: 10 } },
      transform: {
        position: [20, 30, 5],
        rotation: [0, 0, 0],
        scale: [2, 3, 4],
      },
    }
    const doc = makeDoc([obj])
    const meshes = new Map<string, MeshData>([['b1', box]])

    const parts = editorParts(doc, meshes)
    expect(parts).toHaveLength(1)
    expect(parts[0].label).toBe('Cube')

    const pMesh = parts[0].mesh
    // Expected bounds: original X in [-5, 5] * 2 + 20 => [10, 30]
    // original Y in [-5, 5] * 3 + 30 => [15, 45]
    // original Z in [0, 10] * 4 + 5 => [5, 45]
    expect(pMesh.min[0]).toBeCloseTo(10)
    expect(pMesh.max[0]).toBeCloseTo(30)
    expect(pMesh.min[1]).toBeCloseTo(15)
    expect(pMesh.max[1]).toBeCloseTo(45)
    expect(pMesh.min[2]).toBeCloseTo(5)
    expect(pMesh.max[2]).toBeCloseTo(45)

    // Expected volume: 1000 * (2 * 3 * 4) = 24000
    expect(pMesh.volume).toBeCloseTo(24000)
  })

  it('filters by selection when selectionOnly is true', () => {
    const box1 = createTestBox(10, 10, 10)
    const box2 = createTestBox(20, 20, 20)
    const o1: EditorObject = {
      id: 'obj-1',
      name: 'Box 1',
      visible: true,
      locked: false,
      color: 0,
      source: { kind: 'primitive', shape: 'box', params: {} },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }
    const o2: EditorObject = {
      id: 'obj-2',
      name: 'Box 2',
      visible: true,
      locked: false,
      color: 1,
      source: { kind: 'primitive', shape: 'box', params: {} },
      transform: { position: [50, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }
    const doc = makeDoc([o1, o2])
    const meshes = new Map<string, MeshData>([
      ['obj-1', box1],
      ['obj-2', box2],
    ])

    const allParts = editorParts(doc, meshes, { selectionOnly: false })
    expect(allParts).toHaveLength(2)

    const selectedParts = editorParts(doc, meshes, { selectionOnly: true, selection: ['obj-2'] })
    expect(selectedParts).toHaveLength(1)
    expect(selectedParts[0].label).toBe('Box 2')
    expect(selectedParts[0].mesh.min[0]).toBeCloseTo(40) // 50 - 10
  })

  it('excludes invisible objects when selectionOnly is false', () => {
    const box = createTestBox()
    const o1: EditorObject = {
      id: 'o1',
      name: 'Visible',
      visible: true,
      locked: false,
      color: 0,
      source: { kind: 'primitive', shape: 'box', params: {} },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }
    const o2: EditorObject = {
      id: 'o2',
      name: 'Hidden',
      visible: false,
      locked: false,
      color: 0,
      source: { kind: 'primitive', shape: 'box', params: {} },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }
    const doc = makeDoc([o1, o2])
    const meshes = { o1: box, o2: box }

    const parts = editorParts(doc, meshes)
    expect(parts).toHaveLength(1)
    expect(parts[0].label).toBe('Visible')
  })

  it('exports open mesh without failure', () => {
    const openMesh = createOpenMesh()
    const obj: EditorObject = {
      id: 'open1',
      name: 'Surface',
      visible: true,
      locked: false,
      color: 0,
      source: { kind: 'primitive', shape: 'box', params: {} },
      transform: { position: [10, 20, 30], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }
    const doc = makeDoc([obj])
    const parts = editorParts(doc, { open1: openMesh })

    expect(parts).toHaveLength(1)
    expect(parts[0].label).toBe('Surface')
    expect(parts[0].mesh.min[0]).toBeCloseTo(10)
    expect(parts[0].mesh.min[1]).toBeCloseTo(20)
    expect(parts[0].mesh.min[2]).toBeCloseTo(30)
  })

  it('guarantees unique labels when objects share names', () => {
    const box = createTestBox()
    const doc = makeDoc([
      {
        id: '1',
        name: 'Bracket',
        visible: true,
        locked: false,
        color: 0,
        source: { kind: 'primitive', shape: 'box', params: {} },
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      {
        id: '2',
        name: 'Bracket',
        visible: true,
        locked: false,
        color: 0,
        source: { kind: 'primitive', shape: 'box', params: {} },
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      {
        id: '3',
        name: 'Bracket',
        visible: true,
        locked: false,
        color: 0,
        source: { kind: 'primitive', shape: 'box', params: {} },
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      {
        id: '4',
        name: 'Bracket 2',
        visible: true,
        locked: false,
        color: 0,
        source: { kind: 'primitive', shape: 'box', params: {} },
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    ])
    const meshes = { '1': box, '2': box, '3': box, '4': box }
    const parts = editorParts(doc, meshes)

    expect(parts).toHaveLength(4)
    const labels = parts.map((p) => p.label)
    expect(labels).toEqual(['Bracket', 'Bracket 2', 'Bracket 3', 'Bracket 2 2'])
    expect(new Set(labels).size).toBe(4)
  })

  it('skips tool objects unless explicitly selected with selectionOnly', () => {
    const box = createTestBox()
    const doc: SceneDoc = {
      schema: 1,
      objects: [
        {
          id: 'target',
          name: 'Target',
          visible: true,
          locked: false,
          color: 0,
          source: { kind: 'primitive', shape: 'box', params: {} },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          stack: [
            {
              id: 'bool-1',
              kind: 'boolean',
              enabled: true,
              params: { mode: 'subtract', tools: ['tool-cyl'] },
            },
          ],
        },
        {
          id: 'tool-cyl',
          name: 'Tool Cylinder',
          visible: true,
          locked: false,
          color: 1,
          source: { kind: 'primitive', shape: 'cylinder', params: {} },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      ],
    }

    const meshes = { target: box, 'tool-cyl': box }

    // When exporting visible objects: tool-cyl is skipped!
    const partsAll = editorParts(doc, meshes, { selectionOnly: false })
    expect(partsAll).toHaveLength(1)
    expect(partsAll[0].label).toBe('Target')

    // When explicitly selecting tool-cyl with selectionOnly: tool-cyl is exported!
    const partsSel = editorParts(doc, meshes, { selectionOnly: true, selection: ['tool-cyl'] })
    expect(partsSel).toHaveLength(1)
    expect(partsSel[0].label).toBe('Tool Cylinder')
  })

  it('exports derived cut parts with unique names and loose pins as parts (Task 4.2)', () => {
    const box = createTestBox()
    const pin = createTestBox(2, 2, 10)

    const doc: SceneDoc = {
      ...createEmptyScene(),
      objects: [
        {
          id: 'source-1',
          name: 'Bracket',
          visible: false, // hidden source
          locked: false,
          color: 0,
          source: { kind: 'primitive', shape: 'box', params: {} },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
        {
          id: 'part-1',
          name: 'Bracket A',
          visible: true,
          locked: false,
          color: 0,
          source: { kind: 'cutPart', groupId: 'cut-1', partIndex: 0, partLabel: 'A' },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
        {
          id: 'part-2',
          name: 'Bracket B',
          visible: true,
          locked: false,
          color: 0,
          source: { kind: 'cutPart', groupId: 'cut-1', partIndex: 1, partLabel: 'B' },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
        {
          id: 'part-3',
          name: 'Bracket A', // duplicate name
          visible: true,
          locked: false,
          color: 0,
          source: { kind: 'cutPart', groupId: 'cut-2', partIndex: 0, partLabel: 'A' },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      ],
      cuts: [
        {
          id: 'cut-1',
          name: 'Bracket',
          sourceObjectId: 'source-1',
          type: 'plane',
          includePins: true,
        },
      ],
    }

    const meshes = {
      'source-1': box,
      'part-1': box,
      'part-2': box,
      'part-3': box,
      'cut-1:pin:0': pin,
      'cut-1:pin:1': pin,
    }

    // Default export includes derived parts with unique names and loose pins
    const parts = editorParts(doc, meshes)
    expect(parts.map((p) => p.label)).toEqual([
      'Bracket A',
      'Bracket B',
      'Bracket A 2', // disambiguated
      'Bracket Pin 1',
      'Bracket Pin 2',
    ])

    // With includePins: false, loose pins are skipped
    const partsNoPins = editorParts(doc, meshes, { includePins: false })
    expect(partsNoPins.map((p) => p.label)).toEqual([
      'Bracket A',
      'Bracket B',
      'Bracket A 2',
    ])
  })
})
