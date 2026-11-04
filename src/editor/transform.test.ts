import { describe, expect, it } from 'vitest'
import type { EditorObject } from './scene'
import {
  boundsOf,
  centerOnBed,
  dropToBed,
  mirror,
  rotateAbout,
  scaleToSize,
  selectionBounds,
  snapAngle,
  snapValue,
  type Bounds3,
} from './transform'

describe('editor/transform', () => {
  // A known box 40 x 20 x 10, centered in X/Y, standing on bed:
  // localBounds: min [-20, -10, 0], max [20, 10, 10]
  const knownLocalBounds: Bounds3 = {
    min: [-20, -10, 0],
    max: [20, 10, 10],
  }

  const createBox = (position: [number, number, number] = [0, 0, 0]): EditorObject => ({
    id: 'box-1',
    name: 'Box',
    visible: true,
    locked: false,
    color: 0,
    source: {
      kind: 'primitive',
      shape: 'box',
      params: { width: 40, depth: 20, height: 10 },
    },
    transform: {
      position,
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  })

  it('boundsOf calculates correct world bounds for translated and scaled box', () => {
    const box = createBox([10, 20, 5])
    box.transform.scale = [2, 1, 1]

    const b = boundsOf(box, knownLocalBounds)
    // local X was [-20, 20] -> scaled by 2 -> [-40, 40] + 10 -> [-30, 50]
    expect(b.min[0]).toBeCloseTo(-30)
    expect(b.max[0]).toBeCloseTo(50)
    // local Y was [-10, 10] -> + 20 -> [10, 30]
    expect(b.min[1]).toBeCloseTo(10)
    expect(b.max[1]).toBeCloseTo(30)
    // local Z was [0, 10] -> + 5 -> [5, 15]
    expect(b.min[2]).toBeCloseTo(5)
    expect(b.max[2]).toBeCloseTo(15)
  })

  it('selectionBounds unions bounds of several objects', () => {
    const box1 = createBox([0, 0, 0])
    const box2 = createBox([50, 50, 0])

    const b = selectionBounds([box1, box2], () => knownLocalBounds)
    expect(b).not.toBeNull()
    expect(b!.min[0]).toBeCloseTo(-20)
    expect(b!.max[0]).toBeCloseTo(70)
    expect(b!.min[1]).toBeCloseTo(-10)
    expect(b!.max[1]).toBeCloseTo(60)

    expect(selectionBounds([])).toBeNull()
  })

  it('dropToBed places lowest Z vertex exactly on bed z=0 without changing X/Y', () => {
    const box = createBox([15, 25, 30])
    const dropped = dropToBed(box, knownLocalBounds)

    expect(dropped.transform.position[0]).toBe(15)
    expect(dropped.transform.position[1]).toBe(25)
    expect(dropped.transform.position[2]).toBe(0)

    const b = boundsOf(dropped, knownLocalBounds)
    expect(b.min[2]).toBeCloseTo(0)
    expect(b.max[2]).toBeCloseTo(10)
  })

  it('centerOnBed centers XY bounding box at (0, 0) without changing Z', () => {
    const box = createBox([15, 25, 30])
    const centered = centerOnBed(box, knownLocalBounds)

    expect(centered.transform.position[0]).toBe(0)
    expect(centered.transform.position[1]).toBe(0)
    expect(centered.transform.position[2]).toBe(30)

    const b = boundsOf(centered, knownLocalBounds)
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0)
    expect((b.min[1] + b.max[1]) / 2).toBeCloseTo(0)
    expect(b.min[2]).toBeCloseTo(30)
  })

  it('mirror along an axis preserves world bounds and mirror twice is identity', () => {
    // Non-centered box at (15, 25, 0)
    const box = createBox([15, 25, 0])
    const initialBounds = boundsOf(box, knownLocalBounds)

    // First mirror along X
    const m1 = mirror(box, 'x', knownLocalBounds)
    expect(m1.flipWinding).toBe(true)
    const b1 = boundsOf(m1.object, knownLocalBounds)
    expect(b1.min[0]).toBeCloseTo(initialBounds.min[0])
    expect(b1.max[0]).toBeCloseTo(initialBounds.max[0])
    expect(b1.min[1]).toBeCloseTo(initialBounds.min[1])
    expect(b1.max[1]).toBeCloseTo(initialBounds.max[1])

    // Second mirror along X restores identity
    const m2 = mirror(m1.object, 'x', knownLocalBounds)
    expect(m2.flipWinding).toBe(false)
    expect(m2.object.transform.position[0]).toBeCloseTo(box.transform.position[0])
    expect(m2.object.transform.position[1]).toBeCloseTo(box.transform.position[1])
    expect(m2.object.transform.position[2]).toBeCloseTo(box.transform.position[2])
    expect(m2.object.transform.scale).toEqual(box.transform.scale)
  })

  it('scaleToSize with proportion lock scales all axes and preserves centre', () => {
    const box = createBox([10, 20, 0])
    const initialBounds = boundsOf(box, knownLocalBounds)
    const initialCenter = [
      (initialBounds.min[0] + initialBounds.max[0]) / 2,
      (initialBounds.min[1] + initialBounds.max[1]) / 2,
      (initialBounds.min[2] + initialBounds.max[2]) / 2,
    ]

    // Scale X from 40 to 20 (half size) with proportion lock
    const scaled = scaleToSize(box, 'x', 20, true, knownLocalBounds)
    const newBounds = boundsOf(scaled, knownLocalBounds)
    const newCenter = [
      (newBounds.min[0] + newBounds.max[0]) / 2,
      (newBounds.min[1] + newBounds.max[1]) / 2,
      (newBounds.min[2] + newBounds.max[2]) / 2,
    ]

    expect(newBounds.max[0] - newBounds.min[0]).toBeCloseTo(20)
    expect(newBounds.max[1] - newBounds.min[1]).toBeCloseTo(10) // 20 / 2
    expect(newBounds.max[2] - newBounds.min[2]).toBeCloseTo(5)  // 10 / 2

    expect(newCenter[0]).toBeCloseTo(initialCenter[0])
    expect(newCenter[1]).toBeCloseTo(initialCenter[1])
    expect(newCenter[2]).toBeCloseTo(initialCenter[2])
  })

  it('snapValue and snapAngle snap to steps', () => {
    expect(snapValue(12.3, 5)).toBe(10)
    expect(snapValue(13.8, 5)).toBe(15)
    expect(snapValue(0.12, 0.5)).toBe(0)
    expect(snapValue(0.38, 0.5)).toBe(0.5)

    expect(snapAngle(14, 15)).toBe(15)
    expect(snapAngle(22, 15)).toBe(15)
    expect(snapAngle(23, 15)).toBe(30)
    expect(snapAngle(-14, 15)).toBe(-15)
  })

  it('rotateAbout rotates position and orientation about pivot', () => {
    const t = {
      position: [10, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    }

    const rotated = rotateAbout(t, 90, 'z', [0, 0, 0])
    expect(rotated.position[0]).toBeCloseTo(0)
    expect(rotated.position[1]).toBeCloseTo(10)
    expect(rotated.position[2]).toBeCloseTo(0)
    expect(rotated.rotation[2]).toBeCloseTo(90)
  })
})
