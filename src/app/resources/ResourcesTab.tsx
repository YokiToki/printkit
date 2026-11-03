import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '../../ui/Button'
import { Toggle } from '../../ui/Toggle'
import { MODELS } from '../../ml/models'
import { useActivityLog } from '../activityLog'
import { fmtSize } from '../logText'
import { getDiagnostics, useDiagnostics } from './diagnostics'
import { estimateModelGpuMemory, readGpuInfo, type GpuInfoSnapshot } from './gpuInfo'
import { formatBackend, getJobReports, subscribeJobReports } from './jobs'
import { createLongTasksCollector, type LongTasksCollector, type LongTasksSnapshot } from './longTasks'
import { readMemorySnapshot, type MemorySnapshot } from './memory'
import { createPressureCollector, PRESSURE_LEVELS, type PressureCollector, type PressureLevel, type PressureSnapshot } from './pressure'
import { getRenderSnapshot, subscribeRenderSnapshot, type RenderSnapshot } from './render'
import { measured, unavailable, type JobReport, type KernelTiming, type ResourceValue } from './types'

let sharedLongTasks: LongTasksCollector | null = null
let sharedPressure: PressureCollector | null = null

export function getSharedCollectors() {
  sharedLongTasks ??= createLongTasksCollector()
  sharedPressure ??= createPressureCollector()
  return { longTasks: sharedLongTasks, pressure: sharedPressure }
}

export function resetSharedCollectors() {
  sharedLongTasks?.stop()
  sharedPressure?.stop()
  sharedLongTasks = null
  sharedPressure = null
}

export interface ResourcesDeps {
  longTasks?: LongTasksCollector
  pressure?: PressureCollector
  gpuInfo?: () => Promise<GpuInfoSnapshot>
  memory?: () => Promise<MemorySnapshot>
}

const defaultGpuInfo = (): GpuInfoSnapshot => ({
  supported: false,
  timestampQuery: false,
  adapterName: unavailable('resources.unavailable.webgpu'),
  architecture: unavailable('resources.unavailable.webgpu'),
  maxBufferBytes: unavailable('resources.unavailable.webgpu'),
})

const defaultMemory = (): MemorySnapshot => ({
  modelCacheBytes: measured(0, 'B'),
  storageUsageBytes: unavailable('resources.unavailable.storageEstimate'),
  storageQuotaBytes: unavailable('resources.unavailable.storageEstimate'),
  jsHeapBytes: unavailable('resources.unavailable.jsHeap'),
  wasmMemoryBytes: unavailable('resources.unavailable.wasmMemory'),
})

function provenanceTooltip(t: TFunction, v: ResourceValue<unknown>): string {
  const src = t(`resources.source.${v.source}`)
  return v.note ? `${src}: ${t(v.note)}` : src
}

/** Форматирует значение метрики; оценочные значения никогда не получают знак «%». */
export function formatResourceValue(t: TFunction, v: ResourceValue<unknown>): string {
  if (v.source === 'unavailable' || v.value === null || v.value === undefined) {
    return t('resources.source.unavailable')
  }
  if (typeof v.value === 'string') {
    if (v.value === 'nominal' || v.value === 'fair' || v.value === 'serious' || v.value === 'critical') {
      return t(`resources.cpu.level.${v.value}`)
    }
    return v.value
  }
  if (typeof v.value === 'number') {
    if (v.unit === 'B') return fmtSize(v.value)
    if (v.unit === 'ms') return `${v.value >= 10 ? Math.round(v.value) : v.value.toFixed(1)} ms`
    if (v.unit === 'ratio') return v.value.toFixed(2)
    if (v.unit === 'cores') return `${v.value.toFixed(2)} ${t('resources.unit.cores')}`
    if (v.unit === 'triangles') return `${Math.round(v.value)} ${t('resources.unit.triangles')}`
    if (v.unit === 'calls') return `${Math.round(v.value)} ${t('resources.unit.calls')}`
    if (v.unit === '%' && v.source === 'measured') return `${v.value.toFixed(1)} %`
    return String(Math.round(v.value * 100) / 100)
  }
  if (typeof v.value === 'object') {
    const rec = v.value as Record<PressureLevel, number>
    return PRESSURE_LEVELS.map((lvl) => `${t(`resources.cpu.level.${lvl}`)} ${(rec[lvl] / 1000).toFixed(1)} s`).join(' · ')
  }
  return String(v.value)
}

function formatKernels(v: readonly KernelTiming[]): ResourceValue<string | null> {
  if (!v.length) return unavailable(getDiagnostics() ? 'resources.unavailable.noJob' : 'resources.unavailable.diagnosticsOff')
  return measured(v.map((k) => `${k.name} (${k.ms.toFixed(1)} ms ×${k.calls})`).join(', '))
}

const BADGE_STYLE: Record<ResourceValue<unknown>['source'], string> = {
  measured: 'border-border-strong bg-surface-2 text-text',
  estimated: 'border-border-strong bg-surface-3 text-text-muted',
  unavailable: 'border-border bg-bg text-text-subtle',
}

function ValueRow({ label, val }: { label: string; val: ResourceValue<unknown> }) {
  const { t } = useTranslation()
  const tip = provenanceTooltip(t, val)
  const formatted = formatResourceValue(t, val)
  const isMulti = typeof val.value === 'object' && val.value !== null
  const isLong = formatted.length > 25

  if (isMulti || isLong) {
    return (
      <div className="min-w-0 py-0.5 text-[11px]">
        <div className="flex items-baseline justify-between gap-1.5">
          <span className="text-text-muted">{label}</span>
          <span
            data-testid="resource-provenance"
            title={tip}
            className={`shrink-0 rounded-control border px-1 py-px font-sans text-[9px] leading-tight ${BADGE_STYLE[val.source]}`}
          >
            {t(`resources.source.${val.source}`)}
          </span>
        </div>
        <div className="mt-0.5 break-words font-mono text-text text-right">
          {formatted}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-baseline justify-between gap-1.5 py-0.5 text-[11px]">
      <span className="truncate text-text-muted">{label}</span>
      <span className="inline-flex shrink-0 items-baseline gap-1 text-right font-mono text-text">
        <span className="break-words">{formatted}</span>
        <span
          data-testid="resource-provenance"
          title={tip}
          className={`shrink-0 rounded-control border px-1 py-px font-sans text-[9px] leading-tight ${BADGE_STYLE[val.source]}`}
        >
          {t(`resources.source.${val.source}`)}
        </span>
      </span>
    </div>
  )
}

function ValueCell({ val }: { val: ResourceValue<unknown> }) {
  const { t } = useTranslation()
  const tip = provenanceTooltip(t, val)
  return (
    <span className="inline-flex items-baseline gap-1 font-mono">
      <span>{formatResourceValue(t, val)}</span>
      <span
        data-testid="resource-provenance"
        title={tip}
        className={`rounded-control border px-1 py-px font-sans text-[10px] leading-tight ${BADGE_STYLE[val.source]}`}
      >
        {t(`resources.source.${val.source}`)}
      </span>
    </span>
  )
}

function jobTitle(t: TFunction, r: JobReport): string {
  if (r.kind === 'rebuild') return t('resources.jobs.rebuild')
  return r.name ?? r.kind
}

export function buildSupportSummary(
  t: TFunction,
  p: { pressure: boolean; longTasks: boolean; webgpu: boolean; timerQuery: boolean },
): string {
  const items: [string, boolean][] = [
    [t('resources.support.pressure'), p.pressure],
    [t('resources.support.longTasks'), p.longTasks],
    [t('resources.support.webgpu'), p.webgpu],
    [t('resources.support.timerQuery'), p.timerQuery],
  ]
  return items
    .map(([name, ok]) => `${name}: ${ok ? t('resources.support.available') : t('resources.support.unavailable')}`)
    .join(' · ')
}

/** Текстовый снимок вкладки «Ресурсы» для кнопки «Копировать» в панели журнала. */
export function formatResourcesReport(
  t: TFunction,
  snap?: {
    longTasks?: LongTasksSnapshot
    pressure?: PressureSnapshot
    gpu?: GpuInfoSnapshot
    mem?: MemorySnapshot
    render?: RenderSnapshot
    jobs?: readonly JobReport[]
  },
): string {
  const shared = getSharedCollectors()
  const lt = snap?.longTasks ?? shared.longTasks.snapshot()
  const pr = snap?.pressure ?? shared.pressure.snapshot()
  const gpu = snap?.gpu ?? defaultGpuInfo()
  const mem = snap?.mem ?? defaultMemory()
  const ren = snap?.render ?? getRenderSnapshot()
  const jobs = snap?.jobs ?? getJobReports()
  const lastJob = jobs[0]
  const lastGpuJob = jobs.find((j) => j.backend === 'webgpu')
  const fmt = (label: string, v: ResourceValue<unknown>) =>
    `  ${label}: ${formatResourceValue(t, v)} [${provenanceTooltip(t, v)}]`

  const lines: string[] = [
    `=== ${t('resources.tabResources')} ===`,
    buildSupportSummary(t, {
      pressure: pr.supported,
      longTasks: lt.supported,
      webgpu: gpu.supported,
      timerQuery: ren.timerQuerySupported,
    }),
    `${t('resources.group.cpu')}:`,
    fmt(t('resources.cpu.busyShare'), lastJob?.busyShare ?? unavailable('resources.unavailable.noJob')),
    fmt(t('resources.cpu.coreEquivalent'), lastJob?.coreEquivalent ?? unavailable('resources.unavailable.noJob')),
    fmt(t('resources.cpu.mainBlocked'), lt.blockedPercent),
    fmt(t('resources.cpu.longestBlock'), lt.longestBlockMs),
    fmt(t('resources.cpu.pressureLevel'), pr.level),
    `${t('resources.group.gpu')}:`,
    fmt(t('resources.gpu.adapter'), gpu.adapterName),
    fmt(t('resources.gpu.architecture'), gpu.architecture),
    fmt(t('resources.gpu.modelMemory'), lastGpuJob?.gpuMemoryBytes ?? estimateModelGpuMemory(MODELS[3])),
    fmt(t('resources.gpu.renderTriangles'), ren.triangles),
    fmt(t('resources.gpu.renderDrawCalls'), ren.drawCalls),
    fmt(t('resources.gpu.renderSubmit'), ren.submitMs),
    fmt(t('resources.gpu.renderGpuTime'), ren.gpuMs),
    `${t('resources.group.memory')}:`,
    fmt(t('resources.memory.modelCache'), mem.modelCacheBytes),
    fmt(t('resources.memory.storageUsage'), mem.storageUsageBytes),
    fmt(t('resources.memory.storageQuota'), mem.storageQuotaBytes),
    fmt(t('resources.memory.jsHeap'), mem.jsHeapBytes),
    fmt(t('resources.memory.wasmMemory'), mem.wasmMemoryBytes),
  ]
  if (jobs.length > 0) {
    lines.push(`${t('resources.jobs.title')}:`)
    for (const j of jobs) {
      lines.push(
        `  - ${jobTitle(t, j)} | ${formatBackend(j.backend, j.threads)} | ${formatResourceValue(t, j.durationMs)} | busy ${formatResourceValue(t, j.busyShare)}`,
      )
    }
  }
  return lines.join('\n')
}

export function ResourcesTab({ deps }: { deps?: ResourcesDeps }) {
  const { t } = useTranslation()
  const log = useActivityLog()
  const [diagnostics, setDiagnostics] = useDiagnostics()
  const jobs = useSyncExternalStore(subscribeJobReports, getJobReports, getJobReports)
  const renderSnap = useSyncExternalStore(subscribeRenderSnapshot, getRenderSnapshot, getRenderSnapshot)

  const shared = getSharedCollectors()
  const ltCollector = deps?.longTasks ?? shared.longTasks
  const prCollector = deps?.pressure ?? shared.pressure
  const getGpu = deps?.gpuInfo ?? (() => readGpuInfo())
  const getMem = deps?.memory ?? (() => readMemorySnapshot())

  const [ltSnap, setLtSnap] = useState<LongTasksSnapshot>(() => ltCollector.snapshot())
  const [prSnap, setPrSnap] = useState<PressureSnapshot>(() => prCollector.snapshot())
  const [gpuSnap, setGpuSnap] = useState<GpuInfoSnapshot>(defaultGpuInfo)
  const [memSnap, setMemSnap] = useState<MemorySnapshot>(defaultMemory)
  const hasRunningJob = log.jobs.length > 0

  // Поднимаем наблюдатели при открытии вкладки и отключаем при закрытии
  useEffect(() => {
    ltCollector.start()
    prCollector.start()
    setLtSnap(ltCollector.snapshot())
    setPrSnap(prCollector.snapshot())
    let alive = true
    void getGpu().then((g) => { if (alive) setGpuSnap(g) })
    void getMem().then((m) => { if (alive) setMemSnap(m) })
    return () => {
      alive = false
      ltCollector.stop()
      prCollector.stop()
    }
  }, [ltCollector, prCollector]) // eslint-disable-line react-hooks/exhaustive-deps

  // Обновляем снимки при завершении задач и раз в секунду, пока идёт задача
  useEffect(() => {
    const refresh = () => {
      setLtSnap(ltCollector.snapshot())
      setPrSnap(prCollector.snapshot())
      void getMem().then(setMemSnap)
    }
    refresh()
    if (!hasRunningJob) return
    const id = setInterval(refresh, 1000)
    return () => clearInterval(id)
  }, [hasRunningJob, jobs.length, diagnostics, ltCollector, prCollector]) // eslint-disable-line react-hooks/exhaustive-deps

  const lastJob = jobs[0]
  const lastGpuJob = jobs.find((j) => j.backend === 'webgpu')
  const defaultDiagReason = diagnostics ? 'resources.unavailable.noJob' : 'resources.unavailable.diagnosticsOff'
  const aiGpuTime = lastGpuJob?.gpuProfile?.gpuMs ?? unavailable(defaultDiagReason)
  const aiWallRatio = lastGpuJob?.gpuProfile?.wallRatio ?? unavailable(defaultDiagReason)
  const slowestKernels = formatKernels(lastGpuJob?.gpuProfile?.slowest ?? [])
  const modelGpuMem = lastGpuJob?.gpuMemoryBytes ?? (gpuSnap.supported ? estimateModelGpuMemory(MODELS[3]) : unavailable('resources.unavailable.webgpu'))

  const supportLine = buildSupportSummary(t, {
    pressure: prSnap.supported,
    longTasks: ltSnap.supported,
    webgpu: gpuSnap.supported,
    timerQuery: renderSnap.timerQuerySupported,
  })

  const [copied, setCopied] = useState(false)
  const copyResources = async () => {
    try {
      await navigator.clipboard.writeText(
        formatResourcesReport(t, {
          longTasks: ltSnap,
          pressure: prSnap,
          gpu: gpuSnap,
          mem: memSnap,
          render: renderSnap,
          jobs,
        }),
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div data-testid="resources-tab" className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 py-1.5 text-xs">
      <div className="flex flex-col gap-1 border-b border-border pb-1.5 md:flex-row md:items-center md:justify-between text-[11px]">
        <p data-testid="resources-support-summary" className="m-0 text-text-muted">{supportLine}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button compact onClick={() => void copyResources()}>{copied ? t('log.copied') : t('log.copy')}</Button>
          <Toggle compact label={t('resources.diagnostics.label')} checked={diagnostics} onChange={setDiagnostics} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <section aria-label={t('resources.group.cpu')} className="min-w-0 overflow-hidden rounded-group border border-border bg-surface-2 p-2">
          <h3 className="m-0 mb-1 text-xs font-semibold text-text">{t('resources.group.cpu')}</h3>
          <ValueRow label={t('resources.cpu.busyShare')} val={lastJob?.busyShare ?? unavailable('resources.unavailable.noJob')} />
          <ValueRow label={t('resources.cpu.coreEquivalent')} val={lastJob?.coreEquivalent ?? unavailable('resources.unavailable.noJob')} />
          <ValueRow label={t('resources.cpu.mainBlocked')} val={ltSnap.blockedPercent} />
          <ValueRow label={t('resources.cpu.longestBlock')} val={ltSnap.longestBlockMs} />
          <ValueRow label={t('resources.cpu.pressureLevel')} val={prSnap.level} />
          <ValueRow label={t('resources.cpu.pressureTimes')} val={prSnap.timeByLevelMs} />
        </section>

        <section aria-label={t('resources.group.gpu')} className="min-w-0 overflow-hidden rounded-group border border-border bg-surface-2 p-2">
          <h3 className="m-0 mb-1 text-xs font-semibold text-text">{t('resources.group.gpu')}</h3>
          <ValueRow label={t('resources.gpu.adapter')} val={gpuSnap.adapterName} />
          <ValueRow label={t('resources.gpu.architecture')} val={gpuSnap.architecture} />
          <ValueRow label={t('resources.gpu.modelMemory')} val={modelGpuMem} />
          <ValueRow label={t('resources.gpu.aiGpuTime')} val={aiGpuTime} />
          <ValueRow label={t('resources.gpu.aiWallRatio')} val={aiWallRatio} />
          <ValueRow label={t('resources.gpu.slowestKernels')} val={slowestKernels} />
          <ValueRow label={t('resources.gpu.renderTriangles')} val={renderSnap.triangles} />
          <ValueRow label={t('resources.gpu.renderDrawCalls')} val={renderSnap.drawCalls} />
          <ValueRow label={t('resources.gpu.renderSubmit')} val={renderSnap.submitMs} />
          <ValueRow label={t('resources.gpu.renderGpuTime')} val={renderSnap.gpuMs} />
        </section>

        <section aria-label={t('resources.group.memory')} className="min-w-0 overflow-hidden rounded-group border border-border bg-surface-2 p-2">
          <h3 className="m-0 mb-1 text-xs font-semibold text-text">{t('resources.group.memory')}</h3>
          <ValueRow label={t('resources.memory.modelCache')} val={memSnap.modelCacheBytes} />
          <ValueRow label={t('resources.memory.storageUsage')} val={memSnap.storageUsageBytes} />
          <ValueRow label={t('resources.memory.storageQuota')} val={memSnap.storageQuotaBytes} />
          <ValueRow label={t('resources.memory.jsHeap')} val={memSnap.jsHeapBytes} />
          <ValueRow label={t('resources.memory.wasmMemory')} val={memSnap.wasmMemoryBytes} />
        </section>
      </div>

      <section aria-label={t('resources.jobs.title')} className="rounded-group border border-border bg-surface-2 p-2">
        <h3 className="m-0 mb-1 text-xs font-semibold text-text">{t('resources.jobs.title')}</h3>
        {jobs.length === 0 ? (
          <p className="m-0 text-text-muted text-[11px]">{t('resources.jobs.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="resources-jobs-table" className="w-full border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="py-0.5 pr-2 font-medium">{t('resources.jobs.colWhat')}</th>
                  <th className="py-0.5 pr-2 font-medium">{t('resources.jobs.colBackend')}</th>
                  <th className="py-0.5 pr-2 font-medium">{t('resources.jobs.colDuration')}</th>
                  <th className="py-0.5 pr-2 font-medium">{t('resources.jobs.colBusy')}</th>
                  <th className="py-0.5 pr-2 font-medium">{t('resources.jobs.colGpuTime')}</th>
                  <th className="py-0.5 font-medium">{t('resources.jobs.colTriangles')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="py-0.5 pr-2 text-text">{jobTitle(t, r)}</td>
                    <td className="py-0.5 pr-2 font-mono text-text">{formatBackend(r.backend, r.threads)}</td>
                    <td className="py-0.5 pr-2"><ValueCell val={r.durationMs} /></td>
                    <td className="py-0.5 pr-2"><ValueCell val={r.busyShare} /></td>
                    <td className="py-0.5 pr-2">
                      <ValueCell val={r.gpuProfile?.gpuMs ?? unavailable(r.backend === 'webgpu' ? defaultDiagReason : 'resources.unavailable.webgpu')} />
                    </td>
                    <td className="py-0.5">
                      {r.triangles ? <ValueCell val={r.triangles} /> : <span className="text-text-subtle">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
