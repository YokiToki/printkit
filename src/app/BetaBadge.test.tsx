// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { routes } from './routes'
import { APP_VERSION } from './site'

vi.mock('../features/viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))
vi.mock('./useModel', () => ({
  useModel: () => ({ model: null, busy: false, pending: false, error: null }),
  getModelClient: () => ({ registerMesh: () => {}, generate: async () => null }),
}))

const at = (path: string) => render(<I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></I18nextProvider>)

describe('метка beta и дисклеймер (29)', () => {
  beforeEach(async () => { localStorage.clear(); await i18n.changeLanguage('en') })

  it.each(['/', '/gridfinity', '/keychain', '/rack', '/gridfinity/box', '/rack/case'])('метка есть на %s и имеет доступное имя', (path) => {
    at(path)
    expect(screen.getByRole('button', { name: 'beta, show details' })).toBeInTheDocument()
  })

  it('нажатие показывает дисклеймер, повторное и Escape закрывают', async () => {
    const user = userEvent.setup()
    at('/')
    const badge = screen.getByTestId('beta-badge')
    expect(screen.queryByRole('region', { name: 'Beta version' })).toBeNull()
    await user.click(badge)
    expect(screen.getByRole('region', { name: 'Beta version' })).toHaveTextContent(/PrintKit is in beta\. Dimensions, fit and print settings may be wrong/)
    expect(badge).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Beta version' })).toBeNull()
    await user.click(badge); await user.click(badge)
    expect(screen.queryByRole('region', { name: 'Beta version' })).toBeNull()
  })

  it('нажатие вне поповера закрывает его, внутри — нет', async () => {
    const user = userEvent.setup()
    at('/')
    await user.click(screen.getByTestId('beta-badge'))
    await user.click(screen.getByRole('region', { name: 'Beta version' }))
    expect(screen.getByRole('region', { name: 'Beta version' })).toBeInTheDocument()
    await user.click(document.body)
    expect(screen.queryByRole('region', { name: 'Beta version' })).toBeNull()
  })

  it('подвал стартовой страницы повторяет тот же дисклеймер; в режиме подвала нет, метка есть', async () => {
    const user = userEvent.setup()
    const { unmount } = at('/')
    const footer = screen.getByTestId('footer-beta').textContent
    await user.click(screen.getByTestId('beta-badge'))
    expect(screen.getByRole('region', { name: 'Beta version' })).toHaveTextContent(footer!)
    unmount()
    at('/gridfinity/box')
    expect(screen.queryByTestId('footer-beta')).toBeNull()
    expect(screen.getByTestId('beta-badge')).toBeInTheDocument()
  })

  it('по-русски метка и дисклеймер на русском', async () => {
    await i18n.changeLanguage('ru')
    const user = userEvent.setup()
    at('/')
    await user.click(screen.getByRole('button', { name: 'beta, показать подробности' }))
    expect(screen.getByRole('region', { name: 'Бета-версия' })).toHaveTextContent('PrintKit в бете.')
    expect(screen.getByTestId('footer-beta')).toHaveTextContent('PrintKit в бете.')
  })

  it('версия показана в подвале и в поповере как v<версия>', async () => {
    const user = userEvent.setup()
    at('/')
    expect(screen.getByTestId('footer-version')).toHaveTextContent(`v${APP_VERSION}`)
    await user.click(screen.getByTestId('beta-badge'))
    expect(screen.getByTestId('beta-version')).toHaveTextContent(`v${APP_VERSION}`)
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
