// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import i18n from '../i18n'
import { APP_VERSION } from './site'
import { clearLog, getLogSnapshot, log, openLog, resetActivityLog } from './activityLog'
import { ActivityLogPanel } from './ActivityLogPanel'

beforeEach(async () => { resetActivityLog(); await i18n.changeLanguage('en') })
afterEach(() => vi.restoreAllMocks())

const seed = () => {
  log.info('model', 'log.model.done', { ms: 5, triangles: 10 })
  log.warn('photo', 'log.photo.sheetNotFound')
  log.error('model', 'log.model.failed', undefined, 'stack text')
}

describe('ActivityLogPanel', () => {
  it('закрыт, пока не открыт', () => {
    render(<ActivityLogPanel />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('показывает записи с временем, уровнем, источником и текстом', () => {
    seed()
    render(<ActivityLogPanel />)
    act(() => openLog())
    const dlg = screen.getByRole('dialog', { name: 'Activity log' })
    expect(within(dlg).getByText('Model built in 5 ms, 10 triangles')).toBeInTheDocument()
    expect(within(dlg).getAllByText(/^\d\d:\d\d:\d\d\.\d{3}$/)).toHaveLength(3)
  })

  it('фильтры по уровню и источнику', () => {
    seed()
    render(<ActivityLogPanel />)
    act(() => openLog())
    fireEvent.click(screen.getByRole('button', { name: 'Errors' }))
    expect(screen.queryByText('Model built in 5 ms, 10 triangles')).toBeNull()
    expect(screen.getByText('The model could not be built')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'All' })[0])
    fireEvent.click(screen.getByRole('button', { name: /^Photo 1$/ }))
    expect(screen.getByText('The sheet was not found on the photo, set the corners by hand')).toBeInTheDocument()
    expect(screen.queryByText('The model could not be built')).toBeNull()
  })

  it('открытие с источником выбирает его', () => {
    seed()
    render(<ActivityLogPanel />)
    act(() => openLog({ source: 'photo' }))
    expect(screen.getByRole('button', { name: /^Photo 1$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('The model could not be built')).toBeNull()
  })

  it('подробности записи скрыты в «Details»', () => {
    seed()
    render(<ActivityLogPanel />)
    act(() => openLog())
    expect(screen.getByText('Details').closest('details')).toHaveTextContent('stack text')
  })

  it('смена языка перерисовывает старые строки', async () => {
    seed()
    render(<ActivityLogPanel />)
    act(() => openLog())
    await act(async () => { await i18n.changeLanguage('ru') })
    expect(screen.getByText('Модель построена за 5 мс, треугольников: 10')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Журнал событий' })).toBeInTheDocument()
  })

  it('следует за новыми строками и не листает, пока пользователь выше; «К последней» возвращает', () => {
    render(<ActivityLogPanel />)
    act(() => openLog())
    const list = screen.getByTestId('log-list')
    Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true })
    list.scrollTop = 800
    act(() => { log.info('app', 'log.model.start') })
    expect(list.scrollTop).toBe(1000)
    list.scrollTop = 100
    fireEvent.scroll(list)
    act(() => { log.info('app', 'log.model.start') })
    expect(list.scrollTop).toBe(100)
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }))
    expect(list.scrollTop).toBe(1000)
  })

  it('Copy кладёт в буфер версию, язык, браузер и строки', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    seed()
    render(<ActivityLogPanel />)
    act(() => openLog())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })) })
    const text = write.mock.calls[0][0] as string
    expect(text).toContain(`Version: ${APP_VERSION}`)
    expect(text).toContain('Language: en')
    expect(text).toContain('Browser: ')
    expect(text).toContain('[Error] [Model] The model could not be built')
    expect(text).toContain('stack text')
    expect(screen.getByRole('button', { name: 'Copied to the clipboard' })).toBeInTheDocument()
  })

  it('Clear убирает записи и сбрасывает счётчики', () => {
    seed()
    render(<ActivityLogPanel />)
    act(() => openLog())
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(getLogSnapshot().entries).toHaveLength(0)
    expect(screen.getByText('Nothing logged yet.')).toBeInTheDocument()
  })

  it('Esc закрывает и возвращает фокус', () => {
    vi.useFakeTimers()
    render(<><button>opener</button><ActivityLogPanel /></>)
    const opener = screen.getByText('opener')
    opener.focus()
    act(() => openLog())
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    act(() => { vi.runAllTimers() })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
    vi.useRealTimers()
  })

  it('clearLog из хранилища не ломает панель', () => {
    render(<ActivityLogPanel />)
    act(() => openLog())
    act(() => clearLog())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
