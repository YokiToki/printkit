import type { Backend, ModelSpec } from './models'

export interface Capabilities { webgpu: boolean; f16: boolean }

interface GpuAdapter { features: { has(name: string): boolean } }
interface NavigatorGpu { gpu?: { requestAdapter(): Promise<GpuAdapter | null> } }

/** WebGPU и расширение `shader-f16` (нужно fp16-весам). Любая ошибка — «нет»: ИИ на WASM остаётся доступным. */
export async function detectCapabilities(nav: NavigatorGpu | undefined = typeof navigator === 'undefined' ? undefined : (navigator as unknown as NavigatorGpu)): Promise<Capabilities> {
  try {
    const adapter = await nav?.gpu?.requestAdapter()
    if (!adapter) return { webgpu: false, f16: false }
    return { webgpu: true, f16: adapter.features.has('shader-f16') }
  } catch { return { webgpu: false, f16: false } }
}

export type Unavailable = 'noWebgpu' | 'noF16'
export type Availability = { ok: true; backend: Backend } | { ok: false; reason: Unavailable }

/** Бэкенд, на котором модель можно запустить здесь (первый из её списка, который поддержан), или причина, почему нельзя. */
export function availability(spec: Pick<ModelSpec, 'backends' | 'fp16'>, caps: Capabilities): Availability {
  let reason: Unavailable = 'noWebgpu'
  for (const b of spec.backends) {
    if (b === 'wasm') return { ok: true, backend: 'wasm' } // бэкенд записан в реестре только если модель на нём работает (замеры)
    if (!caps.webgpu) { reason = 'noWebgpu'; continue }
    if (spec.fp16 && !caps.f16) { reason = 'noF16'; continue }
    return { ok: true, backend: 'webgpu' }
  }
  return { ok: false, reason }
}
