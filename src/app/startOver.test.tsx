// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { routes } from './routes'
import { defaultBox } from '../geometry/box'
import { defaultParams } from '../geometry/baseplate'
import { defaultCutout, rectCutout } from '../geometry/cutout'
import { defaultKeychain } from '../geometry/keychain'
import { defaultShapeState } from '../features/keychain/shapeState'
import { defaultRackPanel } from '../geometry/rack/panel'
import { defaultRackCase } from '../geometry/rack/case'
import { defaultRackShelf } from '../geometry/rack/shelf'

const generate = vi.fn()
vi.mock('./useModel', () => ({
  useModel: (mode: string, params: unknown, opts?: { enabled?: boolean }) => { generate(mode, params, opts); return { model: null, busy: false, pending: false, error: null } },
  getModelClient: () => ({ registerMesh: () => {}, registerImage: () => {}, registerText: () => {}, generate: async () => null }),
}))
vi.mock('../features/viewport/Viewport', () => ({ Viewport: () => <div data-testid="viewport" /> }))
vi.setConfig({ testTimeout: 30000 })

const open = (path: string) => render(<I18nextProvider i18n={i18n}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></I18nextProvider>)
const store = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null')
const sections = () => screen.queryAllByRole('button', { name: /^(Expand|Collapse): / })
// параметры экспорта общие для режимов и «Начать заново» их не трогает, поэтому в подсветке режима не участвуют
const changedSections = () => sections().filter((b) => / \(changed\)$/.test(b.getAttribute('aria-label') ?? '') && !/Export options/.test(b.getAttribute('aria-label') ?? ''))

interface Mode { name: string; path: string; key: string; modeName: string; dirty: () => unknown; defaults: unknown; extra?: () => void }
const MODES: Mode[] = [
  { name: 'Box', path: '/gridfinity/box', key: 'gridfinity.box', modeName: 'Box', dirty: () => ({ ...defaultBox, lip: 'thin', x: { mode: 'units', value: 4, align: 'center' } }), defaults: defaultBox },
  { name: 'Baseplate', path: '/gridfinity/baseplate', key: 'gridfinity.baseplate', modeName: 'Baseplate', dirty: () => ({ x: { mode: 'units', value: 5, align: 'center' }, thickness: { ...defaultParams.thickness, floor: 3 } }), defaults: defaultParams },
  { name: 'Cutout', path: '/gridfinity/cutout', key: 'gridfinity.cutout', modeName: 'Cutout', dirty: () => ({ ...defaultCutout, lip: 'none', cutouts: [rectCutout({ name: 'Tool' })] }), defaults: defaultCutout },
  { name: 'Keychain image', path: '/keychain/image', key: 'keychain.relief', modeName: 'Image', dirty: () => ({ ...defaultKeychain, imageName: '', imageId: '', relief: { ...defaultKeychain.relief, hmax: 4 }, silhouette: { ...defaultKeychain.silhouette, close: 9 } }), defaults: { ...defaultKeychain, imageName: '' } },
  { name: 'Keychain shape', path: '/keychain/shape', key: 'keychain.shape', modeName: 'Shape', dirty: () => ({ ...defaultShapeState, shape: { ...defaultShapeState.shape, kind: 'circle', width: 44 }, base: { ...defaultShapeState.base, thickness: 3 } }), defaults: defaultShapeState },
  { name: 'Rack panel', path: '/rack/panel', key: 'rack.panel', modeName: 'Panel', dirty: () => ({ ...defaultRackPanel, units: 4, back: { enabled: true, thickness: 1 } }), defaults: defaultRackPanel },
  { name: 'Rack case', path: '/rack/case', key: 'rack.case', modeName: 'Enclosure', dirty: () => ({ ...defaultRackCase, device: { ...defaultRackCase.device, width: 90 }, vents: { ...defaultRackCase.vents, enabled: true } }), defaults: defaultRackCase },
  { name: 'Rack shelf', path: '/rack/shelf', key: 'rack.shelf', modeName: 'Shelf', dirty: () => ({ ...defaultRackShelf, lips: { height: 6, wall: 2 }, units: 3 }), defaults: defaultRackShelf },
]
const OTHER_KEYS = ['gridfinity.box', 'gridfinity.baseplate', 'gridfinity.cutout', 'keychain.relief', 'keychain.shape', 'rack.panel', 'rack.case', 'rack.shelf']

describe('Начать заново', () => {
  beforeEach(async () => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); generate.mockClear(); await i18n.changeLanguage('en') })

  it.each(MODES)('$name: кнопка доступна при свёрнутых секциях, подтверждение сбрасывает параметры и подсветку, сохраняется в хранилище', async (m) => {
    OTHER_KEYS.forEach((k) => localStorage.setItem(k, JSON.stringify(k === m.key ? m.dirty() : { marker: k })))
    localStorage.setItem('gridfinity.export', JSON.stringify({ gap: 33 }))
    localStorage.setItem('gridfinity.unit', JSON.stringify({ unit: 'in' }))
    open(m.path)
    const btn = await screen.findByRole('button', { name: 'Start over' })
    expect(sections().every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true) // кнопка видна при полностью свёрнутой панели
    // у режима «Изображение» без картинки секций параметров нет (только подсказка), поэтому подсветку проверяем у остальных
    if (m.path !== '/keychain/image') expect(changedSections().length).toBeGreaterThan(0)

    await userEvent.click(btn)
    const dlg = await screen.findByRole('alertdialog')
    expect(within(dlg).getByText(new RegExp(`“${m.modeName}”`))).toBeInTheDocument()
    expect(store(m.key)).toEqual(expect.objectContaining(store(m.key))) // пока не сброшено
    await userEvent.click(within(dlg).getByRole('button', { name: 'Reset settings' }))

    await waitFor(() => expect(store(m.key)).toEqual(JSON.parse(JSON.stringify(m.defaults))))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(changedSections()).toHaveLength(0))
    // чужое не тронуто
    for (const k of OTHER_KEYS.filter((k) => k !== m.key)) expect(store(k)).toEqual({ marker: k })
    expect(store('gridfinity.export')).toEqual({ gap: 33 })
    expect(store('gridfinity.unit')).toEqual({ unit: 'in' })
    expect(localStorage.getItem('gridfinity.lang')).toBe('en')
    // модель перестраивается с умолчаниями
    await waitFor(() => expect(generate.mock.calls.length).toBeGreaterThan(0))
  })

  it.each(MODES)('$name: «Отмена» и Esc ничего не меняют, фокус возвращается на кнопку', async (m) => {
    localStorage.setItem(m.key, JSON.stringify(m.dirty()))
    open(m.path)
    const btn = await screen.findByRole('button', { name: 'Start over' })
    await waitFor(() => expect(localStorage.getItem(m.key)).not.toBeNull())
    const before = localStorage.getItem(m.key) // после монтирования: режим дописывает умолчания в сохранённое
    await userEvent.click(btn)
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(btn).toHaveFocus())

    await userEvent.click(btn)
    await screen.findByRole('alertdialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(btn).toHaveFocus())

    await userEvent.click(btn)
    await userEvent.click(await screen.findByTestId('confirm-backdrop'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(localStorage.getItem(m.key)).toBe(before)
  })

  it('Tab остаётся внутри окна подтверждения', async () => {
    open('/gridfinity/box')
    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }))
    const dlg = await screen.findByRole('alertdialog')
    const [cancel, confirm] = within(dlg).getAllByRole('button')
    expect(cancel).toHaveFocus()
    await userEvent.tab(); expect(confirm).toHaveFocus()
    await userEvent.tab(); expect(cancel).toHaveFocus()
    await userEvent.tab({ shift: true }); expect(confirm).toHaveFocus()
  })

  it('перезагрузка после сброса: режим открывается с умолчаниями (Box)', async () => {
    localStorage.setItem('gridfinity.box', JSON.stringify(MODES[0].dirty()))
    const first = open('/gridfinity/box')
    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reset settings' }))
    await waitFor(() => expect(store('gridfinity.box')).toEqual(JSON.parse(JSON.stringify(defaultBox))))
    first.unmount()
    open('/gridfinity/box')
    await screen.findByRole('button', { name: 'Start over' })
    expect(changedSections()).toHaveLength(0)
  })

  it('Cutout: вырез из импорта больше не используется, режим показывает пустое состояние', async () => {
    localStorage.setItem('gridfinity.cutout', JSON.stringify(MODES[2].dirty()))
    open('/gridfinity/cutout')
    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reset settings' }))
    await userEvent.click(await screen.findByRole('button', { name: /^Expand: Cutouts/ }))
    expect(await screen.findByText(/No cutouts yet/)).toBeInTheDocument()
  })

  it('Keychain image: ссылка на изображение сброшена, режим показывает подсказку выбрать изображение', async () => {
    localStorage.setItem('keychain.relief', JSON.stringify(MODES[3].dirty()))
    open('/keychain/image')
    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reset settings' }))
    expect(await screen.findByText(/Choose an image to start/)).toBeInTheDocument()
    await waitFor(() => expect(store('keychain.relief').imageId).toBe(''))
  })

  it('русский: кнопка, заголовок, текст и кнопки окна на русском', async () => {
    await i18n.changeLanguage('ru')
    open('/gridfinity/box')
    await userEvent.click(await screen.findByRole('button', { name: 'Начать заново' }))
    const dlg = await screen.findByRole('alertdialog')
    expect(within(dlg).getByText('Начать заново?')).toBeInTheDocument()
    expect(within(dlg).getByText(/Все настройки режима «Коробка»/)).toBeInTheDocument()
    expect(within(dlg).getByRole('button', { name: 'Отмена' })).toBeInTheDocument()
    expect(within(dlg).getByRole('button', { name: 'Сбросить настройки' })).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })
})
