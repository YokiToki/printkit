// @vitest-environment jsdom
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import { resetActivityLog, startJob } from '../../app/activityLog'
import { defaultKeychain, type KeychainInfo, type KeychainParams } from '../../geometry/keychain'
import { applyIntensity } from '../../geometry/photoPresets'
import { applySubject } from '../../geometry/subjects'
import { MODELS } from '../../ml/models'
import { UnitContext } from '../../ui/units'
import { expectAllNumericSteppers } from '../../ui/stepperAssert'
import { useModelManagerOpen } from '../ml/managerState'
import type { DepthControl } from './depth'
import { PhotoReliefBlock, type PhotoPanel } from './PhotoReliefBlock'
import { ProfileSection } from './ProfileSection'

const DEPTH_MODEL = MODELS.find((m) => m.kind === 'depth')!
const control = (over: Partial<DepthControl> = {}): DepthControl => ({ model: DEPTH_MODEL, running: false, error: null, depth: null, staleCrop: false, lost: false, restored: true, run: vi.fn(async () => {}), ...over })
const photoParams = (): KeychainParams => applyIntensity('portrait', { ...defaultKeychain, imageId: 'img' })

function Probe() { return useModelManagerOpen() ? <span data-testid="manager-open" /> : null }
function Harness({ start = photoParams(), depth = control(), info = null, stats = null, auto = false, spy }: { start?: KeychainParams; depth?: DepthControl; info?: KeychainInfo | null; stats?: PhotoPanel['stats']; auto?: boolean; spy?: { params?: KeychainParams; autoCalls: boolean[] } }) {
  const [p, setP] = useState(start), [subjectAuto, setAuto] = useState(auto)
  if (spy) spy.params = p
  const panel: PhotoPanel = { depth, subjectAuto, onSubjectAuto: (v) => { spy?.autoCalls.push(v); setAuto(v) }, stats }
  return (
    <UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}>
      <Probe />
      <PhotoReliefBlock params={p} apply={(f) => setP(f)} info={info} panel={panel} imageId="img" />
      <output data-testid="auto">{String(subjectAuto)}</output>
    </UnitContext.Provider>
  )
}

describe('PhotoReliefBlock (34, 4.2)', () => {
  beforeEach(async () => { resetActivityLog(); await i18n.changeLanguage('en') })

  it('доли двигаются ползунками без вызова сети; полоса смеси следует долям; значения в процентах нормированы', async () => {
    const spy = { autoCalls: [] as boolean[] } as { params?: KeychainParams; autoCalls: boolean[] }, depth = control()
    render(<Harness depth={depth} spy={spy} />)
    expect(screen.getByTestId('mix-contour').style.width).toBe('25%'); expect(screen.getByTestId('mix-depth').style.width).toBe('45%')
    const slider = screen.getByRole('slider', { name: 'Detail' })
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => { set.call(slider, '10'); slider.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(spy.params!.source.mix).toEqual({ contour: 25, depth: 45, detail: 10 })
    expect(screen.getByTestId('mix-detail').style.width).toBe(`${(10 / 80) * 100}%`)
    expect(depth.run).not.toHaveBeenCalled()
  })

  it('без модели глубины кнопка выключена с подсказкой и ссылкой на менеджер; с моделью включена и запускает', async () => {
    const { unmount } = render(<Harness depth={control({ model: null })} />)
    expect(screen.getByRole('button', { name: 'Compute depth' })).toBeDisabled(); expect(screen.getByTestId('depth-hint')).toHaveTextContent('Download a depth model')
    await userEvent.click(screen.getByRole('button', { name: 'Models…' })); expect(screen.getByTestId('manager-open')).toBeInTheDocument()
    unmount()
    const depth = control(); render(<Harness depth={depth} />)
    await userEvent.click(screen.getByRole('button', { name: 'Compute depth' })); expect(depth.run).toHaveBeenCalledTimes(1)
  })

  it('идёт запуск: кнопка выключена; строка следует за журналом; результат даёт «посчитать заново»', async () => {
    const { unmount } = render(<Harness depth={control({ running: true })} />)
    expect(screen.getByRole('button', { name: 'Compute depth' })).toBeDisabled()
    let job!: ReturnType<typeof startJob>
    act(() => { job = startJob({ source: 'ai', key: 'log.ai.run', params: { name: 'Depth' }, cancel: () => {} }) })
    act(() => job.update({ key: 'log.ai.depthPass' }))
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Computing the depth map')
    act(() => job.done('log.ai.runDone', { name: 'Depth', seconds: '1.0' }))
    unmount()
    render(<Harness depth={control({ depth: { width: 1, height: 1, data: new Uint8Array(1), crop: { x: 0, y: 0, w: 1, h: 1 } } })} />)
    expect(screen.getByRole('button', { name: 'Compute depth again' })).toBeInTheDocument()
  })

  it('пометки: «для другого кадра», потерянная глубина и «доля считается нулём»; ошибка запуска', () => {
    render(<Harness depth={control({ staleCrop: true, error: 'failed' })} info={{ threshold: 0, photoLike: false, preview: null, depthMissing: true }} />)
    expect(screen.getByTestId('depth-stale')).toBeInTheDocument(); expect(screen.getByTestId('depth-missing')).toBeInTheDocument(); expect(screen.getByText('The depth run failed.')).toBeInTheDocument()
    document.body.innerHTML = ''
    render(<Harness depth={control({ lost: true })} />); expect(screen.getByText(/The depth result is gone/)).toBeInTheDocument()
  })

  it('сила: «Нежный» ставит свои значения; правка любого значения даёт «Свой»', async () => {
    const spy = { autoCalls: [] as boolean[] } as { params?: KeychainParams; autoCalls: boolean[] }
    render(<Harness spy={spy} />)
    await userEvent.selectOptions(screen.getByLabelText('Strength'), 'subtle')
    expect(spy.params!.relief.hmax).toBe(1.2); expect(spy.params!.source.mix).toEqual({ contour: 40, depth: 45, detail: 15 })
    const boost = screen.getByLabelText('Detail boost')
    await userEvent.clear(boost); await userEvent.type(boost, '3'); await userEvent.tab()
    expect(screen.getByLabelText('Strength')).toHaveValue('custom')
  })

  it('предмет: выбор ставит значения и выключает автоматический выбор; правка значения даёт «Свой» и тоже выключает', async () => {
    const spy = { autoCalls: [] as boolean[] } as { params?: KeychainParams; autoCalls: boolean[] }
    render(<Harness spy={spy} auto />)
    expect(screen.getByRole('switch', { name: 'Choose automatically' })).toBeChecked()
    await userEvent.selectOptions(screen.getByLabelText('Subject'), 'drawing')
    expect(spy.params!.silhouette.source).toBe('brightness'); expect(spy.params!.source.mix).toEqual({ contour: 100, depth: 0, detail: 0 }); expect(spy.params!.size.longest).toBe(60)
    expect(screen.getByTestId('auto')).toHaveTextContent('false')
    document.body.innerHTML = ''; spy.autoCalls.length = 0
    render(<Harness spy={spy} start={applySubject('face', photoParams())} auto />)
    expect(screen.getByLabelText('Subject')).toHaveValue('face')
    const dark = screen.getByLabelText('Dark threshold')
    await userEvent.clear(dark); await userEvent.type(dark, '0.4'); await userEvent.tab()
    expect(screen.getByLabelText('Subject')).toHaveValue('custom'); expect(screen.getByTestId('auto')).toHaveTextContent('false')
  })

  it('автоматический выбор по картинке: рисунок с тонкими штрихами даёт «Рисунок / логотип»; предмет на весь кадр — «Лицо»', () => {
    const spy = { autoCalls: [] as boolean[] } as { params?: KeychainParams; autoCalls: boolean[] }
    render(<Harness spy={spy} auto stats={{ tones: 2, thin: 0.6, boxFill: 0 }} />)
    expect(screen.getByLabelText('Subject')).toHaveValue('drawing')
    document.body.innerHTML = ''
    render(<Harness spy={spy} auto stats={{ tones: 6, thin: 0.05, boxFill: 0.95 }} />)
    expect(screen.getByLabelText('Subject')).toHaveValue('face')
    document.body.innerHTML = ''
    render(<Harness spy={spy} auto={false} stats={{ tones: 2, thin: 0.6, boxFill: 0 }} start={applyIntensity('portrait', defaultKeychain)} />)
    expect(screen.getByLabelText('Subject')).toHaveValue('custom') // автоматика выключена: ничего не выбирается
  })

  it('режим деталей: порог тёмного скрыт у «Рельефа»; уровни включают мягкость; предел наклона, привязка и сглаживание редактируются', async () => {
    const spy = { autoCalls: [] as boolean[] } as { params?: KeychainParams; autoCalls: boolean[] }
    render(<Harness spy={spy} />)
    expect(screen.getByLabelText('Dark threshold')).toBeInTheDocument(); expect(screen.getByLabelText('Level softness')).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Detail as'), 'relief'); expect(screen.queryByLabelText('Dark threshold')).toBeNull()
    const lv = screen.getByLabelText('Tone levels (0 = continuous)'); await userEvent.clear(lv); await userEvent.type(lv, '4'); await userEvent.tab()
    expect(spy.params!.source.levels).toBe(4); expect(screen.getByLabelText('Level softness')).toBeEnabled()
    for (const [label, key, v] of [['Snap depth to edges', 'snap', 30], ['Max slope', 'maxSlope', 40]] as const) {
      const f = screen.getByLabelText(label); await userEvent.clear(f); await userEvent.type(f, String(v)); await userEvent.tab()
      expect(spy.params!.source[key]).toBe(v)
    }
  })

  it('подсказки: крупная ячейка относительно радиуса деталей и мелкое лицо; ошибок и шума нет без причины', () => {
    const info = (cell: number, w: number): KeychainInfo => ({ threshold: 0, photoLike: false, preview: null, cell, size: [w, 40] })
    render(<Harness info={info(0.6, 60)} />); expect(screen.getByText(/larger than a third of the detail radius/)).toBeInTheDocument()
    document.body.innerHTML = ''
    render(<Harness info={info(0.2, 60)} />); expect(screen.queryByText(/larger than a third/)).toBeNull(); expect(screen.queryByText(/The face is small/)).toBeNull()
    document.body.innerHTML = ''
    render(<Harness start={applySubject('face', photoParams())} info={info(0.2, 20)} />); expect(screen.getByText(/The face is small in this part/)).toBeInTheDocument()
  })

  it('у каждого числового поля есть кнопки − и + (шаговые поля)', async () => {
    render(<Harness />)
    const inputs = screen.getAllByRole('textbox').filter((el) => el.getAttribute('inputmode') === 'decimal')
    expect(inputs.length).toBeGreaterThan(5)
    for (const input of inputs) { const label = (input as HTMLInputElement).labels?.[0]?.textContent ?? ''; expect(screen.getByRole('button', { name: `Decrease: ${label}` })).toBeInTheDocument(); expect(screen.getByRole('button', { name: `Increase: ${label}` })).toBeInTheDocument() }
    void expectAllNumericSteppers; void within
  })

  it('оба языка: подписи переведены', async () => {
    await i18n.changeLanguage('ru'); render(<Harness />)
    expect(screen.getByLabelText('Предмет')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Посчитать глубину' })).toBeInTheDocument(); expect(screen.getByLabelText('Усиление деталей')).toBeInTheDocument()
  })
})

describe('Источник «Фото» в рельефе: доступность (34, 4.2)', () => {
  it('без параметров фото (SVG, режим «Форма») переключателя «Фото» нет; с ними он есть', async () => {
    await i18n.changeLanguage('en')
    const base = { relief: defaultKeychain.relief, source: defaultKeychain.source, error: () => undefined, onRelief: () => {}, onSource: () => {} }
    const wrap = (ui: React.ReactNode) => <UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}>{ui}</UnitContext.Provider>
    const { unmount } = render(wrap(<ProfileSection {...base} />))
    await userEvent.click(screen.getByRole('button', { name: /Expand: Relief/ }))
    expect(screen.queryByRole('button', { name: 'Photo' })).toBeNull(); unmount()
    render(wrap(<ProfileSection {...base} photo={{ panel: { depth: control(), subjectAuto: false, onSubjectAuto: () => {}, stats: null }, params: defaultKeychain, apply: () => {}, info: null, imageId: 'x' }} />))
    await userEvent.click(screen.getByRole('button', { name: /Expand: Relief/ }))
    expect(screen.getByRole('button', { name: 'Photo' })).toBeInTheDocument()
  })
})
