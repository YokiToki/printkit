import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { lookAtPlane, pointerToPlaneCoordinates, screenPick } from './sketchPicking'
import { createSketch, addLine, addCircle, type PlaneDefinition } from '../../editor/sketch/model'

describe('4.1 sketchPicking: lookAtPlane, pointerToPlaneCoordinates, screenPick', () => {
  it('lookAtPlane generates camera target, position and up vector for XY, XZ, YZ planes and offset', () => {
    // 1. XY plane, offset 0
    const xy = lookAtPlane({ base: 'XY', offset: 0 }, { x: 10, y: 20 }, 200)
    expect(xy.target).toEqual([10, 20, 0])
    expect(xy.position).toEqual([10, 20, 200])
    expect(xy.up).toEqual([0, 1, 0])

    // 2. XY plane, offset 50
    const xyOff = lookAtPlane({ base: 'XY', offset: 50 }, { x: 0, y: 0 }, 100)
    expect(xyOff.target).toEqual([0, 0, 50])
    expect(xyOff.position).toEqual([0, 0, 150])

    // 3. XZ plane, offset 10
    const xz = lookAtPlane({ base: 'XZ', offset: 10 }, { x: 5, y: 5 }, 150)
    expect(xz.target[1]).toBeCloseTo(10) // offset along Y
    expect(xz.up).toEqual([0, 0, 1]) // +Z is up for XZ plane

    // 4. YZ plane, offset 25
    const yz = lookAtPlane({ base: 'YZ', offset: 25 }, { x: 0, y: 0 }, 150)
    expect(yz.target[0]).toBeCloseTo(25) // offset along X
    expect(yz.up).toEqual([0, 0, 1]) // +Z is up for YZ plane
  })

  it('pointerToPlaneCoordinates converts screen pointer to plane coordinates for each base plane and offset', () => {
    const w = 800
    const h = 600

    // Set up an OrthographicCamera looking down along -Z at (0,0,0), size 800x600 (1 px = 1 unit)
    const cam = new THREE.OrthographicCamera(-400, 400, 300, -300, 1, 1000)
    cam.position.set(0, 0, 200)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld()
    cam.updateProjectionMatrix()

    const planeXY: PlaneDefinition = { base: 'XY', offset: 0 }
    // Center of screen (400, 300) -> plane (0, 0)
    const centerHit = pointerToPlaneCoordinates(
      { x: 400, y: 300 },
      { width: w, height: h },
      cam,
      planeXY,
    )
    expect(centerHit).not.toBeNull()
    expect(centerHit!.x).toBeCloseTo(0, 3)
    expect(centerHit!.y).toBeCloseTo(0, 3)

    // Screen (500, 200) -> 100 px right, 100 px up -> plane (100, 100)
    const offHit = pointerToPlaneCoordinates(
      { x: 500, y: 200 },
      { width: w, height: h },
      cam,
      planeXY,
    )
    expect(offHit).not.toBeNull()
    expect(offHit!.x).toBeCloseTo(100, 3)
    expect(offHit!.y).toBeCloseTo(100, 3)

    // XZ plane with offset 10 and camera oriented along lookAtPlane
    const planeXZ: PlaneDefinition = { base: 'XZ', offset: 10 }
    const xzView = lookAtPlane(planeXZ, { x: 0, y: 0 }, 200)
    cam.position.set(...xzView.position)
    cam.up.set(...xzView.up)
    cam.lookAt(new THREE.Vector3(...xzView.target))
    cam.updateMatrixWorld()
    cam.updateProjectionMatrix()

    const xzHit = pointerToPlaneCoordinates(
      { x: 500, y: 200 },
      { width: w, height: h },
      cam,
      planeXZ,
    )
    expect(xzHit).not.toBeNull()
    expect(xzHit!.x).toBeCloseTo(100, 3)
    expect(xzHit!.y).toBeCloseTo(100, 3)

    // YZ plane with offset 20
    const planeYZ: PlaneDefinition = { base: 'YZ', offset: 20 }
    const yzView = lookAtPlane(planeYZ, { x: 0, y: 0 }, 200)
    cam.position.set(...yzView.position)
    cam.up.set(...yzView.up)
    cam.lookAt(new THREE.Vector3(...yzView.target))
    cam.updateMatrixWorld()
    cam.updateProjectionMatrix()

    const yzHit = pointerToPlaneCoordinates(
      { x: 400, y: 300 },
      { width: w, height: h },
      cam,
      planeYZ,
    )
    expect(yzHit).not.toBeNull()
    expect(yzHit!.x).toBeCloseTo(0, 3)
    expect(yzHit!.y).toBeCloseTo(0, 3)
  })

  it('screenPick selects points with priority over curves, honors 6 px threshold', () => {
    let s = createSketch('PickTest')
    // Line from (0, 0) to (100, 0)
    const lineRes = addLine(s, { x: 0, y: 0 }, { x: 100, y: 0 })
    s = lineRes.sketch
    const p1Id = lineRes.p1Id
    const lineId = lineRes.curveId

    // Circle at (200, 200) radius 50
    const circRes = addCircle(s, { x: 200, y: 200 }, 50)
    s = circRes.sketch
    const circId = circRes.curveId

    // 1 unit = 1 pixel mapping
    const project = (pt: { x: number; y: number }) => ({ x: pt.x + 400, y: 300 - pt.y })

    // 1. Point at (0, 0) is at screen (400, 300)
    // Pointer at (403, 302): distance to point is ~3.6 px <= 6 px
    const ptPick = screenPick({ x: 403, y: 302 }, s, project, 6)
    expect(ptPick).not.toBeNull()
    expect(ptPick!.kind).toBe('point')
    expect(ptPick!.id).toBe(p1Id)

    // 2. Along the line at (50, 0) -> screen (450, 300)
    // Pointer at (450, 304): distance to line is 4 px <= 6 px. No point nearby.
    const linePick = screenPick({ x: 450, y: 304 }, s, project, 6)
    expect(linePick).not.toBeNull()
    expect(linePick!.kind).toBe('curve')
    expect(linePick!.id).toBe(lineId)

    // 3. Near circle perimeter: center (200, 200) r=50 -> screen center (600, 100), r=50 px
    // Pointer at (652, 100): distance to perimeter is 2 px <= 6 px
    const circPick = screenPick({ x: 652, y: 100 }, s, project, 6)
    expect(circPick).not.toBeNull()
    expect(circPick!.kind).toBe('curve')
    expect(circPick!.id).toBe(circId)

    // 4. Miss: pointer far away
    const miss = screenPick({ x: 50, y: 50 }, s, project, 6)
    expect(miss).toBeNull()

    // 5. Point priority when near both endpoint and line
    // Pointer at (402, 300): point distance is 2 px, line distance is 0 px. Point wins!
    const pointWins = screenPick({ x: 402, y: 300 }, s, project, 6)
    expect(pointWins!.kind).toBe('point')
    expect(pointWins!.id).toBe(p1Id)
  })
})
