import { describe, expect, it } from 'vitest'
import {
  addObject,
  createEmptyScene,
  DEFAULT_TRANSFORM,
  duplicateObject,
  matrixOf,
  newName,
  removeObjects,
  reorderObjects,
  updateObject,
  type EditorObject,
} from './scene'

describe('editor/scene', () => {
  describe('matrixOf', () => {
    it('returns identity matrix for default transform', () => {
      const m = matrixOf(DEFAULT_TRANSFORM)
      expect(m).toEqual([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ])
    })

    it('computes translation matrix', () => {
      const m = matrixOf({
        position: [10, -20, 30],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      })
      expect(m[12]).toBe(10)
      expect(m[13]).toBe(-20)
      expect(m[14]).toBe(30)
      expect(m[15]).toBe(1)
    })

    it('computes scale matrix', () => {
      const m = matrixOf({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 3, 4],
      })
      expect(m[0]).toBe(2)
      expect(m[5]).toBe(3)
      expect(m[10]).toBe(4)
      expect(m[15]).toBe(1)
    })

    it('computes 90-deg Z rotation matrix', () => {
      const m = matrixOf({
        position: [0, 0, 0],
        rotation: [0, 0, 90],
        scale: [1, 1, 1],
      })
      // cos(90) ~= 0, sin(90) ~= 1
      expect(m[0]).toBeCloseTo(0)
      expect(m[1]).toBeCloseTo(1)
      expect(m[4]).toBeCloseTo(-1)
      expect(m[5]).toBeCloseTo(0)
    })

    it('follows T * R * S composition order', () => {
      // Point (1, 0, 0)
      // Scale by 2 -> (2, 0, 0)
      // Rotate 90 deg about Z -> (0, 2, 0)
      // Translate by (5, 10, 0) -> (5, 12, 0)
      const m = matrixOf({
        position: [5, 10, 0],
        rotation: [0, 0, 90],
        scale: [2, 1, 1],
      })

      // p' = M * [1, 0, 0, 1]^T
      // col 0 + col 3
      const x = m[0] * 1 + m[12] * 1
      const y = m[1] * 1 + m[13] * 1
      const z = m[2] * 1 + m[14] * 1

      expect(x).toBeCloseTo(5)
      expect(y).toBeCloseTo(12)
      expect(z).toBeCloseTo(0)
    })
  })

  describe('newName', () => {
    it('returns base if not present', () => {
      expect(newName('Box', [])).toBe('Box')
      expect(newName('Box', ['Cylinder'])).toBe('Box')
    })

    it('appends 2 when base exists', () => {
      expect(newName('Box', ['Box'])).toBe('Box 2')
    })

    it('increments suffix when numbered names exist', () => {
      expect(newName('Box', ['Box', 'Box 2'])).toBe('Box 3')
      expect(newName('Box 2', ['Box 2'])).toBe('Box 3')
      expect(newName('Box', ['Box', 'Box 2', 'Box 3'])).toBe('Box 4')
    })
  })

  describe('reducers', () => {
    const obj1: EditorObject = {
      id: 'obj-1',
      name: 'Bracket',
      visible: true,
      locked: false,
      color: 0,
      source: { kind: 'mesh', meshId: 'mesh-123', unit: 'mm' },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }

    const obj2: EditorObject = {
      id: 'obj-2',
      name: 'Cylinder',
      visible: true,
      locked: false,
      color: 1,
      source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 20, height: 40 } },
      transform: { position: [20, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }

    it('adds and removes objects', () => {
      let doc = createEmptyScene()
      doc = addObject(doc, obj1)
      doc = addObject(doc, obj2)
      expect(doc.objects).toHaveLength(2)

      doc = removeObjects(doc, ['obj-1'])
      expect(doc.objects).toHaveLength(1)
      expect(doc.objects[0].id).toBe('obj-2')
    })

    it('updates object', () => {
      let doc = addObject(createEmptyScene(), obj1)
      doc = updateObject(doc, 'obj-1', { visible: false, name: 'Renamed' })
      expect(doc.objects[0].visible).toBe(false)
      expect(doc.objects[0].name).toBe('Renamed')
    })

    it('duplicates object sharing the mesh id with 10mm offset in X', () => {
      let doc = addObject(createEmptyScene(), obj1)
      const res = duplicateObject(doc, 'obj-1', 'dup-1')
      expect(res).not.toBeNull()
      expect(res!.doc.objects).toHaveLength(2)

      const dup = res!.duplicate
      expect(dup.id).toBe('dup-1')
      expect(dup.name).toBe('Bracket 2')
      expect(dup.transform.position).toEqual([10, 0, 0])
      expect(dup.source).toEqual({ kind: 'mesh', meshId: 'mesh-123', unit: 'mm' })
      expect((dup.source as { meshId: string }).meshId).toBe('mesh-123')
    })

    it('reorders objects', () => {
      let doc = createEmptyScene()
      doc = addObject(doc, obj1)
      doc = addObject(doc, obj2)
      expect(doc.objects[0].id).toBe('obj-1')

      doc = reorderObjects(doc, 0, 1)
      expect(doc.objects[0].id).toBe('obj-2')
      expect(doc.objects[1].id).toBe('obj-1')
    })
  })
})
