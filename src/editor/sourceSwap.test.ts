import { describe, it, expect } from 'vitest'
import { openMeshStore } from '../features/cutout/meshStore'
import { gcMeshes, migrateScene, type SceneDoc } from './sceneStore'
import { History } from './history'
import { hashMesh } from '../features/editor/importFiles'
import { boxSoup } from '../geometry/stl-fixtures'
import { weld } from '../geometry/mesh/weld'

describe('4.2 Source swap, undo/redo, originMeshId and GC', () => {
  it('swaps source meshId on repair, tracks originMeshId, supports undo/redo, and GC preserves both', async () => {
    const store = await openMeshStore(null) // in-memory store
    const history = new History<SceneDoc>()

    const rawBox = boxSoup(10, 10, 10)
    const initialMesh = weld(rawBox).mesh
    const initialId = hashMesh(initialMesh)
    await store.save(initialId, initialMesh)

    // Initial scene with imported mesh
    let doc: SceneDoc = {
      schema: 1,
      objects: [
        {
          id: 'obj-1',
          name: 'Box',
          visible: true,
          locked: false,
          color: 0,
          source: { kind: 'mesh', meshId: initialId, unit: 'mm' },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      ],
    }

    // Also add an unreferenced mesh in store to test GC
    await store.save('unreferenced-junk', initialMesh)

    // Apply repair: generates repaired mesh
    const repairedBox = boxSoup(12, 12, 12)
    const repairedMesh = weld(repairedBox).mesh
    const repairedId = hashMesh(repairedMesh)
    await store.save(repairedId, repairedMesh)

    // Source swap
    const nextDoc: SceneDoc = {
      ...doc,
      objects: doc.objects.map((obj) => {
        if (obj.id === 'obj-1' && obj.source.kind === 'mesh') {
          return {
            ...obj,
            source: {
              ...obj.source,
              meshId: repairedId,
              originMeshId: obj.source.originMeshId ?? obj.source.meshId,
            },
          }
        }
        return obj
      }),
    }

    history.push('Repair', doc, nextDoc)
    doc = nextDoc

    const repairedObj = doc.objects[0]
    expect(repairedObj.source.kind).toBe('mesh')
    if (repairedObj.source.kind === 'mesh') {
      expect(repairedObj.source.meshId).toBe(repairedId)
      expect(repairedObj.source.originMeshId).toBe(initialId)
    }

    // GC: both repairedId and originMeshId (initialId) must be kept! unreferenced-junk removed
    await gcMeshes(doc, store)
    const keysAfterGC = await store.keys()
    expect(keysAfterGC).toContain(repairedId)
    expect(keysAfterGC).toContain(initialId)
    expect(keysAfterGC).not.toContain('unreferenced-junk')

    // Undo: restores initial meshId
    const undoStep = history.undo()
    expect(undoStep).not.toBeNull()
    doc = undoStep!.state
    expect((doc.objects[0].source as any).meshId).toBe(initialId)

    // Redo: restores repaired meshId
    const redoStep = history.redo()
    expect(redoStep).not.toBeNull()
    doc = redoStep!.state
    expect((doc.objects[0].source as any).meshId).toBe(repairedId)

    // Revert to imported: resets meshId to originMeshId
    const revertedDoc: SceneDoc = {
      ...doc,
      objects: doc.objects.map((obj) => {
        if (obj.id === 'obj-1' && obj.source.kind === 'mesh' && obj.source.originMeshId) {
          return {
            ...obj,
            source: {
              ...obj.source,
              meshId: obj.source.originMeshId,
            },
          }
        }
        return obj
      }),
    }
    history.push('Revert to imported', doc, revertedDoc)
    doc = revertedDoc
    expect((doc.objects[0].source as any).meshId).toBe(initialId)

    // Simulate page reload: migrateScene preserves originMeshId
    const serialized = JSON.stringify(nextDoc)
    const reloaded = migrateScene(JSON.parse(serialized))
    const reloadedObj = reloaded.objects[0]
    expect((reloadedObj.source as any).originMeshId).toBe(initialId)
  })
})
