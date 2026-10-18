// @vitest-environment jsdom
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import { UnitContext } from '../../ui/units'
import { openSection } from '../../ui/renderOpen'
import { expectAllNumericSteppers } from '../../ui/stepperAssert'
import { defaultRackCase, type RackCaseParams } from '../../geometry/rack/case'
import { CasePanel } from './CasePanel'

let latest: RackCaseParams = defaultRackCase
function Harness({ start = defaultRackCase }: { start?: RackCaseParams }) {
  const [p, setP] = useState(start)
  latest = p
  return <I18nextProvider i18n={i18n}><UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}><CasePanel params={p} onChange={setP} /></UnitContext.Provider></I18nextProvider>
}
const sections = () => screen.queryAllByRole('button', { name: /^(Expand|Collapse): / }).map((b) => {
  const name = b.getAttribute('aria-label')!
  return { title: name.replace(/^(Expand|Collapse): /, '').replace(/ \(changed\)$/, ''), changed: / \(changed\)$/.test(name), open: b.getAttribute('aria-expanded') === 'true' }
})
const C = (o: Partial<RackCaseParams>): RackCaseParams => ({ ...defaultRackCase, ...o })

describe('CasePanel', () => {
  beforeEach(async () => { await i18n.changeLanguage('en'); latest = defaultRackCase })

  it('пять секций свёрнуты и не подсвечены', () => {
    render(<Harness />)
    expect(sections().map((s) => s.title)).toEqual(['Device', 'Shell', 'Front plate', 'Ears', 'Vents'])
    expect(sections().every((s) => !s.open && !s.changed)).toBe(true)
  })
  it.each([
    ['Device', { gap: 0.6 }], ['Shell', { wall: 2.4 }], ['Front plate', { window: { enabled: false, lip: 3 } }], ['Ears', { ears: { ...defaultRackCase.ears, shape: 'round' as const } }], ['Vents', { vents: { ...defaultRackCase.vents, enabled: true } }],
  ])('изменение %s подсвечивает только её', (title, over) => {
    render(<Harness start={C(over)} />)
    expect(sections().filter((s) => s.changed).map((s) => s.title)).toEqual([title])
  })
  it('у каждого числового поля есть кнопки − и + (все секции раскрыты: группы keystone и отверстий, соты, ручные юниты)', async () => {
    render(<Harness start={C({ openings: [{ kind: 'keystone', count: 2, perRow: 1, zone: 'left', diameter: 8 }, { kind: 'hole', count: 1, perRow: 1, zone: 'right', diameter: 8 }], vents: { ...defaultRackCase.vents, enabled: true }, units: { auto: false, value: 3 } })} />)
    await expectAllNumericSteppers()
  })
  it('автоматические юниты показывают число и высоту; ручное меньше нужного поднимается с пометкой', async () => {
    render(<Harness />)
    await openSection('Shell')
    expect(screen.getByText('2 U, plate 88.45 mm high')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Automatic rack units' }))
    expect(latest.units).toEqual({ auto: false, value: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Increase: Rack units' }))
    expect(screen.getByText('3 U, plate 132.9 mm high')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Decrease: Rack units' })); await userEvent.click(screen.getByRole('button', { name: 'Decrease: Rack units' }))
    expect(latest.units.value).toBe(1)
    expect(screen.getByText('Raised to 2 U: the device needs it.')).toBeInTheDocument(); expect(screen.getByText('2 U, plate 88.45 mm high')).toBeInTheDocument()
  })
  it('слишком широкое устройство показывает ошибку с превышением', async () => {
    render(<Harness start={C({ device: { width: 230, depth: 100, height: 40 } })} />)
    await openSection('Device')
    expect(screen.getByText(/The device is 12.55 mm too wide for the 222.25 mm window/)).toBeInTheDocument()
    expect(screen.getByText(/out of range/)).toBeInTheDocument()
  })
  it('поля зависят от выбора: окно, соты', async () => {
    render(<Harness />)
    await openSection('Front plate')
    expect(screen.getByLabelText('Front lip')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Window on the device front' }))
    expect(screen.queryByLabelText('Front lip')).toBeNull(); expect(latest.window.enabled).toBe(false)
    await openSection('Vents')
    expect(screen.queryByLabelText('Vent width')).toBeNull()
    await userEvent.click(screen.getByRole('switch', { name: 'Hexagonal vents on the top and sides' }))
    expect(screen.getByLabelText('Vent width')).toBeInTheDocument(); expect(latest.vents.enabled).toBe(true)
  })
  it('передняя панель: окно по умолчанию включено, два блока с заголовками, слова «кабель» нет', async () => {
    render(<Harness />)
    await openSection('Front plate')
    expect(screen.getByRole('switch', { name: 'Window on the device front' })).toBeChecked()
    expect(screen.getByRole('heading', { name: 'Window' })).toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Keystones and holes' })).toBeInTheDocument()
    expect(screen.getByText('No keystones or holes.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/cable/i)
  })
  it('добавление группы показывает её поля; отверстию добавляется диаметр, keystone — нет', async () => {
    render(<Harness />)
    await openSection('Front plate')
    await userEvent.click(screen.getByRole('button', { name: 'Add group' }))
    expect(latest.openings).toEqual([{ kind: 'keystone', count: 1, perRow: 1, zone: 'right', diameter: 8 }])
    const g = screen.getByRole('group', { name: 'Group 1' })
    expect(within(g).getByLabelText('Kind (1)')).toHaveValue('keystone'); expect(within(g).getByLabelText('Count (1)')).toBeInTheDocument()
    expect(within(g).getByLabelText('Per row (1)')).toBeInTheDocument(); expect(within(g).getByLabelText('Zone (1)')).toHaveValue('right')
    expect(within(g).queryByLabelText('Hole diameter (1)')).toBeNull()
    await userEvent.selectOptions(within(g).getByLabelText('Kind (1)'), 'hole')
    expect(latest.openings[0].kind).toBe('hole'); expect(within(g).getByLabelText('Hole diameter (1)')).toBeInTheDocument()
    await userEvent.selectOptions(within(g).getByLabelText('Zone (1)'), 'above')
    expect(latest.openings[0].zone).toBe('above')
  })
  it('число, «в ряду» и зона правят группу; удаление убирает только её; больше шести не добавить', async () => {
    render(<Harness />)
    await openSection('Front plate')
    const add = screen.getByRole('button', { name: 'Add group' })
    await userEvent.click(add); await userEvent.click(add)
    const g2 = screen.getByRole('group', { name: 'Group 2' })
    await userEvent.click(within(g2).getByRole('button', { name: 'Increase: Count (2)' })); await userEvent.click(within(g2).getByRole('button', { name: 'Increase: Per row (2)' }))
    expect(latest.openings[1]).toMatchObject({ count: 2, perRow: 2 }); expect(latest.openings[0]).toMatchObject({ count: 1, perRow: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Remove group 1' }))
    expect(latest.openings).toHaveLength(1); expect(latest.openings[0]).toMatchObject({ count: 2, perRow: 2 })
    for (let i = 0; i < 5; i++) await userEvent.click(add)
    expect(latest.openings).toHaveLength(6); expect(add).toBeDisabled()
  })
  it('сводка секции называет окно и число групп', async () => {
    render(<Harness start={C({ openings: [{ kind: 'hole', count: 1, perRow: 1, zone: 'left', diameter: 8 }] })} />)
    expect(screen.getByText('window, lip 3 mm · 1 groups')).toBeInTheDocument()
    expect(sections().filter((s) => s.changed).map((s) => s.title)).toEqual(['Front plate'])
  })
  it('предупреждение о тесноте называет группу, которая не вырезается', async () => {
    render(<Harness start={C({ openings: [{ kind: 'hole', count: 1, perRow: 1, zone: 'left', diameter: 8 }, { kind: 'keystone', count: 6, perRow: 1, zone: 'right', diameter: 8 }] })} />)
    await openSection('Front plate')
    expect(within(screen.getByRole('group', { name: 'Group 2' })).getByText('Group 2 does not fit on the front plate and is not cut.')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Group 1' })).queryByText(/does not fit/)).toBeNull()
  })
  it('тонкая стенка сот предупреждает', async () => {
    render(<Harness start={C({ vents: { ...defaultRackCase.vents, enabled: true, wall: 0.5 } })} />)
    await openSection('Vents')
    expect(screen.getByText(/Vent wall is below the minimum printable width/)).toBeInTheDocument()
  })
})
