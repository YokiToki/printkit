export type ValueSource = 'measured' | 'estimated' | 'unavailable'

/** Значение метрики ресурсов с явным происхождением (`measured | estimated | unavailable`) и ключом пояснения. */
export interface ResourceValue<T = number | string | null> {
  value: T
  unit?: string
  source: ValueSource
  /** Ключ перевода причины недоступности или способа оценки (для тултипа и копирования). */
  note?: string
}

export const measured = <T>(value: T, unit?: string, note?: string): ResourceValue<T> => ({
  value,
  ...(unit !== undefined && { unit }),
  source: 'measured',
  ...(note !== undefined && { note }),
})

export const estimated = <T>(value: T, unit?: string, note?: string): ResourceValue<T> => ({
  value,
  ...(unit !== undefined && { unit }),
  source: 'estimated',
  ...(note !== undefined && { note }),
})

export const unavailable = (note: string): ResourceValue<null> => ({
  value: null,
  source: 'unavailable',
  note,
})

export type JobBackend = 'wasm' | 'webgpu' | 'unknown'
export type JobKind = 'rebuild' | 'ai' | 'download'

export interface JobSpan {
  start: number
  end: number
}

export interface KernelTiming {
  name: string
  type: string
  ms: number
  calls: number
}

export interface GpuRunProfile {
  gpuMs: ResourceValue<number | null>
  wallRatio: ResourceValue<number | null>
  slowest: KernelTiming[]
}

export interface JobReportInput {
  id?: number
  kind: JobKind
  name?: string
  start: number
  end: number
  /** Интервалы активной работы воркера внутри [start, end]; если не переданы — вся длительность считается одним запросом. */
  spans?: readonly JobSpan[]
  backend?: JobBackend
  threads?: number
  triangles?: number
  gpuProfile?: GpuRunProfile
  gpuMemoryBytes?: number
  finishedAt?: number
}

export interface JobReport {
  id: number
  kind: JobKind
  name?: string
  backend: JobBackend
  threads: number
  durationMs: ResourceValue<number>
  busyShare: ResourceValue<number | null>
  coreEquivalent: ResourceValue<number | null>
  triangles?: ResourceValue<number>
  gpuProfile?: GpuRunProfile
  gpuMemoryBytes?: ResourceValue<number | null>
  finishedAt: number
}
