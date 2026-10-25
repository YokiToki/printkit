// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../../i18n'
import { getLogSnapshot, resetActivityLog, startJob } from '../../../app/activityLog'
import type { Segmentation } from '../../../geometry/photo/segment'
import { MODELS, type ModelSpec } from '../../../ml/models'
import { UnitContext } from '../../../ui/units'
import { AiStatus } from './AiStatus'
import { MaskTuning } from './MaskTuning'

const seg = (w: number, h: number): Segmentation => ({ width: 1, height: 1, scale: 4, labels: new Int32Array(1), silhouettes: [{ id: 1, areaMm2: w * h, widthMm: w, heightMm: h, bbox: [0, 0, 1, 1] }], sensitivity: 0, defaultSensitivity: 0 })
const units = (ui: React.ReactNode) => <UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}>{ui}</UnitContext.Provider>
const model: ModelSpec = MODELS[2]
const tune = (over: Partial<Parameters<typeof MaskTuning>[0]> = {}) => {
  const onChange = vi.fn()
  render(units(<MaskTuning model={model} ai={{ threshold: null, smooth: null, secondPass: false }} onChange={onChange} alpha={null} size={null} active={seg(40, 20)} baseline={null} {...over} />))
  return onChange
}

describe('MaskTuning (32, 5.2a)', () => {
  beforeEach(async () => { await i18n.changeLanguage('en') })

  it('значения по умолчанию берутся у модели; своё значение пользователя их заменяет', () => {
    const other = { ...model, maskDefaults: { threshold: 0.3, smooth: 0.5 } }
    tune({ model: other })
    expect(screen.getByLabelText('Edge reach')).toHaveValue('70')
    expect(screen.getByLabelText('Outline smoothness')).toHaveValue('0.5')
  })

  it('сброс возвращает значения модели (null), кнопка выключена, пока ничего не тронуто', async () => {
    const off = tune()
    expect(screen.getByRole('button', { name: 'Reset to model defaults' })).toBeDisabled()
    expect(off).not.toHaveBeenCalled()
  })

  it('после правки кнопка сброса включена и отдаёт null для обеих настроек', async () => {
    const onChange = tune({ ai: { threshold: 0.4, smooth: null, secondPass: false } })
    await userEvent.click(screen.getByRole('button', { name: 'Reset to model defaults' }))
    expect(onChange).toHaveBeenCalledWith({ threshold: null, smooth: null })
  })

  it('подсказка про тонкие части появляется, когда силуэт уменьшился больше чем на 1 мм относительно модели, и не появляется при меньшем', () => {
    const touched = { threshold: null, smooth: 2, secondPass: false }
    const { unmount } = render(units(<MaskTuning model={model} ai={touched} onChange={() => {}} alpha={null} size={null} active={seg(38.5, 20)} baseline={seg(40, 20)} />))
    expect(screen.getByRole('alert')).toHaveTextContent('smaller by more than 1 mm')
    expect(screen.getByTestId('change-1')).toHaveTextContent('-1.5 × 0')
    unmount()
    render(units(<MaskTuning model={model} ai={touched} onChange={() => {}} alpha={null} size={null} active={seg(39.5, 20)} baseline={seg(40, 20)} />))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('оба языка: подписи и подсказки переведены', async () => {
    await i18n.changeLanguage('ru'); tune()
    expect(screen.getByLabelText('Охват края')).toBeInTheDocument(); expect(screen.getByLabelText('Гладкость контура')).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })
})

describe('AiStatus (32, 5.2b)', () => {
  beforeEach(async () => { resetActivityLog(); await i18n.changeLanguage('en') })

  it('пока задач и записей ИИ нет, строки нет; строка следует за событиями запуска по порядку и в конце показывает итог', () => {
    render(<AiStatus />)
    expect(screen.queryByTestId('ai-status')).toBeNull()
    let job!: ReturnType<typeof startJob>
    act(() => { job = startJob({ source: 'ai', key: 'log.ai.run', params: { name: 'Net' }, cancel: () => {} }) })
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Running Net…')
    act(() => job.update({ key: 'log.ai.session', params: { backend: 'WASM' } }))
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Starting the session (WASM)')
    act(() => job.update({ key: 'log.ai.object', params: { i: 2, n: 3 } }))
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Objects refined: 2 of 3')
    act(() => job.done('log.ai.runDone', { name: 'Net', seconds: '4.2' }))
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Net: done in 4.2 s')
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    // журнал получил начало, этапы (последний в строке) и конец
    expect(getLogSnapshot().entries.filter((e) => e.source === 'ai').map((e) => e.key)).toEqual(['log.ai.run', 'log.ai.runDone'])
  })

  it('«Отмена» останавливает задачу и пишет её в журнал; ошибка видна в строке и в журнале; смена языка перерисовывает строку', async () => {
    const cancel = vi.fn()
    render(<AiStatus />)
    act(() => { startJob({ source: 'ai', key: 'log.ai.run', params: { name: 'Net' }, cancel }) })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(getLogSnapshot().jobs).toHaveLength(0)
    expect(getLogSnapshot().entries.at(-1)?.key).toBe('log.job.cancelled')
    act(() => { startJob({ source: 'ai', key: 'log.ai.run', params: { name: 'Net' } }).fail('log.ai.runFailed', { name: 'Net' }, 'bad_alloc') })
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Net failed')
    expect(getLogSnapshot().errors).toBe(1)
    await act(async () => { await i18n.changeLanguage('ru') })
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Net: ошибка')
  })

  it('чужие задачи (сборка модели) строку ИИ не трогают', () => {
    render(<AiStatus />)
    act(() => { startJob({ source: 'model', key: 'log.model.start' }) })
    expect(screen.queryByTestId('ai-status')).toBeNull()
  })
})
