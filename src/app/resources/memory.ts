import { modelStore } from '../../ml/modelStore'
import { measured, unavailable, type ResourceValue } from './types'

export interface StorageManagerLike {
  estimate?: () => Promise<{ usage?: number; quota?: number }>
}

export interface PerformanceMemoryLike {
  usedJSHeapSize?: number
  totalJSHeapSize?: number
  jsHeapSizeLimit?: number
}

export interface MemoryDeps {
  storage?: StorageManagerLike
  perfMemory?: () => PerformanceMemoryLike | undefined
  modelUsedBytes?: () => number
  wasmBytes?: () => number | null
}

export interface MemorySnapshot {
  modelCacheBytes: ResourceValue<number>
  storageUsageBytes: ResourceValue<number | null>
  storageQuotaBytes: ResourceValue<number | null>
  jsHeapBytes: ResourceValue<number | null>
  wasmMemoryBytes: ResourceValue<number | null>
}

let registeredWasmBytes: (() => number | null) | null = null
/** Позволяет воркеру/рантайму сообщить известный объём собственной памяти WASM (если среда его раскрывает). */
export function setWasmMemoryReader(reader: (() => number | null) | null) {
  registeredWasmBytes = reader
}

export async function readMemorySnapshot(deps: MemoryDeps = {}): Promise<MemorySnapshot> {
  const storage = 'storage' in deps ? deps.storage : (globalThis.navigator as unknown as { storage?: StorageManagerLike } | undefined)?.storage
  const getPerfMem = deps.perfMemory ?? (() => (globalThis.performance as unknown as { memory?: PerformanceMemoryLike } | undefined)?.memory)
  const getModelBytes = deps.modelUsedBytes ?? (() => modelStore.usedBytes())
  const getWasmBytes = deps.wasmBytes ?? registeredWasmBytes ?? (() => null)

  const modelCacheBytes = measured(Math.max(0, getModelBytes()), 'B')

  let storageUsageBytes: ResourceValue<number | null> = unavailable('resources.unavailable.storageEstimate')
  let storageQuotaBytes: ResourceValue<number | null> = unavailable('resources.unavailable.storageEstimate')
  if (storage?.estimate) {
    try {
      const est = await storage.estimate()
      if (typeof est.usage === 'number') storageUsageBytes = measured(est.usage, 'B')
      if (typeof est.quota === 'number') storageQuotaBytes = measured(est.quota, 'B')
    } catch {
      // остаётся unavailable
    }
  }

  const pm = getPerfMem()
  const jsHeapBytes: ResourceValue<number | null> = typeof pm?.usedJSHeapSize === 'number'
    ? measured(pm.usedJSHeapSize, 'B')
    : unavailable('resources.unavailable.jsHeap')

  const wb = getWasmBytes()
  const wasmMemoryBytes: ResourceValue<number | null> = typeof wb === 'number' && wb >= 0
    ? measured(wb, 'B')
    : unavailable('resources.unavailable.wasmMemory')

  return {
    modelCacheBytes,
    storageUsageBytes,
    storageQuotaBytes,
    jsHeapBytes,
    wasmMemoryBytes,
  }
}
