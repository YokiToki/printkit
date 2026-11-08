/**
 * Топология меша целиком: области граней, цепочки рёбер и ссылки на них.
 * React-free, без three.js и manifold.
 */
import type { IndexedMesh, TriSoup } from '../stl-import'
import {
  buildMeshIndex,
  segmentFaces,
  DEFAULT_TOPOLOGY_OPTIONS,
  type FaceRegion,
  type MeshIndex,
  type TopologyOptions,
} from './faces'
import { edgeChains, DEFAULT_EDGE_OPTIONS, type EdgeChain, type EdgeOptions } from './edges'
import { faceRef, edgeRef, type FaceRef, type EdgeRef } from './reference'

export interface MeshTopology {
  index: MeshIndex
  faces: FaceRegion[]
  /** Идентификатор области для каждого треугольника. */
  triToFace: Int32Array
  edges: EdgeChain[]
  bounds: { min: [number, number, number]; max: [number, number, number] }
  diagonal: number
  options: Required<TopologyOptions> & Required<EdgeOptions>
}

export function computeTopology(
  mesh: TriSoup | IndexedMesh,
  options: TopologyOptions & EdgeOptions = {}
): MeshTopology {
  const opts = { ...DEFAULT_TOPOLOGY_OPTIONS, ...DEFAULT_EDGE_OPTIONS, ...options }
  const index = buildMeshIndex(mesh)
  const { faces, triToFace } = segmentFaces(index, opts)
  const edges = edgeChains(index, triToFace, opts)
  return {
    index,
    faces,
    triToFace,
    edges,
    bounds: index.bounds,
    diagonal: index.diagonal,
    options: opts,
  }
}

/** Отпечатки граней текущей формы. */
export function faceRefs(topology: MeshTopology): FaceRef[] {
  return topology.faces.map(faceRef)
}

/** Отпечатки рёбер текущей формы. */
export function edgeRefs(topology: MeshTopology): EdgeRef[] {
  return topology.edges.map(edgeRef)
}

/** Стабильный хэш сетки для кэша топологии. */
export function meshHash(mesh: TriSoup | IndexedMesh): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  const feed = (n: number) => {
    const v = Math.round(n * 1000) | 0
    h1 = Math.imul(h1 ^ (v & 0xffff), 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ ((v >>> 16) & 0xffff), 0x85ebca6b) >>> 0
  }
  if ('triVerts' in mesh) {
    const verts = mesh.vertProperties
    for (let i = 0; i < verts.length; i++) feed(verts[i])
    const tris = mesh.triVerts
    for (let i = 0; i < tris.length; i++) feed(tris[i])
  } else {
    const pos = mesh.positions
    for (let i = 0; i < pos.length; i++) feed(pos[i])
  }
  return `${h1.toString(36)}${h2.toString(36)}`
}

export * from './classify'
export * from './faces'
export * from './edges'
export * from './reference'
