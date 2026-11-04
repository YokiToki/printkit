// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { routes } from './routes'
import { ART, ART_IDS, artHue, ModeArt } from './ModeArt'
import manifest from './art/manifest.json'
import { MODES } from './modes'
import { PRODUCTS } from './products'

const getModelClient = vi.fn()
vi.mock('./useModel', () => ({ useModel: () => ({ model: null, busy: false, pending: false, error: null }), getModelClient: (...a: unknown[]) => getModelClient(...a) }))
vi.mock('../features/viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))

const BUDGET = 60 * 1024

type NodeFs = { readFileSync(path: string, encoding: 'utf8'): string }
const nodeFs = (globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): NodeFs; cwd(): string } }).process
const theme = nodeFs.getBuiltinModule('node:fs').readFileSync(`${nodeFs.cwd()}/src/app/theme.css`, 'utf8')

describe('иллюстрации карточек', () => {
  it('девять иллюстраций (editor, box, baseplate, cutout, keychainImage, keychainShape, rackPanel, rackCase, rackShelf): валидный SVG до 60 КБ, тона классами, без цветов', () => {
    expect(ART_IDS.sort()).toEqual(['baseplate', 'box', 'cutout', 'editor', 'keychainImage', 'keychainShape', 'rackCase', 'rackPanel', 'rackShelf'])
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

describe('воздух вокруг рисунков (36-site-refresh)', () => {
  it('манифест покрывает все иллюстрации, у каждой не меньше 6 % свободного поля с каждой стороны', () => {
    expect(Object.keys(manifest).sort()).toEqual([...ART_IDS].sort())
    for (const id of ART_IDS) {
      const m = (manifest as Record<string, { w: number; h: number }>)[id]
      expect(m.w, `${id} ширина`).toBeLessThanOrEqual(1 - 2 * 0.06 + 1e-9)
      expect(m.h, `${id} высота`).toBeLessThanOrEqual(1 - 2 * 0.06 + 1e-9)
    }
  })
  it('брелок «Изображение» не выше коробки Gridfinity', () => {
    expect(manifest.keychainImage.h).toBeLessThanOrEqual(manifest.box.h + 1e-9)
  })
})

describe('оттенок иллюстраций по продукту (36-site-refresh)', () => {
  it('каждый art id отображается на оттенок своего продукта, обёртка несёт data-hue', () => {
    const want: Record<string, string> = {
      editor: 'editor',
      box: 'gridfinity', baseplate: 'gridfinity', cutout: 'gridfinity',
      keychainImage: 'keychain', keychainShape: 'keychain',
      rackPanel: 'rack', rackCase: 'rack', rackShelf: 'rack',
    }
    for (const id of ART_IDS) expect(artHue(id), id).toBe(want[id])
    for (const id of ART_IDS) {
      const { unmount } = render(<ModeArt id={id} />)
      expect(screen.getByTestId(`art-${id}`), id).toHaveAttribute('data-hue', want[id])
      unmount()
    }
  })
  it('файлы иллюстраций не менялись: только классы, без цветовых литералов', () => {
    for (const id of ART_IDS) {
      expect(ART[id], id).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(ART[id], id).not.toMatch(/fill="|stroke="|style=/)
    }
  })
  it('три лестницы задают все семь тонов, цвет контура общий', () => {
    for (let i = 0; i <= 6; i++) {
      expect(theme).toMatch(new RegExp(`--color-art-${i}: #`))
      expect(theme).toMatch(new RegExp(`--color-art-keychain-${i}: #`))
      expect(theme).toMatch(new RegExp(`--color-art-rack-${i}: #`))
    }
    expect(theme).toMatch(/--color-art-edge: #/)
    for (const hue of ['editor', 'keychain', 'rack']) for (let i = 0; i <= 6; i++) {
      expect(theme).toContain(`[data-hue='${hue}'] .art-t${i} { fill: var(--color-art-${hue}-${i}); }`)
    }
  })
  it('акцент, фокус и кнопки от оттенка не зависят: в блоках data-hue только тона арта и цвета логотипа', () => {
    const blocks = [...theme.matchAll(/\[data-hue='(\w+)'\][^{]*\{([^}]*)\}/g)]
    expect(blocks.length).toBeGreaterThan(0)
    for (const [, , body] of blocks) {
      expect(body).not.toMatch(/accent|focus|button|border|text|surface/)
      expect(body).toMatch(/--color-(art|logo)-/)
    }
    for (const face of ['top', 'left', 'right']) expect(theme).toMatch(new RegExp(`--color-logo-${face}: #`))
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
    expect(PRODUCTS.map((p) => p.artId)).toEqual(['editor', 'box', 'keychainImage', 'rackPanel'])
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
