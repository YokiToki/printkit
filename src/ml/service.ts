import { memoryFallback, startJob, type Job } from '../app/activityLog'
import { fmtSize } from '../app/logText'
import { aggregateKernels, getDiagnostics, unavailableGpuProfile } from '../app/resources/diagnostics'
import { estimateModelGpuMemory } from '../app/resources/gpuInfo'
import { formatBackend, recordJobReport } from '../app/resources/jobs'
import { refineObjects } from '../geometry/photo/aiRefine'
import type { Rectified } from '../geometry/photo/homography'
import { availability, detectCapabilities, type Capabilities } from './capabilities'
import { defaultWasmThreads, MlAbortError, MlClient, type MlWorkerLike } from './mlClient'
import { modelStore, type ModelStore } from './modelStore'
import type { Backend, ModelSpec } from './models'

export class MlUnavailableError extends Error { constructor(public reason: 'noModel' | 'unavailable' | 'noColour' | 'superseded') { super(reason) } }

export interface SilhouetteRunOptions {
  /** Второй проход по каждому найденному предмету (чётче контур, +1 запуск сети на предмет). */
  secondPass: boolean
  /** Параметры очистки маски для поиска предметов перед вторым проходом. */
  mask?: { threshold: number; smooth: number }
}

interface SessionInfo { backend: Backend; threads: number; backendLabel: string }
type Span = { start: number; end: number }

/**
 * Единственное место, которое запускает нейросеть: берёт веса из хранилища, поднимает сессию в воркере, ведёт задачи журнала
 * источника `ai` (строки — ключи перевода, прогресс на месте) и отдаёт готовую альфу выпрямленного листа. Скачивание весов здесь
 * не запускается никогда: нет модели — `MlUnavailableError('noModel')`, скачать её можно только из менеджера моделей.
 */
export function createMlService(deps: { client: Pick<MlClient, 'load' | 'matte' | 'cancel'> & Partial<Pick<MlClient, 'depth' | 'threads' | 'lastSpans' | 'lastKernels' | 'resetRun'>> & { onPhase?: MlClient['onPhase'] }; store: ModelStore; caps: () => Promise<Capabilities>; threads?: number }) {
  const { client, store } = deps
  let loadedId: string | null = null
  let capsCache: Promise<Capabilities> | null = null
  const caps = () => (capsCache ??= deps.caps())
  const getThreads = () => deps.threads ?? client.threads ?? defaultWasmThreads()

  /** Поднимает сессию модели в воркере, если ещё не поднята: доступность, веса (граф и файл данных), бэкенд. */
  async function session(spec: ModelSpec, job: Job, spans: Span[]): Promise<SessionInfo> {
    const av = availability(spec, await caps())
    if (!av.ok) throw new MlUnavailableError('unavailable')
    const bytes = await store.read(spec)
    if (!bytes) throw new MlUnavailableError('noModel')
    const data = spec.data ? await store.readData(spec) : null
    if (spec.data && !data) throw new MlUnavailableError('noModel')
    const threads = av.backend === 'webgpu' ? 1 : getThreads()
    const backendLabel = formatBackend(av.backend, threads)
    if (loadedId !== spec.id) {
      job.update({ key: 'log.ai.session', params: { backend: backendLabel } })
      const s0 = performance.now()
      await client.load(spec, bytes, av.backend, data ?? undefined)
      spans.push({ start: s0, end: performance.now() })
      loadedId = spec.id
    }
    return { backend: av.backend, threads, backendLabel }
  }

  /** Один запуск сети: сессия, первый проход и сообщение в журнал. */
  async function matte(spec: ModelSpec, rgb: Uint8Array, w: number, h: number, job: Job, spans: Span[], line = 'log.ai.firstPass'): Promise<{ alpha: Float32Array; info: SessionInfo }> {
    const info = await session(spec, job, spans)
    job.update({ key: line, params: { backend: info.backendLabel } })
    const s0 = performance.now()
    const alpha = await client.matte(spec, rgb, w, h)
    spans.push({ start: s0, end: performance.now() })
    if (!alpha) throw new MlUnavailableError('superseded')
    return { alpha, info }
  }

  /** Обёртка задачи журнала источника `ai`: старт, отмена, итог, ошибка. */
  async function run<T>(spec: ModelSpec, body: (job: Job, spans: Span[]) => Promise<{ out: T; info: SessionInfo }>): Promise<T> {
    const t0 = performance.now(), spans: Span[] = []
    client.resetRun?.()
    const job = startJob({ source: 'ai', key: 'log.ai.run', params: { name: spec.name }, cancel: () => { client.cancel(); loadedId = null } })
    try {
      const { out, info } = await body(job, spans)
      const end = performance.now(), wallMs = Math.max(0.01, end - t0)
      const usedSpans = client.lastSpans?.length ? client.lastSpans : spans
      const kernels = client.lastKernels
      const gpuProfile = info.backend === 'webgpu'
        ? (getDiagnostics() ? (kernels?.length ? aggregateKernels(kernels, wallMs) : unavailableGpuProfile('resources.unavailable.timestampQuery')) : unavailableGpuProfile('resources.unavailable.diagnosticsOff'))
        : undefined
      const gpuMemoryBytes = info.backend === 'webgpu' ? (estimateModelGpuMemory(spec).value ?? undefined) : undefined
      const report = recordJobReport({
        id: job.id, kind: 'ai', name: spec.name, start: t0, end,
        backend: info.backend, threads: info.threads, spans: usedSpans, gpuProfile, gpuMemoryBytes,
      })
      job.done('log.ai.runDone', {
        name: spec.name, seconds: ((end - t0) / 1000).toFixed(1),
        backend: info.backendLabel, busy: Math.round((report.busyShare.value ?? 1) * 100),
      })
      return out
    } catch (e) {
      if (e instanceof MlAbortError) { loadedId = null; job.cancelled('log.ai.runCancelled') } // воркер закрыт отменой: сессии в нём больше нет
      else if (e instanceof MlUnavailableError && e.reason === 'superseded') job.discard()
      else if (e instanceof MlUnavailableError) job.discard() // нет модели или устройство не подходит: это не сбой запуска, сообщение у кнопки
      else { loadedId = null; job.fail('log.ai.runFailed', { name: spec.name }, e instanceof Error ? e.message : String(e)) }
      throw e
    }
  }

  return {
    capabilities: caps,

    /** Скачивает модель: вызывать только после подтверждения в менеджере моделей. Ошибки остаются в состоянии хранилища и в журнале. */
    async downloadModel(spec: ModelSpec): Promise<void> {
      const mb = (n: number) => (n / 1048576).toFixed(0)
      const t0 = performance.now()
      const job = startJob({ source: 'ai', key: 'log.ai.download', params: { name: spec.name, loaded: 0, total: mb(spec.bytes) }, cancel: () => store.cancel(spec.id) })
      await store.download(spec, (loaded, total) => job.update({ key: 'log.ai.download', params: { name: spec.name, loaded: mb(loaded), total: mb(total) }, progress: loaded / total }))
      const st = store.status(spec.id)
      if (st.state === 'ready') {
        const end = performance.now()
        recordJobReport({ id: job.id, kind: 'download', name: spec.name, start: t0, end, backend: 'unknown', threads: 0, spans: [{ start: t0, end }] })
        job.done('log.ai.downloaded', { name: spec.name, size: fmtSize(spec.bytes), seconds: ((end - t0) / 1000).toFixed(1), backend: 'fetch', busy: 100 })
        if (!store.persistent) memoryFallback('models')
      } else if (st.state === 'failed') job.fail('log.ai.downloadFailed', { name: spec.name, reason: `log.ai.reason.${st.error}` }, st.detail)
      else job.cancelled('log.ai.downloadCancelled', { name: spec.name })
    },

    /** Альфа предметов на выпрямленном листе. Бросает MlUnavailableError, MlAbortError или ошибку сети/сессии. */
    async silhouetteAlpha(spec: ModelSpec, r: Rectified, opts: SilhouetteRunOptions): Promise<Float32Array> {
      if (!r.rgb) throw new MlUnavailableError('noColour')
      const { width: w, height: h } = r.image
      return run(spec, async (job, spans) => {
        const { alpha: first, info } = await matte(spec, r.rgb!, w, h, job, spans)
        let alpha = first
        if (opts.secondPass) {
          alpha = await refineObjects(r, alpha, async (rgb, cw, ch) => {
            const s0 = performance.now()
            const a = await client.matte(spec, rgb, cw, ch)
            spans.push({ start: s0, end: performance.now() })
            if (!a) throw new MlUnavailableError('superseded')
            return a
          }, opts.mask, (done, total) => job.update({ key: 'log.ai.object', params: { i: done, n: total, backend: info.backendLabel } }))
        }
        return { out: alpha, info }
      })
    },

    /**
     * Мягкая альфа главного предмета на всей картинке (RGB подряд, w × h): пропорции сохраняются, вход вписывается в квадрат модели
     * с полями среднего цвета, выход обрезается обратно. Брелок: один предмет, поэтому второго прохода нет.
     */
    async matteAlpha(spec: ModelSpec, rgb: Uint8Array, w: number, h: number): Promise<Float32Array> {
      return run(spec, async (job, spans) => {
        const { alpha, info } = await matte(spec, rgb, w, h, job, spans, 'log.ai.firstPassImage')
        return { out: alpha, info }
      })
    },

    /** Карта глубины 0…1 размера w × h (модель вида depth); картинка RGB подряд, пропорции сохраняются. */
    async depthMap(spec: ModelSpec, rgb: Uint8Array, h_or_w: number, h: number): Promise<Float32Array> {
      return run(spec, async (job, spans) => {
        const info = await session(spec, job, spans)
        job.update({ key: 'log.ai.depthPass', params: { backend: info.backendLabel } })
        const s0 = performance.now()
        const d = await client.depth!(spec, rgb, h_or_w, h)
        spans.push({ start: s0, end: performance.now() })
        if (!d) throw new MlUnavailableError('superseded')
        return { out: d, info }
      })
    },
  }
}

export type MlService = ReturnType<typeof createMlService>

let real: MlService | null = null
/** Общий сервис приложения: воркер создаётся только при первом запуске ИИ (динамически), классический путь его не касается. */
export function getMlService(): MlService {
  return (real ??= createMlService({
    client: new MlClient(() => new Worker(new URL('./ml.worker.ts', import.meta.url), { type: 'module' }) as unknown as MlWorkerLike),
    store: modelStore,
    caps: () => detectCapabilities(),
  }))
}
