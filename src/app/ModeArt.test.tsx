// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { routes } from './routes'
import { ART, ART_IDS } from './ModeArt'
import { MODES } from './modes'
import { PRODUCTS } from './products'

const getModelClient = vi.fn()
vi.mock('./useModel', () => ({ useModel: () => ({ model: null, busy: false, pending: false, error: null }), getModelClient: (...a: unknown[]) => getModelClient(...a) }))
vi.mock('../features/viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))

const BUDGET = 60 * 1024

describe('иллюстрации карточек', () => {
  it('восемь иллюстраций (box, baseplate, cutout, keychainImage, keychainShape, rackPanel, rackCase, rackShelf): валидный SVG до 60 КБ, тона классами, без цветов', () => {
    expect(ART_IDS.sort()).toEqual(['baseplate', 'box', 'cutout', 'keychainImage', 'keychainShape', 'rackCase', 'rackPanel', 'rackShelf'])
    for (const id of ART_IDS) {
      const svg = ART[id]
      expect(svg.length, id).toBeGreaterThan(500)
      expect(svg.length, id).toBeLessThanOrEqual(BUDGET)
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      expect(doc.querySelector('parsererror'), id).toBeNull()
      expect(doc.documentElement.getAttribute('viewBox'), id).toBeTruthy()
      expect(doc.querySelectorAll('[class^="art-t"]').length, id).toBeGreaterThanOrEqual(3)
      expect(doc.querySelector('.art-edge'), id).not.toBeNull()
      expect(svg, id).not.toMatch(/fill="|stroke="|style=/)
    }
  })
})

describe('стартовая страница Gridfinity с рендерами', () => {
  beforeEach(async () => { getModelClient.mockClear(); await i18n.changeLanguage('en') })
  it('каждая карточка содержит декоративный svg с классами арта', () => {
    render(<I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/gridfinity'] })} /></I18nextProvider>)
    for (const { artId: id } of MODES) {
      const art = screen.getByTestId(`art-${id}`)
      expect(art).toHaveAttribute('aria-hidden', 'true')
      expect(art.querySelector('svg')).not.toBeNull()
      expect(art.querySelector('.art-t3, .art-t2')).not.toBeNull()
      expect(art.querySelector('[fill]:not([fill-rule])')).toBeNull()
    }
  })
  it('воркер не стартует, вьюпорт и WebGL не создаются', () => {
    const worker = vi.fn()
    vi.stubGlobal('Worker', worker)
    render(<I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/gridfinity'] })} /></I18nextProvider>)
    expect(worker).not.toHaveBeenCalled()
    expect(getModelClient).not.toHaveBeenCalled()
    expect(screen.queryByTestId('viewport')).toBeNull()
    vi.unstubAllGlobals()
  })
})

/** Тот же SVG, что файл арта: viewBox и число контуров (сериализация jsdom отличается от исходной строки). */
const sameSvg = (holder: Element, src: string) => {
  const a = holder.querySelector('svg')!, b = new DOMParser().parseFromString(src, 'image/svg+xml').documentElement
  return a.getAttribute('viewBox') === b.getAttribute('viewBox') && a.querySelectorAll('path').length === b.querySelectorAll('path').length && b.querySelectorAll('path').length > 3
}

describe('карточки с рендерами: продукты и режимы Keychain', () => {
  beforeEach(async () => { getModelClient.mockClear(); await i18n.changeLanguage('en') })
  const at = (path: string) => render(<I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></I18nextProvider>)

  it('у каждого продукта и режима задан artId из набора иллюстраций', () => {
    for (const p of PRODUCTS) {
      expect(ART_IDS).toContain(p.artId)
      for (const m of p.modes ?? []) expect(ART_IDS, `${p.id}/${m.id}`).toContain(m.artId)
    }
    expect(PRODUCTS.map((p) => p.artId)).toEqual(['box', 'keychainImage', 'rackPanel'])
  })
  it('корневая страница: карточка Gridfinity показывает коробку, Keychain — брелок «Изображение»; значков вместо рендеров нет', () => {
    at('/')
    const gf = screen.getByTestId('card-gridfinity'), kc = screen.getByTestId('card-keychain')
    expect(gf.querySelector('[data-testid="art-box"] svg')).not.toBeNull()
    expect(kc.querySelector('[data-testid="art-keychainImage"] svg')).not.toBeNull()
    for (const [card, art] of [[gf, 'box'], [kc, 'keychainImage']] as const) {
      const holder = card.querySelector(`[data-testid="art-${art}"]`)!
      expect(holder.querySelector('.tabler-icon')).toBeNull() // значок продукта не используется как иллюстрация
      expect(sameSvg(holder, ART[art])).toBe(true)
    }
  })
  it('корневая страница: карточка Rack показывает рендер панели; страница /rack — тот же рендер у карточки Panel', () => {
    const { unmount } = at('/')
    const holder = screen.getByTestId('card-rack').querySelector('[data-testid="art-rackPanel"]')!
    expect(holder.querySelector('svg')).not.toBeNull(); expect(holder).toHaveAttribute('aria-hidden', 'true')
    expect(sameSvg(holder, ART.rackPanel)).toBe(true)
    unmount()
    at('/rack')
    expect(sameSvg(screen.getByTestId('card-panel').querySelector('[data-testid="art-rackPanel"]')!, ART.rackPanel)).toBe(true)
  })
  it('страница выбора Keychain: «Изображение» и «Форма» — каждая со своим рендером, декоративным и без цветов', () => {
    at('/keychain')
    for (const [card, art] of [['card-image', 'keychainImage'], ['card-shape', 'keychainShape']] as const) {
      const holder = screen.getByTestId(card).querySelector(`[data-testid="art-${art}"]`)!
      expect(holder).toHaveAttribute('aria-hidden', 'true')
      expect(sameSvg(holder, ART[art])).toBe(true)
      expect(holder.querySelector('.art-t3, .art-t2')).not.toBeNull()
    }
    expect(ART.keychainImage).not.toBe(ART.keychainShape)
  })
  it('стартовые страницы не запускают воркер, не создают WebGL и не обращаются к сети', () => {
    const worker = vi.fn(), fetchSpy = vi.fn()
    vi.stubGlobal('Worker', worker)
    vi.stubGlobal('fetch', fetchSpy)
    for (const path of ['/', '/gridfinity', '/keychain']) { const r = at(path); r.unmount() }
    expect(worker).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getModelClient).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
