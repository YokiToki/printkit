// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import { getLogSnapshot, resetActivityLog, startJob } from '../../app/activityLog'
import { routes } from '../../app/routes'
import { closeModelManager } from './managerState'

vi.mock('../viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))
vi.mock('../../app/useModel', () => ({
  useModel: () => ({ model: null, busy: false, pending: false, error: null }),
  getModelClient: () => ({ registerMesh: () => {}, generate: async () => null }),
}))
const at = (path: string) => render(<I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></I18nextProvider>)

describe('кнопка «Модели ИИ» в шапке (32, 5.2)', () => {
  beforeEach(async () => { localStorage.clear(); resetActivityLog(); closeModelManager(); await i18n.changeLanguage('en') })

  it('видна на стартовой странице и в режиме, не зависит от режима; открывает менеджер', async () => {
    const { unmount } = at('/')
    expect(screen.getByRole('button', { name: 'AI models' })).toBeInTheDocument()
    unmount()
    at('/gridfinity/box')
    await userEvent.click(screen.getByRole('button', { name: 'AI models' }))
    expect(screen.getByRole('dialog', { name: 'AI models' })).toBeInTheDocument()
  })

  it('индикатор появляется, пока идёт задача ИИ, и исчезает, когда она закончилась; чужие задачи его не включают', () => {
    at('/')
    expect(screen.queryByTestId('models-busy')).toBeNull()
    act(() => { startJob({ source: 'model', key: 'log.model.start' }) })
    expect(screen.queryByTestId('models-busy')).toBeNull()
    let job!: ReturnType<typeof startJob>
    act(() => { job = startJob({ source: 'ai', key: 'log.ai.download', params: { name: 'N', loaded: 1, total: 9 } }) })
    expect(screen.getByTestId('models-busy')).toBeInTheDocument()
    act(() => job.done('log.ai.downloaded', { name: 'N', size: '9 MB' }))
    expect(screen.queryByTestId('models-busy')).toBeNull()
  })

  it('ссылка менеджера «Открыть журнал» открывает общий журнал, отфильтрованный по ИИ', async () => {
    at('/')
    await userEvent.click(screen.getByRole('button', { name: 'AI models' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open the log' }))
    expect(getLogSnapshot().open).toBe(true)
    expect(getLogSnapshot().openSource).toBe('ai')
  })
})
