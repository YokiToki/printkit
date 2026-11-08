/**
 * Топология твёрдого тела: считается один раз на версию формы и
 * кэшируется по хэшу сетки.
 */
import type { Manifold } from 'manifold-3d'
import { computeTopology, meshHash, type MeshTopology, type TopologyOptions } from './index'

const CACHE_LIMIT = 8
const cache = new Map<string, MeshTopology>()

/** Топология тела с кэшем по хэшу сетки. */
export function topologyOfSolid(solid: Manifold, options?: TopologyOptions): MeshTopology {
  const mesh = solid.getMesh()
  const source = {
    vertProperties: mesh.vertProperties as Float32Array,
    triVerts: mesh.triVerts as Uint32Array,
    numProp: mesh.numProp,
  }
  const key = meshHash(source)
  const hit = cache.get(key)
  if (hit) {
    // Обновляем позицию в LRU.
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const topo = computeTopology(source, options)
  cache.set(key, topo)
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return topo
}

/** Очистка кэша топологии (используется в тестах). */
export function clearTopologyCache() {
  cache.clear()
}
