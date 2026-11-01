import { estimated, measured, unavailable, type JobBackend, type JobReport, type JobReportInput } from './types'

export const MAX_JOB_REPORTS = 25

let nextReportId = 1
let reports: JobReport[] = []
const listeners = new Set<() => void>()

/** Подпись бэкенда для статусной строки и отчёта: «WebGPU» или «WASM ×N». */
export function formatBackend(backend: JobBackend, threads = 1): string {
  if (backend === 'webgpu') return 'WebGPU'
  if (backend === 'wasm') return `WASM ×${Math.max(1, Math.floor(threads))}`
  return 'unknown'
}

/** Строит отчёт о ресурсах задачи по времени старта/конца, интервалам запросов, бэкенду и числу потоков. */
export function buildJobReport(input: JobReportInput): JobReport {
  const duration = Math.max(0, input.end - input.start)
  const backend: JobBackend = input.backend === 'wasm' || input.backend === 'webgpu' ? input.backend : 'unknown'
  const threads = input.threads !== undefined && input.threads > 0 ? Math.floor(input.threads) : backend !== 'unknown' ? 1 : 0

  const busyMs = input.spans && input.spans.length > 0
    ? input.spans.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0)
    : duration
  const rawShare = duration > 0 ? Math.max(0, busyMs / duration) : 1
  const share = Math.min(1, rawShare)

  const busyShare = backend === 'unknown' && input.kind === 'download'
    ? unavailable('resources.unavailable.noWorker')
    : estimated(share, 'ratio', 'resources.note.busyShare')

  const coreEquivalent = threads > 0
    ? estimated(Math.min(threads, rawShare * threads), 'cores', 'resources.note.coreEquivalent')
    : unavailable('resources.unavailable.backend')

  return {
    id: input.id ?? nextReportId++,
    kind: input.kind,
    ...(input.name !== undefined && { name: input.name }),
    backend,
    threads,
    durationMs: measured(duration, 'ms'),
    busyShare,
    coreEquivalent,
    ...(input.triangles !== undefined && { triangles: measured(input.triangles, 'triangles') }),
    ...(input.gpuProfile !== undefined && { gpuProfile: input.gpuProfile }),
    ...(input.gpuMemoryBytes !== undefined && {
      gpuMemoryBytes: estimated(input.gpuMemoryBytes, 'B', 'resources.note.gpuMemory'),
    }),
    finishedAt: input.finishedAt ?? Date.now(),
  }
}

export function recordJobReport(input: JobReportInput): JobReport {
  const r = buildJobReport(input)
  reports = [r, ...reports].slice(0, MAX_JOB_REPORTS)
  listeners.forEach((l) => l())
  return r
}

export function getJobReports(): readonly JobReport[] {
  return reports
}

export function subscribeJobReports(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function clearJobReports(): void {
  reports = []
  nextReportId = 1
  listeners.forEach((l) => l())
}
