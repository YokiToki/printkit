// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import { getLogSnapshot, resetActivityLog, startJob } from '../../app/activityLog'
import { routes } from '../../app/routes'
import { closeModelManager, openModelManager } from './managerState'
import { ActivityLogPanel } from '../../app/ActivityLogPanel'

vi.mock('../viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))
vi.mock('../../app/useModel', () => ({
  useModel: () => ({ model: null, busy: false, pending: false, error: null }),
  getModelClient: () => ({ registerMesh: () => {}, generate: async () => null }),
}))
const at = (path: string) =>
  render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </I18nextProvider>,
  )

describe('управление моделями ИИ в журнале (38b)', () => {
  beforeEach(async () => {
    localStorage.clear()
    resetActivityLog()
    closeModelManager()
    await i18n.changeLanguage('en')
  })

  it('openModelManager открывает панель журнала на вкладке моделей', async () => {
    at('/gridfinity/box')
    act(() => {
      openModelManager()
    })
    expect(screen.getByRole('dialog', { name: 'Activity log' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Models' })).toHaveAttribute('aria-selected', 'true')
  })

  it('индикатор появляется на вкладке моделей, пока идёт задача ИИ, и исчезает, когда она закончилась', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ActivityLogPanel />
      </I18nextProvider>,
    )
    act(() => {
      openModelManager()
    })
    expect(screen.queryByTestId('models-busy')).toBeNull()
    act(() => {
      startJob({ source: 'model', key: 'log.model.start' })
    })
    expect(screen.queryByTestId('models-busy')).toBeNull()
    let job!: ReturnType<typeof startJob>
    act(() => {
      job = startJob({ source: 'ai', key: 'log.ai.download', params: { name: 'N', loaded: 1, total: 9 } })
    })
    expect(screen.getByTestId('models-busy')).toBeInTheDocument()
    act(() => job.done('log.ai.downloaded', { name: 'N', size: '9 MB' }))
    expect(screen.queryByTestId('models-busy')).toBeNull()
  })

  it('вкладка моделей позволяет переключиться обратно в журнал', async () => {
    at('/gridfinity/box')
    act(() => {
      openModelManager()
    })
    const logTab = screen.getByRole('tab', { name: 'Log' })
    await userEvent.click(logTab)
    expect(logTab).toHaveAttribute('aria-selected', 'true')
    expect(getLogSnapshot().open).toBe(true)
  })
})
