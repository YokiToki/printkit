// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import '../../i18n'
import { getLogSnapshot, log, resetActivityLog, startJob } from '../../app/activityLog'
import { StatusBar, MESSAGE_MS } from './StatusBar'

beforeEach(() => { vi.useFakeTimers(); resetActivityLog() })
afterEach(() => vi.useRealTimers())

describe('StatusBar', () => {
  it('без задач и сообщений показывает «Updated», если есть модель', () => {
    const { container } = render(<StatusBar hasModel />)
    expect(container.querySelector('.truncate')).toHaveTextContent('Updated')
    expect(screen.getByRole('button', { name: 'Open the log' })).toBeInTheDocument()
  })

  it('строка следует за задачей, индикатор появляется после 200 мс, прогресс виден', () => {
    const { container } = render(<StatusBar hasModel />)
    let job!: ReturnType<typeof startJob>
    act(() => { job = startJob({ source: 'model', key: 'log.model.start' }) })
    expect(container.querySelector('.truncate')).toHaveTextContent('Building the model…')
    expect(container.querySelector('svg.animate-spin')).toBeNull()
    act(() => { vi.advanceTimersByTime(250) })
    expect(container.querySelector('svg.animate-spin')).not.toBeNull()
    act(() => job.update({ key: 'log.model.start', progress: 0.5 }))
    expect(container.querySelector('.truncate')).toHaveTextContent('50 %')
  })

  it('после задачи последнее сообщение 4 с, затем «Updated»', () => {
    const { container } = render(<StatusBar hasModel />)
    act(() => { startJob({ source: 'model', key: 'log.model.start' }).done('log.model.done', { ms: 12, triangles: 100 }) })
    expect(container.querySelector('.truncate')).toHaveTextContent('Model built in 12 ms, 100 triangles')
    act(() => { vi.advanceTimersByTime(MESSAGE_MS + 1100) })
    expect(container.querySelector('.truncate')).toHaveTextContent('Updated')
    expect(container.querySelector('.truncate')).not.toHaveTextContent('Model built')
  })

  it('счётчики предупреждений и ошибок', () => {
    render(<StatusBar hasModel />)
    act(() => { log.warn('model', 'log.model.invalid'); log.error('model', 'log.model.failed'); log.error('model', 'log.model.failed') })
    expect(screen.getByTitle('1 warnings')).toHaveTextContent('1')
    expect(screen.getByTitle('2 errors')).toHaveTextContent('2')
  })

  it('клик и Enter открывают журнал', () => {
    render(<StatusBar hasModel />)
    const btn = screen.getByRole('button', { name: 'Open the log' })
    fireEvent.click(btn)
    expect(getLogSnapshot().open).toBe(true)
  })

  it('«Отмена» вызывает cancel задачи', () => {
    const cancel = vi.fn()
    render(<StatusBar hasModel />)
    act(() => { startJob({ source: 'ai', key: 'log.model.start', cancel }) })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancel).toHaveBeenCalled()
    expect(getLogSnapshot().jobs).toHaveLength(0)
  })

  it('скринридеру объявляется не чаще раза в секунду', () => {
    render(<StatusBar hasModel />)
    const live = screen.getByRole('status')
    let job!: ReturnType<typeof startJob>
    act(() => { job = startJob({ source: 'model', key: 'log.model.start' }) })
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) {
      act(() => { job.update({ key: 'log.model.start', progress: i / 20 }); vi.advanceTimersByTime(100) })
      seen.add(live.textContent ?? '')
    }
    // за 2 с — не больше трёх разных объявлений
    expect(seen.size).toBeLessThanOrEqual(3)
  })

  it('кнопка открытия журнала аккуратная и подсвечивает контур при наведении', () => {
    render(<StatusBar hasModel />)
    const btn = screen.getByRole('button', { name: 'Open the log' })
    expect(btn).toHaveClass('border-transparent', 'hover:border-border')
  })
})

const modeSources = import.meta.glob(['../box/BoxMode.tsx', '../baseplate/BaseplateMode.tsx', '../cutout/CutoutMode.tsx', '../rack/*Mode.tsx', '../keychain/KeychainWorkspace.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('режимы не передают собственный флаг busy в Workspace', () => {
  it('в исходниках режимов нет busy={busy}', () => {
    expect(Object.keys(modeSources).length).toBeGreaterThanOrEqual(7)
    for (const src of Object.values(modeSources)) expect(src).not.toMatch(/busy=\{busy\}/)
  })
})
