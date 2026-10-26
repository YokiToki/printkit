// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import { getLogSnapshot, resetActivityLog, startJob } from '../../app/activityLog'
import { defaultKeychain, type MaskPreview as Preview, type SilhouetteParams } from '../../geometry/keychain'
import { MODELS } from '../../ml/models'
import { UnitContext } from '../../ui/units'
import { useModelManagerOpen } from '../ml/managerState'
import { MaskPreview } from './MaskPreview'
import type { MatteControl } from './matte'
import { SilhouetteSection, type AiSource } from './SilhouetteSection'

const MODEL = MODELS[2]
const control = (over: Partial<MatteControl> = {}): MatteControl => ({ model: MODEL, running: false, error: null, matte: null, matteModel: '', lost: false, run: vi.fn(async () => {}), ...over })
const src = (c: MatteControl, over: Partial<AiSource> = {}): AiSource => ({ control: c, imageSize: { width: 10, height: 10 }, transparent: false, svg: false, logo: false, ...over })
const preview: Preview = { width: 4, height: 4, data: new Uint8Array(16), labels: new Uint16Array(16), areas: [{ id: 1, size: 300, cx: 2, cy: 2, open: true, mode: 'open', level: 0.6 }], box: { x0: 0, y0: 0, x1: 1, y1: 1 } } as unknown as Preview

function Probe() { return useModelManagerOpen() ? <span data-testid="manager-open" /> : null }
function setup(s: Partial<SilhouetteParams> = {}, aiSource?: AiSource, extra: { preview?: Preview | null } = {}) {
  const onChange = vi.fn()
  const value: SilhouetteParams = { ...defaultKeychain.silhouette, ...s }
  render(<UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}><Probe /><SilhouetteSection value={value} threshold={128} preview={extra.preview ?? null} onChange={onChange} aiSource={aiSource} /></UnitContext.Provider>)
  return { onChange, open: () => userEvent.click(screen.getByRole('button', { name: /Expand: Silhouette/ })) }
}
const ai: Partial<SilhouetteParams> = { source: 'ai' }

describe('Silhouette: источник ИИ (33, 4.1)', () => {
  beforeEach(async () => { resetActivityLog(); await i18n.changeLanguage('en') })

  it('яркость по умолчанию и без изменений: переключателя нет без сведений об изображении, все прежние поля на месте', async () => {
    const { open } = setup()
    await open()
    expect(screen.queryByRole('group', { name: 'Silhouette from' })).toBeNull()
    expect(screen.getByLabelText('Threshold')).toBeInTheDocument(); expect(screen.getByText(/^Invert/)).toBeInTheDocument()
  })

  it('переключатель Яркость | ИИ меняет источник; под ИИ скрыты порог и инверсия, остаются смыкание, пятна, расширение, заливка', async () => {
    const a = setup({}, src(control())); await a.open()
    const group = screen.getByRole('group', { name: 'Silhouette from' })
    expect(within(group).getByRole('button', { name: 'Brightness' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(group).getByRole('button', { name: 'AI' }))
    expect(a.onChange).toHaveBeenCalledWith({ source: 'ai' })
    document.body.innerHTML = ''
    const b = setup(ai, src(control())); await b.open()
    expect(screen.queryByLabelText('Threshold')).toBeNull(); expect(screen.queryByText(/^Invert/)).toBeNull()
    for (const l of ['Close gaps', 'Remove specks', 'Grow']) expect(screen.getAllByText(new RegExp(l, 'i')).length).toBeGreaterThan(0)
    expect(screen.getByTestId('ai-silhouette')).toBeInTheDocument()
  })

  it('без готовой модели «Убрать фон» выключена, есть подсказка и ссылка на менеджер; с моделью включена', async () => {
    const a = setup(ai, src(control({ model: null }))); await a.open()
    expect(screen.getByRole('button', { name: 'Remove background' })).toBeDisabled()
    expect(screen.getByTestId('ai-hint')).toHaveTextContent('Download a model to use AI')
    await userEvent.click(screen.getByRole('button', { name: 'Models…' }))
    expect(screen.getByTestId('manager-open')).toBeInTheDocument()
    document.body.innerHTML = ''
    const run = vi.fn(async () => {}), b = setup(ai, src(control({ run }))); await b.open()
    await userEvent.click(screen.getByRole('button', { name: 'Remove background' }))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('идёт запуск: кнопка выключена; строка состояния повторяет события журнала и показывает итог', async () => {
    const c = control({ running: true }), a = setup(ai, src(c)); await a.open()
    expect(screen.getByRole('button', { name: 'Remove background' })).toBeDisabled()
    let job!: ReturnType<typeof startJob>
    act(() => { job = startJob({ source: 'ai', key: 'log.ai.run', params: { name: 'Net' }, cancel: () => {} }) })
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Running Net…')
    act(() => job.update({ key: 'log.ai.firstPass' }))
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Finding the objects')
    act(() => job.done('log.ai.runDone', { name: 'Net', seconds: '3.0' }))
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Net: done in 3.0 s')
    expect(getLogSnapshot().entries.filter((e) => e.source === 'ai').length).toBe(2)
  })

  it('ползунки обновляют силуэт без запуска сети: меняют порог и сглаживание в параметрах, сеть не вызывается', async () => {
    const run = vi.fn(async () => {}), a = setup({ ...ai, ai: { ...defaultKeychain.silhouette.ai, model: MODEL.id, matteId: 'm' } }, src(control({ run, matte: { width: 2, height: 2, data: new Uint8Array(4) }, matteModel: MODEL.id }))); await a.open()
    const slider = screen.getByRole('slider', { name: /Edge reach/ })
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => { set.call(slider, '70'); slider.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(a.onChange).toHaveBeenLastCalledWith({ ai: expect.objectContaining({ threshold: expect.closeTo(0.3, 5) }) })
    const smooth = screen.getByRole('slider', { name: /Outline smoothness/ })
    act(() => { set.call(smooth, '1.5'); smooth.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(a.onChange).toHaveBeenLastCalledWith({ ai: expect.objectContaining({ smooth: 1.5 }) })
    expect(run).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Reset to model defaults' })).catch(() => {})
  })

  it('«Оставить крупнейший объект» и порог областей пишутся в параметры; порог по умолчанию 150 мм², явный выбор области остаётся', async () => {
    const a = setup(ai, src(control()), { preview }); await a.open()
    expect(screen.getByLabelText('Open areas larger than')).toHaveValue('150')
    await userEvent.click(screen.getByRole('switch', { name: 'Keep only the largest object' }))
    expect(a.onChange).toHaveBeenCalledWith({ ai: expect.objectContaining({ keepLargest: false }) })
    const f = screen.getByLabelText('Open areas larger than')
    await userEvent.clear(f); await userEvent.type(f, '40'); await userEvent.tab()
    expect(a.onChange).toHaveBeenLastCalledWith({ autoOpen: 40 })
    // список областей строится по маске ИИ: область из предпросмотра есть, и её режим меняется как раньше
    expect(screen.getByTestId('area-1')).toBeInTheDocument()
  })

  it('подсказки: прозрачность, логотип; у SVG источника ИИ нет; потерянный результат — предупреждение, пока силуэт по яркости', async () => {
    const a = setup(ai, src(control(), { transparent: true, logo: true })); await a.open()
    expect(screen.getByText(/has transparency, so its own alpha is used as is. AI ignores it/)).toBeInTheDocument()
    expect(screen.getByText(/looks like a logo on a clean background/)).toBeInTheDocument()
    document.body.innerHTML = ''
    const b = setup({}, src(control(), { transparent: true })); await b.open()
    expect(screen.getByText(/has transparency, so its own alpha is used as is\.$/)).toBeInTheDocument()
    document.body.innerHTML = ''
    const c = setup(ai, src(control(), { svg: true })); await c.open()
    expect(screen.queryByRole('group', { name: 'Silhouette from' })).toBeNull(); expect(screen.queryByTestId('ai-silhouette')).toBeNull(); expect(screen.getByLabelText('Threshold')).toBeInTheDocument()
    document.body.innerHTML = ''
    const d = setup(ai, src(control({ lost: true }))); await d.open()
    expect(screen.getByText(/The AI result is gone/)).toBeInTheDocument()
  })

  it('«Весь кадр»: третий вариант источника, ручки трассировки скрыты, остаётся пояснение', async () => {
    const a = setup({ source: 'frame' }, src(control())); await a.open()
    const group = screen.getByRole('group', { name: 'Silhouette from' })
    expect(within(group).getByRole('button', { name: 'Whole frame' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('frame-note')).toBeInTheDocument()
    expect(screen.queryByLabelText('Threshold')).toBeNull(); expect(screen.queryByText(/^Invert/)).toBeNull(); expect(screen.queryByTestId('ai-silhouette')).toBeNull()
    expect(screen.queryByText(/Close gaps/i)).toBeNull(); expect(screen.queryByText(/Remove specks/i)).toBeNull()
    await userEvent.click(within(group).getByRole('button', { name: 'Brightness' }))
    expect(a.onChange).toHaveBeenCalledWith({ source: 'brightness' })
  })

  it('оба языка: подписи переведены', async () => {
    await i18n.changeLanguage('ru')
    const a = setup(ai, src(control())); await userEvent.click(screen.getByRole('button', { name: /Развернуть: Силуэт/ }))
    expect(screen.getByRole('button', { name: 'Убрать фон' })).toBeInTheDocument(); expect(screen.getByLabelText('Охват края')).toBeInTheDocument()
    expect(a.onChange).not.toHaveBeenCalled()
  })
})

describe('MaskPreview: мягкая маска (33, 4.2)', () => {
  beforeEach(async () => { await i18n.changeLanguage('en') })
  it('переключатель мягкой маски есть только у источника ИИ и переключается; увеличенный вид открывается', async () => {
    const { rerender } = render(<MaskPreview preview={preview} />)
    expect(screen.queryByRole('button', { name: 'Show the soft mask of the network' })).toBeNull()
    rerender(<MaskPreview preview={preview} matte={{ width: 2, height: 2, data: new Uint8Array(4).fill(128) }} />)
    const b = screen.getByRole('button', { name: 'Show the soft mask of the network' })
    expect(b).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(b); expect(b).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge mask' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('увеличенный вид с редактором кадра прокручивается и держит маску и кадр рядом: окно не больше экрана', async () => {
    render(<MaskPreview preview={preview} extra={<div data-testid="crop-slot" />} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge mask' }))
    const dlg = screen.getByRole('dialog')
    expect(dlg.className).toMatch(/max-h-\[94vh\]/); expect(dlg.className).toMatch(/overflow-auto/)
    expect(screen.getByTestId('mask-large-extra')).toContainElement(screen.getByTestId('crop-slot'))
    expect(dlg.querySelector('canvas')!.className).toMatch(/max-h-/)
  })
})
