// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import { resetActivityLog } from '../../app/activityLog'
import { createModelStore } from '../../ml/modelStore'
import { MODELS, type ModelSpec } from '../../ml/models'
import { createMlService } from '../../ml/service'
import { ModelManager } from './ModelManager'

const hexOf = async (d: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', d)), (x) => x.toString(16).padStart(2, '0')).join('')
const content = (n: number, v: number) => new Uint8Array(n).fill(v)

async function spec(id: string, n: number, v: number, over: Partial<ModelSpec> = {}): Promise<ModelSpec> {
  return { ...MODELS[2], id, name: `Model ${id}`, url: `https://huggingface.co/x/${id}/resolve/${MODELS[2].revision}/m.onnx`, bytes: n, sha256: await hexOf(content(n, v).buffer), ...over }
}
const stream = (b: Uint8Array) => new Response(new ReadableStream({ start(c) { c.enqueue(b); c.close() } }))
const caps = { webgpu: false, f16: false }

async function setup(fetchImpl?: (url: string) => Promise<Response>) {
  const a = await spec('a', 1048576, 1), b = await spec('b', 2097152, 2), g = await spec('g', 1048576, 3, { backends: ['webgpu'], purpose: 'fast' })
  const fetchMock = vi.fn(fetchImpl ?? (async (url: string) => stream(content(url.includes('/a/') ? 1048576 : 2097152, url.includes('/a/') ? 1 : 2))))
  const store = createModelStore({ fetch: fetchMock as unknown as typeof fetch, caches: undefined, digest: hexOf, registry: [a, b, g], storage: undefined })
  const service = createMlService({ client: { load: vi.fn(), matte: vi.fn(), cancel: vi.fn() }, store, caps: async () => caps })
  render(<I18nextProvider i18n={i18n}><ModelManager store={store} service={service} caps={caps} models={[a, b, g]} /></I18nextProvider>)
  return { a, b, g, fetchMock, store, user: userEvent.setup() }
}
const row = (id: string) => screen.getByTestId(`model-${id}`)

describe('ModelManager (32, 5.2)', () => {
  beforeEach(async () => { resetActivityLog(); await i18n.changeLanguage('en') })

  it('без подтверждения ничего не скачивается: «Скачать» открывает окно с размером, сервером и лицензией; «Отмена» ничего не качает', async () => {
    const { fetchMock, user } = await setup()
    await user.click(within(row('a')).getByRole('button', { name: 'Download' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('1 MB'); expect(dialog).toHaveTextContent('huggingface.co'); expect(dialog).toHaveTextContent('Apache-2.0')
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull(); expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('status-a')).toHaveTextContent('Not downloaded')
  })

  it('подтверждение скачивает модель: состояние «Готова», удаление возвращает «Не скачана» и снова просит подтверждение', async () => {
    const { fetchMock, user } = await setup()
    await user.click(within(row('a')).getByRole('button', { name: 'Download' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(screen.getByTestId('status-a')).toHaveTextContent(/Ready|In use/))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await user.click(within(row('a')).getByRole('button', { name: 'Delete' }))
    expect(screen.getByTestId('status-a')).toHaveTextContent('Not downloaded')
    await user.click(within(row('a')).getByRole('button', { name: 'Download' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument(); expect(fetchMock).toHaveBeenCalledTimes(1) // согласие спрашивается заново
  })

  it('прогресс виден в строке, «Отмена» останавливает загрузку и возвращает «Не скачана»', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const { user } = await setup(async () => new Response(new ReadableStream({ async start(c) { c.enqueue(content(524288, 1)); await gate; c.close() } })))
    await user.click(within(row('a')).getByRole('button', { name: 'Download' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(screen.getByTestId('status-a')).toHaveTextContent('Downloading 50 %'))
    expect(within(row('a')).getByRole('progressbar')).toBeInTheDocument()
    await user.click(within(row('a')).getByRole('button', { name: 'Cancel' }))
    release()
    await waitFor(() => expect(screen.getByTestId('status-a')).toHaveTextContent('Not downloaded'))
  })

  it('ошибка загрузки видна в строке и в журнале; кнопка «Скачать» остаётся для повторной попытки', async () => {
    const { user } = await setup(async () => { throw new Error('offline') })
    await user.click(within(row('a')).getByRole('button', { name: 'Download' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(screen.getByTestId('status-a')).toHaveTextContent('Failed: network error'))
    expect(within(row('a')).getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('две модели рядом, выбор рабочей; модель только для WebGPU помечена недоступной с причиной и без кнопки загрузки', async () => {
    const { store, user } = await setup()
    for (const id of ['a', 'b']) {
      await user.click(within(row(id)).getByRole('button', { name: 'Download' }))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Download' }))
      await waitFor(() => expect(screen.getByTestId(`status-${id}`)).toHaveTextContent(/Ready|In use/))
    }
    expect(screen.getByTestId('models-used')).toHaveTextContent('3 MB')
    await user.click(within(row('b')).getByRole('radio'))
    expect(store.activeFor('matte')).toBe('b')
    expect(screen.getByTestId('status-g')).toHaveTextContent('Needs WebGPU')
    expect(within(row('g')).queryByRole('button', { name: 'Download' })).toBeNull()
  })

  it('«Удалить все» спрашивает подтверждение; ссылка «Открыть журнал» есть', async () => {
    const { user } = await setup()
    await user.click(within(row('a')).getByRole('button', { name: 'Download' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(screen.getByTestId('status-a')).toHaveTextContent(/Ready|In use/))
    await user.click(screen.getByRole('button', { name: 'Delete all' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete all' }))
    expect(screen.getByTestId('status-a')).toHaveTextContent('Not downloaded')
    expect(screen.getByRole('button', { name: 'Open the log' })).toBeInTheDocument()
  })

  it('модели глубины в своём разделе, у каждого вида свой выбор рабочей', async () => {
    const m = await spec('m', 1048576, 1), dp = await spec('dp', 1048576, 4, { kind: 'depth', name: 'Depth model' })
    const store = createModelStore({ fetch: (async () => stream(content(1048576, 1))) as unknown as typeof fetch, caches: undefined, digest: hexOf, registry: [m, dp], storage: undefined })
    const service = createMlService({ client: { load: vi.fn(), matte: vi.fn(), cancel: vi.fn() }, store, caps: async () => caps })
    render(<I18nextProvider i18n={i18n}><ModelManager store={store} service={service} caps={caps} models={[m, dp]} /></I18nextProvider>)
    expect(screen.getByRole('region', { name: 'Silhouette (mask)' })).toBeInTheDocument()
    const depthSection = screen.getByRole('region', { name: 'Depth map' })
    expect(within(depthSection).getByTestId('model-dp')).toBeInTheDocument(); expect(within(depthSection).queryByTestId('model-m')).toBeNull()
    expect(depthSection.querySelector('input[type=radio]')!.getAttribute('name')).toBe('active-depth')
  })
})
