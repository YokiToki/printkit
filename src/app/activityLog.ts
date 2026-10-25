import { useSyncExternalStore } from 'react'

export type LogLevel = 'info' | 'warn' | 'error'
export type LogSource = 'model' | 'photo' | 'image' | 'storage' | 'export' | 'ai' | 'app'
export const LOG_SOURCES: LogSource[] = ['model', 'photo', 'image', 'storage', 'export', 'ai', 'app']
export type JobState = 'running' | 'done' | 'failed' | 'cancelled'
export type LogParams = Record<string, string | number>

/** Запись журнала: ключ и параметры, а не готовая фраза, чтобы смена языка перерисовала старые строки. */
export interface LogEntry {
  id: number
  /** Метка времени, мс. */
  time: number
  level: LogLevel
  source: LogSource
  key: string
  params?: LogParams
  /** Сырой технический текст исключения: показывается только в «Подробнее», не как текст интерфейса. */
  detail?: string
  /** Задача, к которой относится запись. */
  job?: number
}

/** Выполняющаяся задача: её текущая строка меняется на месте. */
export interface ActiveJob {
  id: number
  source: LogSource
  key: string
  params?: LogParams
  /** 0…1, если известен. */
  progress?: number
  startedAt: number
  cancelable: boolean
  /** Задача идёт дольше LOADER_DELAY: именно она включает индикатор в строке состояния. */
  loader: boolean
}

export interface LogSnapshot {
  entries: LogEntry[]
  jobs: ActiveJob[]
  /** Предупреждения и ошибки с последнего открытия или очистки журнала. */
  warnings: number
  errors: number
  open: boolean
  /** Источник, выбранный при открытии панели из другого места. */
  openSource?: LogSource
}

export interface Job {
  readonly id: number
  update(u: { key?: string; params?: LogParams; progress?: number }): void
  done(key: string, params?: LogParams): void
  fail(key: string, params?: LogParams, detail?: string): void
  cancelled(key?: string, params?: LogParams): void
  /** Задачу вытеснил новый запрос: она уходит из журнала целиком, вместе со строкой начала. */
  discard(): void
}

export const MAX_ENTRIES = 500
export const LOADER_DELAY = 200

const cancels = new Map<number, () => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()
const once = new Set<string>()
const listeners = new Set<() => void>()
let nextId = 1
let snap: LogSnapshot = { entries: [], jobs: [], warnings: 0, errors: 0, open: false }

function set(next: Partial<LogSnapshot>) {
  snap = { ...snap, ...next }
  listeners.forEach((l) => l())
}

/** Кольцевой буфер: старые завершённые записи уходят первыми, начало работающей задачи — никогда. */
function trim(entries: LogEntry[], jobs: ActiveJob[]): LogEntry[] {
  let extra = entries.length - MAX_ENTRIES
  if (extra <= 0) return entries
  const running = new Set(jobs.map((j) => j.id))
  return entries.filter((e) => {
    if (extra > 0 && !(e.job !== undefined && running.has(e.job))) { extra--; return false }
    return true
  })
}

function push(level: LogLevel, source: LogSource, key: string, params?: LogParams, detail?: string, job?: number): LogEntry {
  const entry: LogEntry = { id: nextId++, time: Date.now(), level, source, key, ...(params && { params }), ...(detail !== undefined && { detail }), ...(job !== undefined && { job }) }
  set({
    entries: trim([...snap.entries, entry], snap.jobs),
    warnings: snap.warnings + (level === 'warn' ? 1 : 0),
    errors: snap.errors + (level === 'error' ? 1 : 0),
  })
  return entry
}

const log = {
  info: (source: LogSource, key: string, params?: LogParams, detail?: string) => push('info', source, key, params, detail),
  warn: (source: LogSource, key: string, params?: LogParams, detail?: string) => push('warn', source, key, params, detail),
  error: (source: LogSource, key: string, params?: LogParams, detail?: string) => push('error', source, key, params, detail),
  /** Один раз за сеанс страницы (по `id`), например предупреждение о недоступном хранилище. */
  once(id: string, level: LogLevel, source: LogSource, key: string, params?: LogParams, detail?: string) {
    if (once.has(id)) return
    once.add(id)
    push(level, source, key, params, detail)
  },
}
export { log }

/** Браузерное хранилище недоступно, данные живут в памяти до перезагрузки: предупреждение раз за сеанс на вид данных. */
export const memoryFallback = (what: 'images' | 'meshes' | 'fonts') => log.once(`storage:${what}`, 'warn', 'storage', 'log.storage.memory', { what })

export function startJob(o: { source: LogSource; key: string; params?: LogParams; cancel?: () => void; silent?: boolean }): Job {
  const id = nextId++
  const job: ActiveJob = { id, source: o.source, key: o.key, params: o.params, startedAt: Date.now(), cancelable: !!o.cancel, loader: false }
  if (o.cancel) cancels.set(id, o.cancel)
  set({ jobs: [...snap.jobs, job] })
  if (!o.silent) push('info', o.source, o.key, o.params, undefined, id)
  timers.set(id, setTimeout(() => {
    timers.delete(id)
    if (snap.jobs.some((j) => j.id === id)) set({ jobs: snap.jobs.map((j) => (j.id === id ? { ...j, loader: true } : j)) })
  }, LOADER_DELAY))
  const finish = (level: LogLevel, key: string | undefined, params?: LogParams, detail?: string) => {
    if (!snap.jobs.some((j) => j.id === id)) return
    clearTimeout(timers.get(id)); timers.delete(id); cancels.delete(id)
    set({ jobs: snap.jobs.filter((j) => j.id !== id) })
    if (key) push(level, o.source, key, params, detail, id)
  }
  return {
    id,
    update(u) {
      if (!snap.jobs.some((j) => j.id === id)) return
      set({ jobs: snap.jobs.map((j) => (j.id === id ? { ...j, ...(u.key && { key: u.key, params: u.params }), ...(u.progress !== undefined && { progress: u.progress }) } : j)) })
    },
    done: (key, params) => finish('info', key, params),
    fail: (key, params, detail) => finish('error', key, params, detail),
    cancelled: (key = 'log.job.cancelled', params) => finish('info', key, params),
    discard() {
      if (!snap.jobs.some((j) => j.id === id)) return
      clearTimeout(timers.get(id)); timers.delete(id); cancels.delete(id)
      set({ jobs: snap.jobs.filter((j) => j.id !== id), entries: snap.entries.filter((e) => e.job !== id) })
    },
  }
}

/** Нажатие «Отмена» в строке состояния: вызывает cancel задачи и закрывает её как отменённую. */
export function cancelJob(id: number) {
  const job = snap.jobs.find((j) => j.id === id)
  if (!job) return
  cancels.get(id)?.()
  clearTimeout(timers.get(id)); timers.delete(id); cancels.delete(id)
  set({ jobs: snap.jobs.filter((j) => j.id !== id) })
  push('info', job.source, 'log.job.cancelled', undefined, undefined, id)
}

export function openLog(o: { source?: LogSource } = {}) {
  set({ open: true, openSource: o.source, warnings: 0, errors: 0 })
}
export function closeLog() { set({ open: false, openSource: undefined }) }

/** Очистка без подтверждения (журнал одноразовый): остаются только начала работающих задач. */
export function clearLog() {
  const running = new Set(snap.jobs.map((j) => j.id))
  set({ entries: snap.entries.filter((e) => e.job !== undefined && running.has(e.job)), warnings: 0, errors: 0 })
}

export function getLogSnapshot(): LogSnapshot { return snap }
export function subscribeLog(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }
export function useActivityLog(): LogSnapshot { return useSyncExternalStore(subscribeLog, getLogSnapshot, getLogSnapshot) }

/** Включён ли индикатор: идёт задача дольше LOADER_DELAY. */
export const isLoading = (s: LogSnapshot) => s.jobs.some((j) => j.loader)

/** Только для тестов: чистый журнал. */
export function resetActivityLog() {
  timers.forEach((t) => clearTimeout(t))
  timers.clear(); cancels.clear(); once.clear()
  nextId = 1
  snap = { entries: [], jobs: [], warnings: 0, errors: 0, open: false }
  listeners.forEach((l) => l())
}
