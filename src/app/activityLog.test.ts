import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ENTRIES, cancelJob, clearLog, getLogSnapshot, isLoading, log, openLog, resetActivityLog, startJob, subscribeLog } from './activityLog'

beforeEach(() => { vi.useFakeTimers(); resetActivityLog() })
afterEach(() => vi.useRealTimers())

describe('activityLog', () => {
  it('запись хранит ключ и параметры', () => {
    log.warn('model', 'log.model.warning', { key: 'x' }, 'stack')
    expect(getLogSnapshot().entries[0]).toMatchObject({ level: 'warn', source: 'model', key: 'log.model.warning', params: { key: 'x' }, detail: 'stack' })
    expect(getLogSnapshot().warnings).toBe(1)
  })

  it('прогресс меняет строку задачи на месте, не добавляя записей', () => {
    const job = startJob({ source: 'ai', key: 'log.ai.download' })
    for (let i = 1; i <= 50; i++) job.update({ key: 'log.ai.downloading', params: { n: i }, progress: i / 50 })
    const s = getLogSnapshot()
    expect(s.entries).toHaveLength(1)
    expect(s.jobs[0]).toMatchObject({ key: 'log.ai.downloading', params: { n: 50 }, progress: 1 })
    job.done('log.ai.ready')
    expect(getLogSnapshot().jobs).toHaveLength(0)
    expect(getLogSnapshot().entries).toHaveLength(2)
  })

  it('буфер роняет старые завершённые записи и не трогает работающую задачу', () => {
    startJob({ source: 'model', key: 'log.model.start' })
    for (let i = 0; i < MAX_ENTRIES + 30; i++) log.info('app', 'log.app.x')
    const s = getLogSnapshot()
    expect(s.entries).toHaveLength(MAX_ENTRIES)
    expect(s.entries[0].key).toBe('log.model.start')
  })

  it('индикатор включает задача дольше 200 мс', () => {
    const job = startJob({ source: 'model', key: 'log.model.start' })
    expect(isLoading(getLogSnapshot())).toBe(false)
    vi.advanceTimersByTime(250)
    expect(isLoading(getLogSnapshot())).toBe(true)
    job.done('log.model.done')
    expect(isLoading(getLogSnapshot())).toBe(false)
  })

  it('быстрая задача не включает индикатор', () => {
    startJob({ source: 'model', key: 'log.model.start' }).done('log.model.done')
    vi.advanceTimersByTime(500)
    expect(isLoading(getLogSnapshot())).toBe(false)
  })

  it('fail пишет ошибку с деталями, cancelled и cancelJob закрывают задачу', () => {
    startJob({ source: 'model', key: 'a' }).fail('log.model.failed', undefined, 'boom')
    expect(getLogSnapshot().entries.at(-1)).toMatchObject({ level: 'error', detail: 'boom' })
    expect(getLogSnapshot().errors).toBe(1)
    const cancel = vi.fn()
    const job = startJob({ source: 'ai', key: 'b', cancel })
    expect(getLogSnapshot().jobs[0].cancelable).toBe(true)
    cancelJob(job.id)
    expect(cancel).toHaveBeenCalled()
    expect(getLogSnapshot().jobs).toHaveLength(0)
    expect(getLogSnapshot().entries.at(-1)?.key).toBe('log.job.cancelled')
    startJob({ source: 'ai', key: 'c' }).cancelled()
    expect(getLogSnapshot().entries.at(-1)?.key).toBe('log.job.cancelled')
  })

  it('discard убирает задачу и её строку', () => {
    startJob({ source: 'model', key: 'a' }).discard()
    expect(getLogSnapshot().entries).toHaveLength(0)
    expect(getLogSnapshot().jobs).toHaveLength(0)
  })

  it('подписчик уведомляется один раз на изменение', () => {
    const l = vi.fn()
    const off = subscribeLog(l)
    log.info('app', 'k')
    expect(l).toHaveBeenCalledTimes(1)
    off()
  })

  it('once пишет один раз', () => {
    log.once('s', 'warn', 'storage', 'log.storage.memory')
    log.once('s', 'warn', 'storage', 'log.storage.memory')
    expect(getLogSnapshot().entries).toHaveLength(1)
  })

  it('открытие сбрасывает счётчики и запоминает источник, очистка тоже', () => {
    log.error('app', 'k'); log.warn('app', 'k')
    openLog({ source: 'ai' })
    expect(getLogSnapshot()).toMatchObject({ open: true, openSource: 'ai', warnings: 0, errors: 0 })
    log.error('app', 'k')
    clearLog()
    expect(getLogSnapshot().entries).toHaveLength(0)
    expect(getLogSnapshot().errors).toBe(0)
  })
})
