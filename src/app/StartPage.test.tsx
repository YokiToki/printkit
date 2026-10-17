// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { routes } from './routes'
import { recordSession } from './lastSession'

// WebGL в jsdom недоступен
vi.mock('../features/viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))

// воркер в jsdom недоступен: режимы получают пустую модель
vi.mock('./useModel', () => ({
  useModel: () => ({ model: null, busy: false, pending: false, error: null }),
  getModelClient: () => ({ registerMesh: () => {}, generate: async () => null }),
}))

const renderAt = (path: string) => render(
  <I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></I18nextProvider>,
)

describe('StartPage (выбор продукта)', () => {
  beforeEach(async () => { localStorage.clear(); await i18n.changeLanguage('en') })

  it('три карточки ведут на разделы продуктов', () => {
    renderAt('/')
    expect(screen.getByTestId('card-gridfinity')).toHaveAttribute('href', '/gridfinity')
    expect(screen.getByTestId('card-keychain')).toHaveAttribute('href', '/keychain')
    expect(screen.getByTestId('card-keychain')).toHaveTextContent('Keychain Master')
    expect(screen.getByTestId('card-rack')).toHaveAttribute('href', '/rack')
    expect(screen.getByTestId('card-rack')).toHaveTextContent('Rack Master')
  })
  it('клавиша 3 открывает Rack Master', async () => {
    renderAt('/')
    await userEvent.keyboard('3')
    expect(await screen.findByRole('heading', { name: 'Choose a rack part' })).toBeInTheDocument()
  })
  it('вьюпорт и панель параметров не рендерятся', () => {
    renderAt('/')
    expect(screen.queryByLabelText('3D preview')).toBeNull()
    expect(screen.queryByLabelText('Parameters')).toBeNull()
  })
  it('неизвестный путь показывает стартовую страницу', () => {
    renderAt('/nope')
    expect(screen.getByRole('heading', { name: 'What are you printing?' })).toBeInTheDocument()
  })
  it('клавиша 2 открывает Keychain Master', async () => {
    renderAt('/')
    await userEvent.keyboard('2')
    expect(await screen.findByRole('heading', { name: 'Choose a keychain start' })).toBeInTheDocument()
  })
  it('плашка «Продолжить» скрыта без сохранённой сессии и ведёт в режим Gridfinity', () => {
    const { unmount } = renderAt('/')
    expect(screen.queryByText(/Continue:/)).toBeNull()
    unmount()
    recordSession('baseplate', '6 × 4')
    renderAt('/')
    const link = screen.getByText(/Continue: Baseplate 6 × 4/).closest('a')!
    expect(link).toHaveAttribute('href', '/gridfinity/baseplate')
  })
  it('«Продолжить» помнит режим Keychain: Форма ведёт на /keychain/shape', () => {
    recordSession('shape', '54 × 30 mm', 'keychain')
    renderAt('/')
    const link = screen.getByText(/Continue: Shape 54 × 30 mm/).closest('a')!
    expect(link).toHaveAttribute('href', '/keychain/shape')
  })
  it('«Продолжить» после Keychain без режима (старая запись) ведёт на выбор режима', () => {
    recordSession(null, '1 emblem', 'keychain')
    renderAt('/')
    const link = screen.getByText(/Continue: Keychain Master 1 emblem/).closest('a')!
    expect(link).toHaveAttribute('href', '/keychain')
  })
})

describe('ModeChooser (/rack)', () => {
  beforeEach(async () => { localStorage.clear(); await i18n.changeLanguage('en') })
  it('три карточки Panel, Enclosure и Shelf, клавиши 1, 2 и 3', async () => {
    renderAt('/rack')
    expect(screen.getByTestId('card-panel')).toHaveAttribute('href', '/rack/panel')
    expect(screen.getByTestId('card-case')).toHaveAttribute('href', '/rack/case')
    expect(screen.getByTestId('card-case')).toHaveTextContent('Enclosure')
    await userEvent.keyboard('2')
    expect(await screen.findByLabelText('Parameters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Expand: Device/ })).toBeInTheDocument()
  })
  it('карточка Shelf с рендером ведёт на /rack/shelf, клавиша 3 открывает режим', async () => {
    renderAt('/rack')
    expect(screen.getByTestId('card-shelf')).toHaveAttribute('href', '/rack/shelf')
    expect(screen.getByTestId('card-shelf')).toHaveTextContent('Shelf')
    expect(screen.getByTestId('card-shelf').querySelector('[data-testid="art-rackShelf"] svg')).not.toBeNull()
    await userEvent.keyboard('3')
    expect(await screen.findByLabelText('Parameters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Expand: Shelf/ })).toBeInTheDocument()
  })
})

describe('ModeChooser (/gridfinity)', () => {
  beforeEach(async () => { localStorage.clear(); await i18n.changeLanguage('en') })

  it('каждая карточка ведёт на свой режим, вьюпорта нет', () => {
    renderAt('/gridfinity')
    expect(screen.getByTestId('card-box')).toHaveAttribute('href', '/gridfinity/box')
    expect(screen.getByTestId('card-baseplate')).toHaveAttribute('href', '/gridfinity/baseplate')
    expect(screen.getByTestId('card-cutout')).toHaveAttribute('href', '/gridfinity/cutout')
    expect(screen.queryByLabelText('3D preview')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Choose a Gridfinity part' })).toBeInTheDocument()
  })
  it('клавиша 3 открывает Cutout', async () => {
    renderAt('/gridfinity')
    await userEvent.keyboard('3')
    expect(await screen.findByText('Cutouts')).toBeInTheDocument()
  })
  it('режим Box открывается с панелью параметров и вьюпортом', async () => {
    renderAt('/gridfinity/box')
    expect(await screen.findByLabelText('3D preview')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Parameters' })).toBeInTheDocument()
    expect(screen.getByText('Compartments')).toBeInTheDocument()
  })
})

describe('ModeChooser (/keychain)', () => {
  beforeEach(async () => { localStorage.clear(); await i18n.changeLanguage('en') })

  it('две карточки ведут на свои режимы, вьюпорта нет, режимов Gridfinity нет', () => {
    renderAt('/keychain')
    expect(screen.getByTestId('card-image')).toHaveAttribute('href', '/keychain/image')
    expect(screen.getByTestId('card-shape')).toHaveAttribute('href', '/keychain/shape')
    expect(screen.queryByTestId('card-box')).toBeNull()
    expect(screen.queryByTestId('viewport')).toBeNull()
  })
  it('клавиша 1 открывает Image, клавиша 2 — Shape', async () => {
    const { unmount } = renderAt('/keychain')
    await userEvent.keyboard('1')
    expect(await screen.findByText(/Choose an image to start/)).toBeInTheDocument()
    unmount()
    renderAt('/keychain')
    await userEvent.keyboard('2')
    expect(await screen.findByRole('button', { name: /^Expand: Shape/ })).toBeInTheDocument()
  })
})

describe('карточки выбора: одинаковая вёрстка', () => {
  beforeEach(async () => { localStorage.clear(); await i18n.changeLanguage('en') })
  it('блок текста резервирует место четырёх строк описания у всех карточек, поэтому рамка рисунка одной высоты на любой странице и в любом языке', async () => {
    for (const lang of ['en', 'ru']) {
      await i18n.changeLanguage(lang)
      for (const path of ['/', '/gridfinity', '/keychain']) {
        const r = renderAt(path)
        for (const card of screen.getAllByTestId(/^card-/)) {
          const text = card.children[1] as HTMLElement
          expect(text.className, `${lang} ${path}`).toContain('min-h-[114px]')
          expect(card.children[0].className).toContain('flex-1')
        }
        r.unmount()
      }
    }
  })
})
