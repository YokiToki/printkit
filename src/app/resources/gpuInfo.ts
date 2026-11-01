import type { ModelSpec } from '../../ml/models'
import { totalBytes } from '../../ml/models'
import { estimated, measured, unavailable, type ResourceValue } from './types'

export interface GpuAdapterInfoLike {
  vendor?: string
  architecture?: string
  device?: string
  description?: string
}

export interface GpuAdapterLike {
  info?: GpuAdapterInfoLike
  requestAdapterInfo?: () => Promise<GpuAdapterInfoLike>
  features?: { has(name: string): boolean }
  limits?: { maxBufferSize?: number }
}

export interface GpuNavigatorLike {
  requestAdapter?: () => Promise<GpuAdapterLike | null>
}

export interface GpuInfoSnapshot {
  supported: boolean
  timestampQuery: boolean
  adapterName: ResourceValue<string | null>
  architecture: ResourceValue<string | null>
  maxBufferBytes: ResourceValue<number | null>
}

/** Оценка памяти GPU для модели: веса + крупнейшие буферы входа/выхода (float32 RGB вход + выход + промежуточный буфер). */
export function estimateModelGpuMemory(spec: Pick<ModelSpec, 'bytes' | 'size' | 'data'>): ResourceValue<number> {
  const weights = totalBytes(spec as ModelSpec)
  const ioActivations = spec.size * spec.size * 4 * 8 // вход 1×3×S×S float32 + выход + 4 рабочих тензора
  return estimated(weights + ioActivations, 'B', 'resources.note.gpuMemory')
}

export async function readGpuInfo(gpu: GpuNavigatorLike | undefined = (globalThis.navigator as unknown as { gpu?: GpuNavigatorLike } | undefined)?.gpu): Promise<GpuInfoSnapshot> {
  if (!gpu?.requestAdapter) {
    return {
      supported: false,
      timestampQuery: false,
      adapterName: unavailable('resources.unavailable.webgpu'),
      architecture: unavailable('resources.unavailable.webgpu'),
      maxBufferBytes: unavailable('resources.unavailable.webgpu'),
    }
  }
  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) {
      return {
        supported: false,
        timestampQuery: false,
        adapterName: unavailable('resources.unavailable.webgpu'),
        architecture: unavailable('resources.unavailable.webgpu'),
        maxBufferBytes: unavailable('resources.unavailable.webgpu'),
      }
    }
    const info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {})
    const name = [info.description, info.device, info.vendor].find((s) => s && s.trim().length > 0)?.trim() || 'WebGPU'
    const arch = info.architecture?.trim() || info.vendor?.trim() || 'default'
    const ts = Boolean(
      adapter.features?.has('timestamp-query') ||
      adapter.features?.has('chromium-experimental-timestamp-query-inside-passes'),
    )
    const maxBuf = adapter.limits?.maxBufferSize
    return {
      supported: true,
      timestampQuery: ts,
      adapterName: measured(name),
      architecture: measured(arch),
      maxBufferBytes: typeof maxBuf === 'number' && maxBuf > 0
        ? measured(maxBuf, 'B')
        : unavailable('resources.unavailable.webgpu'),
    }
  } catch {
    return {
      supported: false,
      timestampQuery: false,
      adapterName: unavailable('resources.unavailable.webgpu'),
      architecture: unavailable('resources.unavailable.webgpu'),
      maxBufferBytes: unavailable('resources.unavailable.webgpu'),
    }
  }
}
