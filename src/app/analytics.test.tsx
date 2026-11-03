// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { routes } from './routes'
import { CONSENT_KEY, resetConsentForTests, setConsent } from './analytics'
import { AnalyticsHost } from './AnalyticsHost'
import { METRIKA_ID } from './site'

vi.mock('../features/viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))
vi.mock('./useModel', () => ({
  useModel: () => ({ model: null, busy: false, pending: false, error: null }),
  getModelClient: () => ({ registerMesh: () => {}, generate: async () => null }),
}))

const scripts = () => [...document.querySelectorAll('script')].filter((s) => /mc\.yandex\./.test(s.src))
const at = (path = '/') => render(<I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></I18nextProvider>)
const disableFlag = () => (window as unknown as Record<string, unknown>)[`disableYaCounter${METRIKA_ID}`]
const clearCookies = () => document.cookie.split(';').forEach((c) => { document.cookie = `${c.split('=')[0].trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/` })

beforeEach(async () => {
  localStorage.clear()
  clearCookies()
  delete (window as unknown as Record<string, unknown>)[`disableYaCounter${METRIKA_ID}`]
  resetConsentForTests()
  await i18n.changeLanguage('en')
})
afterEach(() => { vi.restoreAllMocks() })

// В этом файле согласие никогда не даётся: пакет подключает скрипт один раз на страницу, поэтому проверки «ничего не загружено»
// и проверки «загружено» живут в разных файлах (analytics.granted.test.tsx).
describe('без согласия ничего не загружается (3.1, 3.2)', () => {
  it('до согласия ничего не загружается, даже при монтировании хоста', async () => {
    render(<AnalyticsHost />)
    await new Promise((r) => setTimeout(r, 50))
    expect(scripts()).toHaveLength(0)
  })

  it('Decline: ничего не грузится и выбор запоминается', async () => {
    render(<AnalyticsHost />)
    act(() => setConsent('denied'))
    await new Promise((r) => setTimeout(r, 50))
    expect(scripts()).toHaveLength(0)
    expect(localStorage.getItem(CONSENT_KEY)).toBe('denied')
    act(() => resetConsentForTests())
    expect(scripts()).toHaveLength(0)
  })

  it('ошибка хранилища не бросает исключение: выбор живёт до перезагрузки', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => act(() => setConsent('denied'))).not.toThrow()
  })

  it('первый визит: баннер виден, запросов к аналитике нет, обе кнопки одинаковы', async () => {
    at()
    expect(screen.getByTestId('consent-banner')).toHaveAccessibleName('Analytics consent')
    const accept = screen.getByRole('button', { name: 'Accept' }), decline = screen.getByRole('button', { name: 'Decline' })
    expect(accept.className).toBe(decline.className)
    await new Promise((r) => setTimeout(r, 50))
    expect(scripts()).toHaveLength(0)
  })

  it('Decline закрывает баннер, ничего не грузит, баннер не возвращается после перезагрузки', async () => {
    const first = at()
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(screen.queryByTestId('consent-banner')).toBeNull()
    first.unmount()
    act(() => resetConsentForTests())
    at()
    expect(screen.queryByTestId('consent-banner')).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    expect(scripts()).toHaveLength(0)
  })

  it('баннер отображается всплывающей плашкой в левом нижнем углу с скруглёнными углами', () => {
    at()
    const banner = screen.getByTestId('consent-banner')
    expect(banner.className).toMatch(/\bfixed\b/)
    expect(banner).toHaveClass('bottom-4', 'left-4', 'rounded-2xl', 'shadow-float')
  })

  it('в тексте баннера не названа конкретная система аналитики (en и ru)', async () => {
    at()
    expect(screen.getByTestId('consent-banner')).not.toHaveTextContent(/yandex|metrika|метрик|яндекс/i)
    await i18n.changeLanguage('ru')
    expect(screen.getByTestId('consent-banner')).not.toHaveTextContent(/yandex|metrika|метрик|яндекс/i)
  })

  it('тексты баннера есть на русском', async () => {
    await i18n.changeLanguage('ru')
    at()
    expect(screen.getByRole('button', { name: 'Принять' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeInTheDocument()
  })
})
