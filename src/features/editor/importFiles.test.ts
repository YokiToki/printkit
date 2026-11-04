import { describe, expect, it, vi } from 'vitest'
import { openMeshStore } from '../cutout/meshStore'
import { asciiStl, binaryStl, boxSoup } from '../../geometry/stl-fixtures'
import type { IndexedMesh } from '../../geometry/stl-import'
import { importFiles, weldMesh } from './importFiles'

describe('editor/importFiles', () => {
  it('imports binary and ASCII STL files correctly', async () => {
    const store = await openMeshStore(null)
    const registered: [string, IndexedMesh][] = []

    const binBuf = binaryStl(boxSoup(20, 20, 20))
    const ascBuf = asciiStl(boxSoup(30, 40, 50))

    const res = await importFiles(
      [
        { name: 'part_bin.stl', buffer: binBuf },
        { name: 'part_asc.stl', buffer: ascBuf },
      ],
      {
        unit: 'mm',
        store,
        registerMesh: (id, m) => registered.push([id, m]),
      }
    )

    expect(res.errors).toHaveLength(0)
    expect(res.objects).toHaveLength(2)

    // First object centered at X=0
    const obj1 = res.objects[0]
    expect(obj1.name).toBe('part_bin')
    expect(obj1.transform.position).toEqual([0, 0, 0])

    // Second object placed next to it along X with 10 mm gap:
    // obj1 width is 20 -> right edge is 10.
    // obj2 width is 30 -> center should be 10 + 10 + 15 = 35!
    const obj2 = res.objects[1]
    expect(obj2.name).toBe('part_asc')
    expect(obj2.transform.position[0]).toBeCloseTo(35)

    // Meshes were saved and registered
    expect(registered).toHaveLength(2)
    expect(await store.load((obj1.source as { meshId: string }).meshId)).toBeDefined()
    expect(await store.load((obj2.source as { meshId: string }).meshId)).toBeDefined()
  })

  it('scales coordinates when unit is inches', async () => {
    const store = await openMeshStore(null)
    const binBuf = binaryStl(boxSoup(1, 2, 3)) // 1 x 2 x 3 inches

    const res = await importFiles(
      [{ name: 'inch_box.stl', buffer: binBuf }],
      {
        unit: 'in',
        store,
        registerMesh: () => {},
      }
    )

    expect(res.errors).toHaveLength(0)
    expect(res.objects).toHaveLength(1)

    const meshId = (res.objects[0].source as { meshId: string }).meshId
    const saved = await store.load(meshId)
    expect(saved).toBeDefined()

    // Dimensions in mm should be 25.4, 50.8, 76.2
    let minX = Infinity, maxX = -Infinity
    for (let i = 0; i < saved!.vertProperties.length; i += 3) {
      minX = Math.min(minX, saved!.vertProperties[i])
      maxX = Math.max(maxX, saved!.vertProperties[i])
    }
    expect(maxX - minX).toBeCloseTo(25.4)
  })

  it('handles bad file without stopping other files in the same batch', async () => {
    const store = await openMeshStore(null)
    const goodBuf = binaryStl(boxSoup(20, 20, 20))
    const badBuf = new TextEncoder().encode('not an stl file at all').buffer as ArrayBuffer

    const res = await importFiles(
      [
        { name: 'corrupt.stl', buffer: badBuf },
        { name: 'valid.stl', buffer: goodBuf },
      ],
      {
        unit: 'mm',
        store,
        registerMesh: () => {},
      }
    )

    expect(res.errors).toHaveLength(1)
    expect(res.errors[0].fileName).toBe('corrupt.stl')
    expect(res.objects).toHaveLength(1)
    expect(res.objects[0].name).toBe('valid')
  })

  it('detects size notice thresholds (tooSmall < 1 mm, tooLarge > 1000 mm)', async () => {
    const store = await openMeshStore(null)
    const tinyBuf = binaryStl(boxSoup(0.5, 0.5, 0.5)) // 0.5 mm
    const hugeBuf = binaryStl(boxSoup(1200, 50, 50)) // 1200 mm
    const normalBuf = binaryStl(boxSoup(50, 50, 50))

    const res = await importFiles(
      [
        { name: 'tiny.stl', buffer: tinyBuf },
        { name: 'huge.stl', buffer: hugeBuf },
        { name: 'normal.stl', buffer: normalBuf },
      ],
      {
        unit: 'mm',
        store,
        registerMesh: () => {},
      }
    )

    expect(res.notices).toHaveLength(2)
    expect(res.notices[0].fileName).toBe('tiny.stl')
    expect(res.notices[0].kind).toBe('tooSmall')

    expect(res.notices[1].fileName).toBe('huge.stl')
    expect(res.notices[1].kind).toBe('tooLarge')
  })
})
