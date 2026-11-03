// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ModelResult } from '../geometry/model'
import { UnitProvider } from '../ui/UnitProvider'
import '../i18n'
import { Workspace } from './Workspace'

let last: { view?: string; openGap?: number } = {}
vi.mock('../features/viewport/Viewport', () => ({ Viewport: (p: { view?: string; openGap?: number }) => { last = p; return null } }))

let roCallbacks: Array<() => void> = []
class FakeRO {
  constructor(cb: () => void) { roCallbacks.push(cb) }
  observe() {}
  disconnect() {}
}

afterEach(() => { vi.unstubAllGlobals(); roCallbacks = []; last = {}; localStorage.clear() })

describe('Workspace: отступ под закреплённым блоком', () => {
  it('прокручиваемая панель получает нижний отступ, равный высоте футера, и следует за её изменением', () => {
    let h = 96
    vi.stubGlobal('ResizeObserver', FakeRO)
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => h)
    render(<Workspace panel={<div>p</div>} footer={<div>f</div>} model={null} exportOptions={false} />)
    expect(screen.getByTestId('panel-scroller')).toHaveStyle({ paddingBottom: '96px' })
    h = 140
    act(() => roCallbacks.forEach((cb) => cb()))
    expect(screen.getByTestId('panel-scroller')).toHaveStyle({ paddingBottom: '140px' })
    spy.mockRestore()
  })
  it('без футера отступа нет', () => {
    render(<Workspace panel={<div>p</div>} model={null} exportOptions={false} />)
    expect(screen.getByTestId('panel-scroller').style.paddingBottom).toBe('0px')
  })
})

describe('Workspace: вид половин брелка (2.2)', () => {
  const model = (assembly?: Record<string, number[]>) => ({ parts: [], ...(assembly ? { assembly } : {}) }) as unknown as ModelResult

  it('без сборки выбора вида нет', () => {
    render(<Workspace panel={<div>p</div>} model={model()} exportOptions={false} />)
    expect(screen.queryByTestId('assembled-controls')).toBeNull()
    expect(last.view).toBe('sheet')
  })
  it('с двумя половинами: переключатель, раздвижка только в собранном виде, значения доходят до вьюпорта и запоминаются', async () => {
    localStorage.removeItem('gridfinity.viewport')
    const { unmount } = render(<UnitProvider><Workspace panel={<div>p</div>} model={model({ top: [] })} exportOptions={false} /></UnitProvider>)
    expect(screen.getByTestId('assembled-controls')).toBeInTheDocument()
    expect(screen.queryByLabelText('Open gap')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Assembled' }))
    expect(last.view).toBe('assembled')
    expect(last.openGap).toBe(0)
    const gap = screen.getByLabelText('Open gap')
    await userEvent.clear(gap)
    await userEvent.type(gap, '6')
    await userEvent.tab()
    expect(last.openGap).toBe(6)
    unmount()
    render(<UnitProvider><Workspace panel={<div>p</div>} model={model({ top: [] })} exportOptions={false} /></UnitProvider>)
    expect(last.view).toBe('assembled')
    expect(last.openGap).toBe(6)
  })
  it('сохранённый вид не применяется, пока нет двух половин', () => {
    localStorage.setItem('gridfinity.viewport', JSON.stringify({ tools: true, keychainView: 'assembled', openGap: 4 }))
    render(<Workspace panel={<div>p</div>} model={model()} exportOptions={false} />)
    expect(last.view).toBe('sheet')
  })
})

describe('Workspace: скрытие и раскрытие боковой панели', () => {
  it('кнопка скрытия сворачивает aside на десктопе, кнопка раскрытия возвращает', async () => {
    render(<Workspace panel={<div>content</div>} model={null} exportOptions={false} />)
    const aside = screen.getByRole('complementary', { name: 'Parameters' })
    expect(aside).toHaveClass('md:flex')
    expect(aside).not.toHaveClass('md:hidden')
    expect(screen.queryByRole('button', { name: 'Show parameters' })).toBeNull()

    const collapseBtn = screen.getByRole('button', { name: 'Hide parameters' })
    await userEvent.click(collapseBtn)
    expect(aside).toHaveClass('md:hidden')
    const expandBtn = screen.getByRole('button', { name: 'Show parameters' })
    expect(expandBtn).toBeInTheDocument()

    await userEvent.click(expandBtn)
    expect(aside).toHaveClass('md:flex')
    expect(aside).not.toHaveClass('md:hidden')
    expect(screen.queryByRole('button', { name: 'Show parameters' })).toBeNull()
  })
})
