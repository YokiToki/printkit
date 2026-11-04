// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { routes } from './routes'
import { CLOUDTIPS_URL, DONATION_ADDRESS, GITHUB_URL } from './site'

vi.mock('../features/viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))
vi.mock('./useModel', () => ({
  useModel: () => ({ model: null, busy: false, pending: false, error: null }),
  getModelClient: () => ({ registerMesh: () => {}, generate: async () => null }),
}))

const at = (path: string) => render(<I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></I18nextProvider>)

describe('идентичность сайта: ссылка, мотивация, подвал (2.1–2.3)', () => {
  beforeEach(async () => { localStorage.clear(); await i18n.changeLanguage('en') })
  afterEach(() => { vi.unstubAllGlobals() })

  it('ссылка на GitHub есть в шапке на стартовой странице и в режиме, открывается в новой вкладке без доступа к opener', () => {
    for (const path of ['/', '/gridfinity/baseplate', '/keychain/shape']) {
      const { unmount } = at(path)
      const link = within(screen.getByRole('banner')).getByRole('link', { name: 'PrintKit on GitHub' })
      expect(link).toHaveAttribute('href', GITHUB_URL)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      unmount()
    }
  })

  it('имя сайта PrintKit есть в шапке на всех страницах в составе хлебных крошек', () => {
    const { unmount } = at('/')
    expect(screen.getByTestId('site-name')).toHaveTextContent('PrintKit')
    unmount()
    at('/keychain')
    expect(screen.getByTestId('site-name')).toHaveTextContent('PrintKit')
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(/PrintKit.*Keychain/)
  })

  it('мотивация только на корневой странице; смена языка меняет текст', async () => {
    at('/')
    const block = screen.getByRole('region', { name: 'Why it is free' })
    expect(block).toHaveAttribute('data-testid', 'motivation')
    expect(block).toHaveTextContent(/Gridfinity is an open standard/)
    // отдельный блок: идёт после карточек продуктов и перед подвалом
    const cards = screen.getByTestId('card-gridfinity'), footer = screen.getByRole('contentinfo')
    expect(cards.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(block.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'RU' }))
    expect(screen.getByRole('region', { name: 'Почему бесплатно' })).toHaveTextContent(/открытый стандарт/)
  })
  it('на страницах продуктов и в режимах мотивации нет', () => {
    for (const path of ['/gridfinity', '/keychain', '/gridfinity/box']) {
      const { unmount } = at(path)
      expect(screen.queryByTestId('motivation')).toBeNull()
      unmount()
    }
  })

  it('подвал на корневой и на страницах продуктов, в режиме его нет', () => {
    for (const path of ['/', '/gridfinity', '/keychain']) {
      const { unmount } = at(path)
      expect(screen.getByRole('contentinfo', { name: 'About this site' })).toBeInTheDocument()
      expect(screen.getByTestId('donation-address')).toHaveTextContent(DONATION_ADDRESS)
      unmount()
    }
    at('/gridfinity/baseplate')
    expect(screen.queryByRole('contentinfo', { name: 'About this site' })).toBeNull()
  })

  it('кнопка копирования кладёт адрес в буфер и показывает подтверждение', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    at('/')
    await userEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(writeText).toHaveBeenCalledWith(DONATION_ADDRESS)
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('без доступа к буферу адрес остаётся видимым и выделяется для ручного копирования', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    at('/')
    await userEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(screen.getByTestId('donation-address')).toBeVisible()
    expect(window.getSelection()?.toString()).toBe(DONATION_ADDRESS)
    expect(screen.queryByText('Copied')).toBeNull()
  })

  it('сердечко со свечением рядом с заголовком поддержки; кнопка CloudTips видна только в русской локали', async () => {
    at('/')
    const heart = screen.getByTestId('support-heart')
    expect(heart).toHaveClass('text-error')
    expect(heart.getAttribute('class')).toContain('drop-shadow')
    expect(screen.queryByTestId('cloudtips-link')).toBeNull()
    expect(screen.queryByTestId('donation-divider')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'RU' }))
    expect(screen.getByTestId('donation-divider')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'CloudTips' })
    expect(link).toHaveAttribute('href', CLOUDTIPS_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/USDT.*CloudTips/)
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.queryByTestId('cloudtips-link')).toBeNull()
  })
})

describe('в статистику не попадает пользовательское содержимое (3.3)', () => {
  type R = { path?: string; children?: R[] }
  const paths = (list: R[], prefix = ''): string[] => list.flatMap((r) => {
    const here = r.path === undefined ? prefix : `${prefix}/${r.path}`.replace(/\/+/g, '/')
    return [...(r.path === undefined ? [] : [here]), ...paths(r.children ?? [], here)]
  })
  it('в маршрутах нет параметров и запросов: адрес страницы, который видит Метрика, — только путь режима', () => {
    const all = paths(routes as unknown as R[])
    expect(all.length).toBeGreaterThan(5)
    for (const p of all) expect(p, p).not.toMatch(/[:?&=]/)
  })
})
