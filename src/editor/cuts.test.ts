import { describe, it, expect, beforeEach } from 'vitest'
import {
  createCutGroup,
  deleteCutGroup,
  updateCutGroup,
  migrateCuts,
  type CutGroup,
} from './cuts'
import { migrateScene } from './sceneStore'
import type { SceneDoc } from './scene'
import { generate } from '../geometry/model'
import { clearCutGroupCache, getCutGroupCacheHitCount, resetCutGroupCacheHitCount } from '../geometry/cut/groupEval'

beforeEach(() => {
  clearCutGroupCache()
  resetCutGroupCacheHitCount()
})

describe('Cut groups document and worker (Task 4.1)', () => {
  const initialDoc: SceneDoc = {
    schema: 1,
    objects: [
      {
        id: 'box-1',
        name: 'Bracket',
        visible: true,
        locked: false,
        color: 0,
        source: {
          kind: 'primitive',
          shape: 'box',
          params: { width: 40, depth: 20, height: 20 },
        },
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        stack: [],
      },
    ],
  }

  it('createCutGroup hides source and creates derived cutPart objects', () => {
    const group: CutGroup = {
      id: 'cut-1',
      name: 'Bracket Cut',
      sourceObjectId: 'box-1',
      type: 'plane',
      plane: {
        mode: 'both',
        plane: { kind: 'axis', axis: 'z', position: 10 },
      },
    }

    const doc = createCutGroup(initialDoc, group, ['A', 'B'])
    expect(doc.cuts).toHaveLength(1)
    expect(doc.cuts![0].id).toBe('cut-1')

    // Source object is now hidden
    const src = doc.objects.find((o) => o.id === 'box-1')
    expect(src).toBeDefined()
    expect(src!.visible).toBe(false)

    // Two derived parts created
    const parts = doc.objects.filter((o) => o.source.kind === 'cutPart')
    expect(parts).toHaveLength(2)
    expect(parts[0].name).toBe('Bracket A')
    expect(parts[1].name).toBe('Bracket B')
    expect((parts[0].source as any).groupId).toBe('cut-1')
    expect((parts[0].source as any).partIndex).toBe(0)
    expect((parts[1].source as any).partIndex).toBe(1)
  })

  it('deleting the group restores the source and removes derived parts', () => {
    const group: CutGroup = {
      id: 'cut-1',
      sourceObjectId: 'box-1',
      type: 'plane',
      plane: {
        mode: 'both',
        plane: { kind: 'axis', axis: 'z', position: 10 },
      },
    }

    const docWithCut = createCutGroup(initialDoc, group, ['A', 'B'])
    expect(docWithCut.objects).toHaveLength(3)

    const docRestored = deleteCutGroup(docWithCut, 'cut-1')
    expect(docRestored.cuts).toBeUndefined()
    expect(docRestored.objects).toHaveLength(1)

    const src = docRestored.objects[0]
    expect(src.id).toBe('box-1')
    expect(src.visible).toBe(true)
  })

  it('parts are rebuilt after reload and orphan groups/parts are dropped in normalisation', () => {
    const raw = {
      schema: 1,
      objects: [
        {
          id: 'box-1',
          name: 'Bracket',
          visible: false,
          locked: false,
          color: 0,
          source: { kind: 'primitive', shape: 'box', params: { width: 40, depth: 20, height: 20 } },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
        {
          id: 'part-A',
          name: 'Bracket A',
          visible: true,
          locked: false,
          color: 0,
          source: { kind: 'cutPart', groupId: 'cut-1', partIndex: 0, partLabel: 'A' },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
        {
          id: 'orphan-part',
          name: 'Orphan Part',
          visible: true,
          locked: false,
          color: 0,
          source: { kind: 'cutPart', groupId: 'non-existent-group', partIndex: 0 },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      ],
      cuts: [
        {
          id: 'cut-1',
          sourceObjectId: 'box-1',
          type: 'plane',
          plane: { mode: 'both', plane: { kind: 'axis', axis: 'z', position: 0 } },
        },
        {
          id: 'orphan-group',
          sourceObjectId: 'missing-source-object',
          type: 'plane',
        },
      ],
    }

    const migrated = migrateScene(raw)
    // Orphan group dropped
    expect(migrated.cuts).toHaveLength(1)
    expect(migrated.cuts![0].id).toBe('cut-1')

    // Orphan part dropped; box-1 and part-A remain
    expect(migrated.objects).toHaveLength(2)
    expect(migrated.objects.find((o) => o.id === 'orphan-part')).toBeUndefined()
    expect(migrated.objects.find((o) => o.id === 'part-A')).toBeDefined()
  })

  it('generate("editor") derives parts from groups and caches evaluation', async () => {
    const group: CutGroup = {
      id: 'cut-1',
      sourceObjectId: 'box-1',
      type: 'plane',
      plane: {
        mode: 'both',
        plane: { kind: 'axis', axis: 'z', position: 10 },
      },
    }

    const doc = createCutGroup(initialDoc, group, ['A', 'B'])

    // Initial evaluation: source box evaluated once, cut once, group result cached
    const res1 = await generate('editor', {
      objects: doc.objects as any,
      cuts: doc.cuts,
    })

    // Two parts generated (source box-1 is hidden)
    expect(res1.parts).toHaveLength(2)
    const partA = res1.parts.find((p) => p.label === doc.objects[1].id)
    const partB = res1.parts.find((p) => p.label === doc.objects[2].id)
    expect(partA).toBeDefined()
    expect(partB).toBeDefined()

    // Half of 40x20x20 box (volume 16,000) is 8,000
    expect(partA!.mesh.volume).toBeCloseTo(8000, 1)
    expect(partB!.mesh.volume).toBeCloseTo(8000, 1)

    // Repeated evaluation hits group cache!
    const hitsBefore = getCutGroupCacheHitCount()
    const res2 = await generate('editor', {
      objects: doc.objects as any,
      cuts: doc.cuts,
    })
    expect(res2.parts).toHaveLength(2)
    expect(getCutGroupCacheHitCount()).toBeGreaterThan(hitsBefore)

    // Editing source object (e.g. changing width to 60) updates parts
    const editedDoc: SceneDoc = {
      ...doc,
      objects: doc.objects.map((o) =>
        o.id === 'box-1'
          ? {
              ...o,
              source: { kind: 'primitive', shape: 'box', params: { width: 60, depth: 20, height: 20 } },
            }
          : o
      ),
    }

    const res3 = await generate('editor', {
      objects: editedDoc.objects as any,
      cuts: editedDoc.cuts,
    })
    // 60x20x20 box has volume 24,000; halves have volume 12,000
    const partA3 = res3.parts.find((p) => p.label === doc.objects[1].id)
    expect(partA3!.mesh.volume).toBeCloseTo(12000, 1)
  })
})
