// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from '../app/activityLog'
import { openMeshStore } from '../features/cutout/meshStore'
import {
  addObject,
  createEmptyScene,
  type EditorObject,
  type SceneDoc,
} from './scene'
import {
  gcMeshes,
  loadPersistedScene,
  migrateScene,
  savePersistedScene,
  SCENE_STORAGE_KEY,
} from './sceneStore'

describe('editor/sceneStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  const sampleObj: EditorObject = {
    id: 'box-1',
    name: 'Sample Box',
    visible: true,
    locked: false,
    color: 2,
    source: {
      kind: 'primitive',
      shape: 'box',
      params: { width: 40, depth: 20, height: 10 },
    },
    transform: {
      position: [1, 2, 3],
      rotation: [10, 20, 30],
      scale: [1, 1, 1],
    },
  }

  it('round-trips a valid scene through localStorage', () => {
    let doc = createEmptyScene()
    doc = addObject(doc, sampleObj)

    savePersistedScene(doc, 'test.scene')
    const loaded = loadPersistedScene('test.scene')

    expect(loaded.schema).toBe(1)
    expect(loaded.objects).toHaveLength(1)
    expect(loaded.objects[0]).toEqual(sampleObj)
  })

  it('handles corrupt JSON by returning empty scene without throwing', () => {
    localStorage.setItem(SCENE_STORAGE_KEY, '{ invalid json...')
    const loaded = loadPersistedScene()
    expect(loaded).toEqual(createEmptyScene())

    // Also null, string, array
    expect(migrateScene(null)).toEqual(createEmptyScene())
    expect(migrateScene('hello')).toEqual(createEmptyScene())
    expect(migrateScene([1, 2, 3])).toEqual(createEmptyScene())
  })

  it('drops unknown source kind and logs a warning', () => {
    const warnSpy = vi.spyOn(log, 'warn')

    const raw = {
      schema: 1,
      objects: [
        {
          id: 'bad-1',
          name: 'Unknown Object',
          source: { kind: 'unknown_kind', data: 123 },
        },
        sampleObj,
      ],
    }

    const migrated = migrateScene(raw)
    expect(migrated.objects).toHaveLength(1)
    expect(migrated.objects[0].id).toBe('box-1')
    expect(warnSpy).toHaveBeenCalledWith('storage', 'log.editor.unknownSource', {
      name: 'Unknown Object',
    })
  })

  it('provides defaults for missing numbers in transform and primitive params', () => {
    const raw = {
      schema: 1,
      objects: [
        {
          name: 'Incomplete Primitive',
          source: {
            kind: 'primitive',
            shape: 'cylinder',
            params: {}, // missing diameter and height
          },
          transform: {
            position: ['bad', 10], // missing / invalid z
            // rotation missing entirely
            // scale missing entirely
          },
        },
      ],
    }

    const migrated = migrateScene(raw)
    expect(migrated.objects).toHaveLength(1)
    const obj = migrated.objects[0]
    expect(obj.name).toBe('Incomplete Primitive')
    expect(obj.visible).toBe(true)
    expect(obj.locked).toBe(false)
    expect(obj.color).toBe(0)

    // Position gets defaults: [0, 10, 0]
    expect(obj.transform.position).toEqual([0, 10, 0])
    // Rotation default: [0, 0, 0]
    expect(obj.transform.rotation).toEqual([0, 0, 0])
    // Scale default: [1, 1, 1]
    expect(obj.transform.scale).toEqual([1, 1, 1])

    // Cylinder default diameter and height: 20
    if (obj.source.kind === 'primitive') {
      expect(obj.source.params.diameter).toBe(20)
      expect(obj.source.params.height).toBe(20)
    }
  })

  it('garbage collects unused meshes in meshStore', async () => {
    const store = await openMeshStore(null) // in-memory store
    const dummyMesh = {
      vertProperties: new Float32Array(),
      triVerts: new Uint32Array(),
    }

    await store.save('mesh-keep', dummyMesh)
    await store.save('mesh-unused-1', dummyMesh)
    await store.save('mesh-unused-2', dummyMesh)

    const doc: SceneDoc = {
      schema: 1,
      objects: [
        {
          id: 'obj-1',
          name: 'Kept Mesh',
          visible: true,
          locked: false,
          color: 0,
          source: { kind: 'mesh', meshId: 'mesh-keep', unit: 'mm' },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      ],
    }

    await gcMeshes(doc, store)

    expect(await store.load('mesh-keep')).toBeDefined()
    expect(await store.load('mesh-unused-1')).toBeUndefined()
    expect(await store.load('mesh-unused-2')).toBeUndefined()
  })
})
