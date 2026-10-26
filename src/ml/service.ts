import { memoryFallback, startJob, type Job } from '../app/activityLog'
import { fmtSize } from '../app/logText'
import { refineObjects } from '../geometry/photo/aiRefine'
import type { Rectified } from '../geometry/photo/homography'
import { availability, detectCapabilities, type Capabilities } from './capabilities'
import { MlAbortError, MlClient, type MlWorkerLike } from './mlClient'
import { modelStore, type ModelStore } from './modelStore'
import type { ModelSpec } from './models'

export class MlUnavailableError extends Error { constructor(public reason: 'noModel' | 'unavailable' | 'noColour' | 'superseded') { super(reason) } }

export interface SilhouetteRunOptions {
  /** Второй проход по каждому найденному предмету (чётче контур, +1 запуск сети на предмет). */
  secondPass: boolean
  /** Параметры очистки маски для поиска предметов перед вторым проходом. */
  mask?: { threshold: number; smooth: number }
}

/**
 * Единственное место, которое запускает нейросеть: берёт веса из хранилища, поднимает сессию в воркере, ведёт задачи журнала
 * источника `ai` (строки — ключи перевода, прогресс на месте) и отдаёт готовую альфу выпрямленного листа. Скачивание весов здесь
 * не запускается никогда: нет модели — `MlUnavailableError('noModel')`, скачать её можно только из менеджера моделей.
 */
export function createMlService(deps: { client: Pick<MlClient, 'load' | 'matte' | 'cancel'> & { onPhase?: MlClient['onPhase'] }; store: ModelStore; caps: () => Promise<Capabilities> }) {
  const { client, store } = deps
  let loadedId: string | null = null
  let capsCache: Promise<Capabilities> | null = null
  const caps = () => (capsCache ??= deps.caps())

  /** Один запуск сети: доступность, веса, сессия (если ещё не поднята), первый проход и сообщение в журнал. */
  async function matte(spec: ModelSpec, rgb: Uint8Array, w: number, h: number, job: Job, line = 'log.ai.firstPass'): Promise<Float32Array> {
    const av = availability(spec, await caps())
    if (!av.ok) throw new MlUnavailableError('unavailable')
    const bytes = await store.read(spec)
    if (!bytes) throw new MlUnavailableError('noModel')
    if (loadedId !== spec.id) {
      job.update({ key: 'log.ai.session', params: { backend: av.backend.toUpperCase() } })
      await client.load(spec, bytes, av.backend)
      loadedId = spec.id
    }
    job.update({ key: line })
    const alpha = await client.matte(spec, rgb, w, h)
    if (!alpha) throw new MlUnavailableError('superseded')
    return alpha
  }

  /** Обёртка задачи журнала источника `ai`: старт, отмена, итог, ошибка. */
  async function run<T>(spec: ModelSpec, body: (job: Job) => Promise<T>): Promise<T> {
    const t0 = performance.now()
    const job = startJob({ source: 'ai', key: 'log.ai.run', params: { name: spec.name }, cancel: () => { client.cancel(); loadedId = null } })
    try {
      const out = await body(job)
      job.done('log.ai.runDone', { name: spec.name, seconds: ((performance.now() - t0) / 1000).toFixed(1) })
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
      const job = startJob({ source: 'ai', key: 'log.ai.download', params: { name: spec.name, loaded: 0, total: mb(spec.bytes) }, cancel: () => store.cancel(spec.id) })
      await store.download(spec, (loaded, total) => job.update({ key: 'log.ai.download', params: { name: spec.name, loaded: mb(loaded), total: mb(total) }, progress: loaded / total }))
      const st = store.status(spec.id)
      if (st.state === 'ready') {
        job.done('log.ai.downloaded', { name: spec.name, size: fmtSize(spec.bytes) })
        if (!store.persistent) memoryFallback('models')
      } else if (st.state === 'failed') job.fail('log.ai.downloadFailed', { name: spec.name, reason: `log.ai.reason.${st.error}` }, st.detail)
      else job.cancelled('log.ai.downloadCancelled', { name: spec.name })
    },

    /** Альфа предметов на выпрямленном листе. Бросает MlUnavailableError, MlAbortError или ошибку сети/сессии. */
    async silhouetteAlpha(spec: ModelSpec, r: Rectified, opts: SilhouetteRunOptions): Promise<Float32Array> {
      if (!r.rgb) throw new MlUnavailableError('noColour')
      const { width: w, height: h } = r.image
      return run(spec, async (job) => {
        let alpha = await matte(spec, r.rgb!, w, h, job)
        if (opts.secondPass) {
          alpha = await refineObjects(r, alpha, async (rgb, cw, ch) => {
            const a = await client.matte(spec, rgb, cw, ch)
            if (!a) throw new MlUnavailableError('superseded')
            return a
          }, opts.mask, (done, total) => job.update({ key: 'log.ai.object', params: { i: done, n: total } }))
        }
        return alpha
      })
    },

    /**
     * Мягкая альфа главного предмета на всей картинке (RGB подряд, w × h): пропорции сохраняются, вход вписывается в квадрат модели
     * с полями среднего цвета, выход обрезается обратно. Брелок: один предмет, поэтому второго прохода нет.
     */
    async matteAlpha(spec: ModelSpec, rgb: Uint8Array, w: number, h: number): Promise<Float32Array> {
      return run(spec, (job) => matte(spec, rgb, w, h, job, 'log.ai.firstPassImage'))
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
