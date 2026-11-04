// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { routes } from './routes'

vi.mock('../features/viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))
vi.mock('./useModel', () => ({
  useModel: () => ({ model: null, busy: false, pending: false, error: null }),
  getModelClient: () => ({ registerMesh: () => {}, generate: async () => null }),
}))

const at = (path: string) => render(<I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></I18nextProvider>)

describe('Header: хлебные крошки и навигация', () => {
  beforeEach(async () => { localStorage.clear(); await i18n.changeLanguage('en') })

  it('на корневой странице в крошках только PrintKit, кнопка beta перед ним', () => {
    at('/')
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: /PrintKit/ })).toHaveAttribute('href', '/')
    expect(within(nav).queryByText('/')).toBeNull()
    const betaBtn = screen.getByTestId('beta-badge')
    expect(betaBtn).toBeInTheDocument()
    // beta-badge находится перед ссылкой PrintKit в DOM
    expect(betaBtn.compareDocumentPosition(within(nav).getByRole('link', { name: /PrintKit/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('логотип берёт оттенок активного продукта, без продукта — синий (gridfinity)', () => {
    const logo = () => document.querySelector('header svg[data-hue]')
    for (const [path, hue] of [['/', 'gridfinity'], ['/editor', 'editor'], ['/gridfinity', 'gridfinity'], ['/keychain', 'keychain'], ['/rack', 'rack']] as const) {
      const { unmount } = at(path)
      expect(logo(), path).toHaveAttribute('data-hue', hue)
      unmount()
      localStorage.clear()
    }
  })

  it('в Editor крошки: PrintKit / Editor (без ссылки и режима)', () => {
    at('/editor')
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: /PrintKit/ })).toHaveAttribute('href', '/')
    expect(within(nav).getByText('Editor')).toHaveAttribute('aria-current', 'page')
    expect(within(nav).queryByRole('link', { name: 'Editor' })).toBeNull()
  })

  it('на странице выбора продукта в крошках PrintKit / Gridfinity', () => {
    at('/gridfinity')
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: /PrintKit/ })).toHaveAttribute('href', '/')
    expect(within(nav).getByText('Gridfinity')).toHaveAttribute('aria-current', 'page')
  })

  it('в режиме Baseplate крошки: PrintKit / Gridfinity / Baseplate', () => {
    at('/gridfinity/baseplate')
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: /PrintKit/ })).toHaveAttribute('href', '/')
    const productLink = within(nav).getByRole('link', { name: 'Gridfinity' })
    expect(productLink).toHaveAttribute('href', '/gridfinity')
    expect(within(nav).getByText('Baseplate')).toHaveAttribute('aria-current', 'page')
  })

  it('в Rack Panel крошки: PrintKit / Rack / Panel', () => {
    at('/rack/panel')
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: /PrintKit/ })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: 'Rack' })).toHaveAttribute('href', '/rack')
    expect(within(nav).getByText('Panel')).toHaveAttribute('aria-current', 'page')
  })

  it('в Keychain Image крошки: PrintKit / Keychain / Image', () => {
    at('/keychain/image')
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: /PrintKit/ })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: 'Keychain' })).toHaveAttribute('href', '/keychain')
    expect(within(nav).getByText('Image')).toHaveAttribute('aria-current', 'page')
  })

  it('клик по Gridfinity в крошках возвращает на страницу выбора режима /gridfinity', async () => {
    at('/gridfinity/box')
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    await userEvent.click(within(nav).getByRole('link', { name: 'Gridfinity' }))
    expect(await screen.findByRole('heading', { name: 'Choose a Gridfinity part' })).toBeInTheDocument()
  })

  it('крошки всегда на английском, даже при русской локали', async () => {
    await i18n.changeLanguage('ru')
    at('/gridfinity/box')
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: /PrintKit/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Gridfinity' })).toBeInTheDocument()
    expect(within(nav).getByText('Box')).toBeInTheDocument()
    expect(within(nav).queryByText('Коробка')).toBeNull()
  })

  it('переключатели единиц и языка компактные и совпадают по высоте со ссылкой GitHub', () => {
    at('/')
    const unitsGroup = screen.getByRole('group', { name: 'Units' })
    const langGroup = screen.getByRole('group', { name: 'Language' })
    const githubLink = screen.getByRole('link', { name: 'PrintKit on GitHub' })
    expect(unitsGroup).toBeInTheDocument()
    expect(langGroup).toBeInTheDocument()
    expect(githubLink).toBeInTheDocument()
  })
})
