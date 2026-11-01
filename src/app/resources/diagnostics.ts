import { useSyncExternalStore } from 'react'
import { measured, unavailable, type GpuRunProfile, type KernelTiming } from './types'

export const DIAGNOSTICS_KEY = 'gridfinity.diagnostics'

export interface RawKernelSample {
  kernelType: string
  kernelName?: string
  programName?: string
  /** Время начала в наносекундах (ORT Web `env.webgpu.profiling.ondata`). */
  startTime: number
  /** Время окончания в наносекундах. */
  endTime: number
}

let cached: boolean | null = null
const listeners = new Set<() => void>()

function readStored(): boolean {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(DIAGNOSTICS_KEY)
    return raw ? JSON.parse(raw) === true : false
  } catch {
    return false
  }
}

export function getDiagnostics(): boolean {
  if (cached === null) cached = readStored()
  return cached
}

export function setDiagnostics(enabled: boolean): void {
  cached = Boolean(enabled)
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(cached))
  } catch {
    // без localStorage живёт в памяти до перезагрузки
  }
  listeners.forEach((l) => l())
}

export function subscribeDiagnostics(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function useDiagnostics(): [boolean, (v: boolean) => void] {
  const val = useSyncExternalStore(subscribeDiagnostics, getDiagnostics, getDiagnostics)
  return [val, setDiagnostics]
}

export function resetDiagnostics(): void {
  cached = null
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DIAGNOSTICS_KEY)
  } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function unavailableGpuProfile(note: string): GpuRunProfile {
  return {
    gpuMs: unavailable(note),
    wallRatio: unavailable(note),
    slowest: [],
  }
}

/** Агрегирует сэмплы ядер WebGPU за один прогон: сумма времени GPU, доля от wall time и 5 самых медленных ядер. */
export function aggregateKernels(samples: readonly RawKernelSample[], wallMs: number): GpuRunProfile {
  if (samples.length === 0) return unavailableGpuProfile('resources.unavailable.timestampQuery')
  let totalNs = 0
  const byOp = new Map<string, { name: string; type: string; ns: number; calls: number }>()
  for (const s of samples) {
    const dt = Math.max(0, s.endTime - s.startTime)
    totalNs += dt
    const name = s.programName || s.kernelName || s.kernelType
    const key = `${s.kernelType}|${name}`
    const prev = byOp.get(key) ?? { name, type: s.kernelType, ns: 0, calls: 0 }
    prev.ns += dt
    prev.calls++
    byOp.set(key, prev)
  }
  const gpuMs = totalNs / 1e6
  const slowest: KernelTiming[] = [...byOp.values()]
    .sort((a, b) => b.ns - a.ns)
    .slice(0, 5)
    .map((x) => ({ name: x.name, type: x.type, ms: x.ns / 1e6, calls: x.calls }))
  const ratio = wallMs > 0 ? Math.min(1, Math.max(0, gpuMs / wallMs)) : 0
  return {
    gpuMs: measured(gpuMs, 'ms'),
    wallRatio: measured(ratio, 'ratio'),
    slowest,
  }
}
