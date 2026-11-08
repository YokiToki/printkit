/**
 * Наложки подсветки граней и рёбер во вьюпорте: геометрия строится из
 * топологии, поэтому номера треугольников совпадают с областями граней.
 */
import * as THREE from 'three'
import type { MeshTopology } from '../../geometry/topology'
import { chainSegments, faceOverlayColors, stateOf, EDGE_COLORS } from './topologyView'

/** Геометрия накладки граней: треугольники сетки с цветом по области. */
export function buildFaceOverlayGeometry(
  topology: MeshTopology,
  hover: number | null | undefined,
  selection: number[] | undefined
): THREE.BufferGeometry {
  const idx = topology.index
  const triCount = idx.numTris
  const positions = new Float32Array(triCount * 9)
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const v = idx.triVertex[t * 3 + k]
      const src = v * idx.numProp
      const dst = (t * 3 + k) * 3
      positions[dst] = idx.positions[src]
      positions[dst + 1] = idx.positions[src + 1]
      positions[dst + 2] = idx.positions[src + 2]
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('color', new THREE.BufferAttribute(faceOverlayColors(topology, hover, selection), 4))
  return g
}

/** Геометрия линий рёбер с цветом по состоянию цепочки. */
export function buildEdgeOverlayGeometry(
  topology: MeshTopology,
  hover: number | null | undefined,
  selection: number[] | undefined
): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  for (const chain of topology.edges) {
    const state = stateOf(chain.id, hover, selection)
    const hex = EDGE_COLORS[state]
    const r = ((hex >> 16) & 0xff) / 255
    const g = ((hex >> 8) & 0xff) / 255
    const b = (hex & 0xff) / 255
    const segs = chainSegments(chain)
    for (let i = 0; i < segs.length; i += 3) {
      positions.push(segs[i], segs[i + 1], segs[i + 2])
      colors.push(r, g, b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return g
}
