// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { openSection } from '../../ui/renderOpen'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import { routes } from '../../app/routes'
import type { ModelResult } from '../../geometry/model'
import { getLogSnapshot, resetActivityLog } from '../../app/activityLog'
import type { GrayImage } from '../../geometry/raster/threshold'

const registered: string[] = []
const generate = vi.fn()
let answer: ModelResult | null = null
vi.mock('../../app/useModel', () => ({
  useModel: (mode: string, params: unknown, opts?: { enabled?: boolean }) => { generate(mode, params, opts); return { model: opts?.enabled === false ? null : answer, busy: false, pending: false, error: null } },
  getModelClient: () => ({ registerImage: (id: string) => registered.push(id), registerMesh: () => {}, generate: async () => null }),
}))
vi.mock('../viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))
const tiny: GrayImage = { width: 4, height: 4, gray: new Uint8Array(16), alpha: null }
vi.mock('./decodeImage', async (orig) => {
  const real = await orig<typeof import('./decodeImage')>()
  return { ...real, decodeColorImage: vi.fn(async (f: File) => (f.type === 'image/png' ? { image: tiny, color: { width: 4, height: 4, rgb: new Uint8Array(48) }, original: { width: 4, height: 4 }, downscaled: false } : real.decodeColorImage(f))) }
})

const open = () => render(<I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/keychain/image'] })} /></I18nextProvider>)
const png = () => new File(['x'], 'logo.png', { type: 'image/png' })

describe('Keychain: изображение (4.1)', () => {
  beforeEach(async () => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); registered.length = 0; generate.mockClear(); answer = null; await i18n.changeLanguage('en') })

  it('открывается: подсказка выбрать изображение, секций силуэта пока нет, генерация не идёт', async () => {
    open()
    expect(await screen.findByText(/Choose an image to start/)).toBeInTheDocument()
    // секция «Изображение» свёрнута, но первый шаг доступен прямо в подсказке
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeInTheDocument()
    expect(screen.getByTestId('image-input-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('image-input')).toBeNull()
    expect(screen.queryByText('Silhouette')).toBeNull()
    expect(screen.getByTestId('viewport')).toBeInTheDocument()
    expect(generate.mock.calls.every((c) => c[2]?.enabled === false)).toBe(true)
  })
  it('допустимый файл: изображение регистрируется в воркере, появляются секции, идёт генерация keychain', async () => {
    open()
    await userEvent.upload(await screen.findByTestId('image-input-empty'), png())
    expect(await screen.findByText('Silhouette')).toBeInTheDocument()
    expect(registered).toHaveLength(1)
    await waitFor(() => expect(generate.mock.calls.some((c) => c[0] === 'keychain' && c[2]?.enabled === true)).toBe(true))
    expect(screen.getByText('logo.png', { selector: 'span.ml-auto' })).toBeInTheDocument()
  })
  it('перетаскивание файла на страницу тоже импортирует', async () => {
    const { container } = open()
    await screen.findByTestId('image-input-empty')
    fireEvent.drop(container.querySelector('div.flex.min-h-0.flex-1')!, { dataTransfer: { files: [png()] } })
    expect(await screen.findByText('Silhouette')).toBeInTheDocument()
  })
  it('текстовый файл: сообщение об ошибке, прежнего состояния не меняет', async () => {
    open()
    await userEvent.upload(await screen.findByTestId('image-input-empty'), new File(['hello'], 'a.txt', { type: 'text/plain' }), { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('not supported')
    expect(screen.queryByText('Silhouette')).toBeNull()
    expect(registered).toHaveLength(0)
  })
  it('ошибка не стирает уже загруженное изображение', async () => {
    open()
    await userEvent.upload(await screen.findByTestId('image-input-empty'), png())
    await screen.findByText('Silhouette')
    await openSection('Image')
    await userEvent.upload(screen.getByTestId('image-input'), new File(['hello'], 'a.txt', { type: 'text/plain' }), { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('not supported')
    expect(screen.getByText('Silhouette')).toBeInTheDocument()
    expect(localStorage.getItem('keychain.relief')).toContain('logo.png')
  })
  it('перезагрузка: то же изображение берётся из IndexedDB и снова регистрируется в воркере; параметры сохраняются', async () => {
    const first = open()
    await userEvent.upload(await screen.findByTestId('image-input-empty', {}, { timeout: 5000 }), png())
    await screen.findByText('Silhouette', {}, { timeout: 5000 })
    const saved = JSON.parse(localStorage.getItem('keychain.relief')!)
    saved.silhouette.threshold = 77
    localStorage.setItem('keychain.relief', JSON.stringify(saved))
    first.unmount(); registered.length = 0
    open()
    expect(await screen.findByText('Silhouette', {}, { timeout: 5000 })).toBeInTheDocument()
    await waitFor(() => expect(registered).toHaveLength(1), { timeout: 5000 })
    expect(screen.getByText('Threshold 77')).toBeInTheDocument()
  }, 20000)
  it('сохранённое изображение пропало из хранилища: предупреждение и пустое состояние', async () => {
    localStorage.setItem('keychain.relief', JSON.stringify({ imageId: 'gone', imageName: 'gone.png' }))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('was not found')
    expect(screen.getByText(/Choose an image to start/)).toBeInTheDocument()
  })
  it('частично сохранённые параметры не ломают режим', async () => {
    localStorage.setItem('keychain.relief', JSON.stringify({ silhouette: { close: 5 }, relief: null, base: 'x' }))
    open()
    expect(await screen.findByText(/Choose an image to start/)).toBeInTheDocument()
  })
  it('журнал: импорт изображения и ошибка пишут строки с именем и размером, без содержимого файла', async () => {
    resetActivityLog()
    open()
    await userEvent.upload(await screen.findByTestId('image-input-empty'), png())
    await screen.findByText('Silhouette')
    await openSection('Image')
    await userEvent.upload(screen.getByTestId('image-input'), new File(['hello'], 'a.txt', { type: 'text/plain' }), { applyAccept: false })
    await screen.findByRole('alert')
    const lines = getLogSnapshot().entries.filter((e) => e.source === 'image')
    expect(lines[0]).toMatchObject({ level: 'info', key: 'log.image.imported', params: { name: 'logo.png', width: 4, height: 4 } })
    expect(lines.at(-1)).toMatchObject({ level: 'error', key: 'log.image.importFailed', params: { name: 'a.txt' } })
    expect(JSON.stringify(lines)).not.toContain('hello')
  })
})
