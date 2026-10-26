// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import { defaultOutline } from '../../geometry/imageOutline'
import { UnitContext } from '../../ui/units'
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
    const onChange = ui({ smooth: 0.6, cornerDeg: 70, step: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Increase: Corner angle' })); expect(onChange).toHaveBeenLastCalledWith({ cornerDeg: 75 })
    await userEvent.click(screen.getByRole('button', { name: 'Reset the outline' })); expect(onChange).toHaveBeenLastCalledWith(defaultOutline)
  })
})
