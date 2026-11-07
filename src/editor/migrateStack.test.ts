import { describe, it, expect } from 'vitest'
import { migrateScene } from './sceneStore'

describe('migrateStack (Task 2.3)', () => {
  it('migrates feature sources of 40 to empty source + ops', () => {
    const raw40 = {
      schema: 1,
      objects: [
        {
          id: 'plate-1',
          name: 'Plate',
          visible: true,
          locked: false,
          color: 0,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          source: {
            kind: 'feature',
            features: [
              {
                id: 'feat-ext-1',
                kind: 'extrude',
                sketch: 'sk-1',
                op: 'new',
                side: 'one',
                d1: 15,
              },
              {
                id: 'feat-rev-1',
                kind: 'revolve',
                sketch: 'sk-1',
                op: 'cut',
                axis: { kind: 'planeAxis', axis: 'y' },
                angle: 180,
              },
            ],
          },
        },
      ],
      sketches: [
        {
          id: 'sk-1',
          name: 'Sketch 1',
          plane: { origin: [0, 0, 0], normal: [0, 0, 1], xDir: [1, 0, 0] },
          curves: {},
          constraints: [],
        },
      ],
    }

    const migrated = migrateScene(raw40)
    expect(migrated.objects.length).toBe(1)
    const obj = migrated.objects[0]
    expect(obj.source.kind).toBe('empty')
    expect(obj.stack).toBeDefined()
    expect(obj.stack!.length).toBe(2)
    expect(obj.stack![0].kind).toBe('extrude')
    expect(obj.stack![0].id).toBe('feat-ext-1')
    expect(obj.stack![0].params).toMatchObject({
      sketchId: 'sk-1',
      op: 'new',
      d1: 15,
    })
    expect(obj.stack![1].kind).toBe('revolve')
    expect(obj.stack![1].id).toBe('feat-rev-1')
    expect(obj.stack![1].params).toMatchObject({
      sketchId: 'sk-1',
      op: 'cut',
      angle: 180,
    })

    // Idempotent test: migrating again produces the same result
    const secondPass = migrateScene(migrated)
    expect(secondPass).toEqual(migrated)
  })

  it('preserves unknown operation kinds as disabled', () => {
    const rawWithUnknown = {
      schema: 1,
      objects: [
        {
          id: 'obj-future',
          name: 'Future Object',
          source: { kind: 'empty' },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          stack: [
            {
              id: 'future-op-1',
              kind: 'superLoftV2',
              enabled: true,
              params: { foo: 'bar', degree: 5 },
            },
            {
              id: 'known-op',
              kind: 'offset',
              enabled: true,
              params: { distance: 1.5 },
            },
          ],
        },
      ],
    }

    const migrated = migrateScene(rawWithUnknown)
    const obj = migrated.objects[0]
    expect(obj.stack!.length).toBe(2)
    // Unknown op should be kept with enabled: false
    expect(obj.stack![0].kind).toBe('superLoftV2')
    expect(obj.stack![0].enabled).toBe(false)
    expect(obj.stack![0].params).toEqual({ foo: 'bar', degree: 5 })
    // Known op remains enabled
    expect(obj.stack![1].kind).toBe('offset')
    expect(obj.stack![1].enabled).toBe(true)

    // Idempotent test
    const secondPass = migrateScene(migrated)
    expect(secondPass).toEqual(migrated)
  })

  it('normalises and round-trips hole and text operations (Task 3.4)', () => {
    const raw = {
      schema: 1,
      objects: [
        {
          id: 'obj-1',
          name: 'Bracket',
          source: { kind: 'empty' },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          stack: [
            {
              id: 'hole-1',
              kind: 'hole',
              enabled: true,
              params: {
                point: [10, 20, 5],
                normal: [0, 0, 1],
                kind: 'counterbore',
                diameter: 3.4,
                depth: 8,
                cbDiameter: 6.5,
                cbDepth: 3.5,
                preset: 'M3 DIN 912',
              },
            },
            {
              id: 'text-1',
              kind: 'text',
              enabled: true,
              params: {
                point: [0, 0, 10],
                normal: [0, 0, 1],
                text: 'PrintKit',
                size: 6,
                mode: 'emboss',
                height: 0.8,
              },
            },
          ],
        },
      ],
    }

    const migrated = migrateScene(raw)
    const obj = migrated.objects[0]
    expect(obj.stack).toHaveLength(2)

    const holeOp = obj.stack![0]
    expect(holeOp.kind).toBe('hole')
    expect(holeOp.enabled).toBe(true)
    expect((holeOp.params as any).kind).toBe('counterbore')
    expect((holeOp.params as any).diameter).toBe(3.4)
    expect((holeOp.params as any).cbDiameter).toBe(6.5)

    const textOp = obj.stack![1]
    expect(textOp.kind).toBe('text')
    expect(textOp.enabled).toBe(true)
    expect((textOp.params as any).text).toBe('PrintKit')
    expect((textOp.params as any).mode).toBe('emboss')
    expect((textOp.params as any).height).toBe(0.8)

    // Idempotent round trip
    const secondPass = migrateScene(migrated)
    expect(secondPass).toEqual(migrated)
  })
})
