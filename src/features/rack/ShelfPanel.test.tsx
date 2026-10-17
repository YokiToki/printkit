// @vitest-environment jsdom
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import { UnitContext } from '../../ui/units'
import { openSection } from '../../ui/renderOpen'
import { expectAllNumericSteppers } from '../../ui/stepperAssert'
import { defaultRackShelf, type RackShelfParams } from '../../geometry/rack/shelf'
import { ShelfPanel } from './ShelfPanel'

let latest: RackShelfParams = defaultRackShelf
function Harness({ start = defaultRackShelf }: { start?: RackShelfParams }) {
  const [p, setP] = useState(start)
  latest = p
  return <I18nextProvider i18n={i18n}><UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}><ShelfPanel params={p} onChange={setP} /></UnitContext.Provider></I18nextProvider>
}
const sections = () => screen.queryAllByRole('button', { name: /^(Expand|Collapse): / }).map((b) => {
  const name = b.getAttribute('aria-label')!
  return { title: name.replace(/^(Expand|Collapse): /, '').replace(/ \(changed\)$/, ''), changed: / \(changed\)$/.test(name), open: b.getAttribute('aria-expanded') === 'true' }
})
const S = (o: Partial<RackShelfParams>): RackShelfParams => ({ ...defaultRackShelf, ...o })

describe('ShelfPanel', () => {
  beforeEach(async () => { await i18n.changeLanguage('en'); latest = defaultRackShelf })

  it('три секции свёрнуты и не подсвечены', () => {
    render(<Harness />)
    expect(sections().map((s) => s.title)).toEqual(['Plate', 'Shelf', 'Ears'])
    expect(sections().every((s) => !s.open && !s.changed)).toBe(true)
  })
  it.each([
    ['Plate', { units: 3 }], ['Shelf', { shelf: { ...defaultRackShelf.shelf, depth: 150 } }], ['Ears', { ears: { ...defaultRackShelf.ears, shape: 'round' as const } }],
  ])('изменение %s подсвечивает только её', (title, over) => {
    render(<Harness start={S(over)} />)
    expect(sections().filter((s) => s.changed).map((s) => s.title)).toEqual([title])
  })
  it('сводки: панель — юниты и высота, полка — глубина и вид пола', () => {
    render(<Harness />)
    expect(screen.getByText('1 U · 44 mm · open')).toBeInTheDocument(); expect(screen.getByText('100 mm deep · floor: Pills')).toBeInTheDocument()
  })
  it('у каждого числового поля есть кнопки − и + (все секции раскрыты, узор пола — щели, стенки включены)', async () => {
    render(<Harness />)
    await expectAllNumericSteppers()
  })
  it('пол по умолчанию — щели; «Нет» у пола прячет поля узора и даёт глухой пол', async () => {
    render(<Harness />)
    await openSection('Shelf')
    expect(screen.getByLabelText('Floor ventilation')).toHaveValue('pills')
    expect(screen.getAllByLabelText('Margin')).toHaveLength(1)
    await userEvent.selectOptions(screen.getByLabelText('Floor ventilation'), 'none')
    expect(latest.floorPattern.kind).toBe('none'); expect(screen.queryByLabelText('Margin')).toBeNull()
  })
  it('передняя панель по умолчанию открытая и без узора; глухая включается переключателем и открывает вентиляцию панели', async () => {
    render(<Harness />)
    await openSection('Plate')
    expect(screen.getByRole('switch', { name: 'Closed front plate' })).not.toBeChecked()
    expect(screen.queryByLabelText('Front plate ventilation')).toBeNull()
    await userEvent.click(screen.getByRole('switch', { name: 'Closed front plate' }))
    expect(latest.closedFront).toBe(true); expect(screen.getByLabelText('Front plate ventilation')).toHaveValue('none')
    await userEvent.selectOptions(screen.getByLabelText('Front plate ventilation'), 'hex')
    expect(latest.platePattern.kind).toBe('hex'); expect(screen.getAllByLabelText('Margin').length).toBeGreaterThan(0)
  })
  it('ширина полки показана и меняется с зазором; толщина стенок видна только при высоте больше нуля', async () => {
    render(<Harness start={S({ sides: { height: 0, wall: 3 } })} />)
    await openSection('Shelf')
    expect(screen.getByText('Shelf width 221.75 mm.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Side wall thickness')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Increase: Clearance to the rails' }))
    expect(latest.shelf.clearance).toBeCloseTo(0.3, 6); expect(screen.getByText('Shelf width 221.65 mm.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Increase: Side wall height' }))
    expect(latest.sides.height).toBe(1); expect(screen.getByLabelText('Side wall thickness')).toBeInTheDocument()
  })
  it('стенка выше панели даёт ошибку и общее предупреждение', async () => {
    render(<Harness start={S({ sides: { height: 50, wall: 3 } })} />)
    await openSection('Shelf')
    expect(screen.getByText(/The side wall must be taller than the floor/)).toBeInTheDocument()
    expect(screen.getByText(/Some values are out of range/)).toBeInTheDocument()
  })
  it('глубина вне диапазона показывает ошибку', async () => {
    render(<Harness start={S({ shelf: { ...defaultRackShelf.shelf, depth: 10 } })} />)
    await openSection('Shelf')
    expect(screen.getByText('Shelf depth must be between 20 and 400 mm.')).toBeInTheDocument()
  })
  it('ошибка «нет места» для узора пола называет узор, а не узор пластины', async () => {
    render(<Harness start={S({ floorPattern: { ...defaultRackShelf.floorPattern, margin: 30 }, shelf: { ...defaultRackShelf.shelf, depth: 50 } })} />)
    await openSection('Shelf')
    expect(screen.getByText('The margin leaves no room for a floor pattern.')).toBeInTheDocument()
  })
})
