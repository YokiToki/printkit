// @vitest-environment jsdom
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import { defaultOutline, type OutlineParams } from '../../geometry/imageOutline'
import { fittedVertexCount } from '../../geometry/outlineFit'
import type { Pt } from '../../geometry/photo/homography'
import { UnitContext } from '../../ui/units'
import { expectAllNumericSteppers } from '../../ui/stepperAssert'
import { OutlineControls } from './OutlineControls'

describe('OutlineControls (34, 4.2)', () => {
  beforeEach(async () => { await i18n.changeLanguage('en') })
  const ui = (value = defaultOutline, onChange = vi.fn()) => { render(<UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}><OutlineControls value={value} onChange={onChange} /></UnitContext.Provider>); return onChange }

  it('гладкость сразу видна, угол и шаг — в свёрнутой группе «Дополнительно», у полей есть − и +', async () => {
    ui()
    expect(screen.getByLabelText('Outline smoothness')).toHaveValue('0.25')
    expect(screen.getByText('Advanced').closest('details')).not.toHaveAttribute('open')
    for (const l of ['Outline smoothness', 'Corner angle', 'Sampling step']) { expect(screen.getByRole('button', { name: `Decrease: ${l}` })).toBeInTheDocument(); expect(screen.getByRole('button', { name: `Increase: ${l}` })).toBeInTheDocument() }
  })

  it('правка пишет одно поле; «Сбросить контур» возвращает умолчания всех трёх и выключена при умолчаниях', async () => {
    const off = ui(); expect(screen.getByRole('button', { name: 'Reset the outline' })).toBeDisabled(); void off
    document.body.innerHTML = ''
    const onChange = ui({ ...defaultOutline, smooth: 0.6, cornerDeg: 70, step: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Increase: Corner angle' })); expect(onChange).toHaveBeenLastCalledWith({ cornerDeg: 75 })
    await userEvent.click(screen.getByRole('button', { name: 'Reset the outline' })); expect(onChange).toHaveBeenLastCalledWith(defaultOutline)
  })
})

describe('OutlineControls (35)', () => {
  beforeEach(async () => { await i18n.changeLanguage('en') })

  /** Закрытая петля с лёгким шумом: 30 вершин, периметр ≈ 50 мм. */
  const loop: Pt[] = Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2
    return [Math.cos(a) * 8 * (1 + 0.03 * Math.sin(5 * a)), Math.sin(a) * 8 * (1 + 0.03 * Math.cos(4 * a))]
  })
  const count = (p: OutlineParams) => fittedVertexCount(loop, p)

  /** Обёртка: состояние контура и число вершин, посчитанное тем же путём, что в окне «Из фото». */
  function Harness({ initial = defaultOutline }: { initial?: OutlineParams }) {
    const [value, setValue] = useState(initial)
    return (
      <UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}>
        <OutlineControls value={value} onChange={(p) => setValue((v) => ({ ...v, ...p }))} count={count(value)} />
      </UnitContext.Provider>
    )
  }

  it('гладкость и допуск пишут одно поле, число вершин следует за параметрами', async () => {
    render(<Harness />)
    const shown = () => Number((screen.getByTestId('outline-vertices').textContent ?? '').match(/\d+/)?.[0])
    expect(shown()).toBe(count(defaultOutline))
    await userEvent.click(screen.getByRole('button', { name: 'Increase: Outline smoothness' }))
    expect(shown()).toBe(count({ ...defaultOutline, smooth: 0.3 }))
    await userEvent.click(screen.getByRole('button', { name: 'Increase: Fit tolerance' }))
    expect(shown()).toBe(count({ ...defaultOutline, smooth: 0.3, fitTolerance: 0.3 }))
  })

  it('«Дополнительно» свёрнуто по умолчанию; сброс возвращает 50° и 1 мм и снимает «исходную полилинию»', async () => {
    render(<Harness initial={{ smooth: 0.6, cornerDeg: 70, step: 2, fitTolerance: 0.5, usePolyline: true }} />)
    expect(screen.getByText('Advanced').closest('details')).not.toHaveAttribute('open')
    await userEvent.click(screen.getByRole('button', { name: 'Reset the outline' }))
    expect(screen.getByLabelText('Outline smoothness')).toHaveValue('0.25')
    expect(screen.getByLabelText('Fit tolerance')).toHaveValue('0.25')
    expect(screen.getByLabelText('Corner angle')).toHaveValue('50')
    expect(screen.getByLabelText('Sampling step')).toHaveValue('1')
    expect(screen.getByRole('checkbox', { name: 'Use the original polyline' })).not.toBeChecked()
  })

  it('шаг 0,5 мм даёт больше вершин, чем 1 мм', async () => {
    const a = render(<Harness />)
    const b = render(<Harness initial={{ ...defaultOutline, step: 0.5 }} />)
    const n = (c: HTMLElement) => Number((within(c).getByTestId('outline-vertices').textContent ?? '').match(/\d+/)?.[0])
    expect(n(b.container)).toBeGreaterThan(n(a.container))
  })

  it('«исходная полилиния» возвращает прежний результат: вершин ровно столько, сколько в полилинии', async () => {
    render(<Harness />)
    const shown = () => Number((screen.getByTestId('outline-vertices').textContent ?? '').match(/\d+/)?.[0])
    expect(shown()).not.toBe(loop.length)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Use the original polyline' }))
    expect(shown()).toBe(loop.length)
  })

  it('у каждого числового поля есть − и +', async () => {
    render(<Harness />)
    await expectAllNumericSteppers()
  })
})
