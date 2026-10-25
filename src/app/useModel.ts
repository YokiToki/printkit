import { useEffect, useRef, useState } from 'react'
import { ModelClient, type WorkerLike } from '../geometry/modelClient'
import { log, startJob, type Job } from './activityLog'
import { reportResult } from './modelLog'
import type { ModeId, ModeParams, ModelResult } from '../geometry/model'

let shared: ModelClient | undefined
/** Общий клиент с воркером. Создаётся лениво, чтобы тесты не поднимали Worker. */
export function getModelClient(): ModelClient {
  shared ??= new ModelClient(new Worker(new URL('../geometry/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike)
  return shared
}

export interface UseModelOptions {
  /** Пауза перед запуском генерации, мс: быстрые правки склеиваются. */
  debounce?: number
  client?: Pick<ModelClient, 'generate'>
  /** false — параметры невалидны: ничего не генерируем, прежняя сетка остаётся, экспорт считается устаревшим. */
  enabled?: boolean
  /** Ключи ошибок проверки параметров: пока они есть, модель не строится, а журнал получает предупреждение. */
  invalid?: string[]
}

/**
 * Генерация модели вне основного потока: debounce, побеждает последний запрос, прежняя модель остаётся при ошибке.
 * Каждая реальная генерация — задача журнала `startJob` (она же включает индикатор в строке состояния).
 */
export function useModel<M extends ModeId>(mode: M, params: ModeParams[M], opts: UseModelOptions = {}) {
  const { debounce = 150, client, enabled = true, invalid } = opts
  const [model, setModel] = useState<ModelResult | null>(null)
  /** Параметры изменились, а сетка ещё старая: экспортировать её нельзя. */
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const clientRef = useRef(client)
  clientRef.current = client
  const seen = useRef('')
  const invalidKey = (invalid ?? []).join(' ')
  const reported = useRef('')

  useEffect(() => {
    if (invalidKey === reported.current) return
    reported.current = invalidKey
    for (const k of invalidKey ? invalidKey.split(' ') : []) log.warn('model', k)
  }, [invalidKey])

  useEffect(() => {
    if (!enabled) { setPending(true); return }
    let cancelled = false
    let job: Job | undefined
    setPending(true)
    const timer = setTimeout(() => {
      const c = clientRef.current ?? getModelClient()
      const started = performance.now()
      job = startJob({ source: 'model', key: 'log.model.start' })
      const mine = job
      c.generate(mode, params).then(
        (m) => {
          if (cancelled || !m) return // устарело
          // режим сообщил об ошибке построения (rackPanel: узор разрезал панель): прежняя сетка остаётся, экспорт считается устаревшим
          reportResult(mine, m, performance.now() - started, seen)
          if (m.rack?.error) { setError(m.rack.error); return }
          setModel(m); setError(null); setPending(false)
        },
        (e: Error) => { if (!cancelled) { mine.fail('log.model.failed', undefined, e.message); setError(e.message); setPending(false) } },
      )
    }, debounce)
    return () => { cancelled = true; clearTimeout(timer); job?.discard() }
  }, [mode, params, debounce, enabled])

  return { model, pending, error }
}
