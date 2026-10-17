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
  it('сводки: панель — юниты и высота, полка — глубина и бортики', () => {
    render(<Harness start={S({ lips: { height: 6, wall: 2 } })} />)
    expect(screen.getByText('2 U · 88.45 mm')).toBeInTheDocument(); expect(screen.getByText('100 mm deep · lips 6 mm')).toBeInTheDocument()
  })
  it('у каждого числового поля есть кнопки − и + (все секции раскрыты, бортики включены, ушки пазом)', async () => {
    render(<Harness start={S({ lips: { height: 6, wall: 2 } })} />)
    await expectAllNumericSteppers()
  })
  it('ширина полки показана и меняется с зазором; стенка бортика видна только при высоте больше нуля', async () => {
    render(<Harness />)
    await openSection('Shelf')
    expect(screen.getByText('Shelf width 221.75 mm.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Lip wall')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Increase: Clearance to the rails' }))
    expect(latest.shelf.clearance).toBeCloseTo(0.3, 6); expect(screen.getByText('Shelf width 221.65 mm.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Increase: Lip height' }))
    expect(latest.lips.height).toBe(1); expect(screen.getByLabelText('Lip wall')).toBeInTheDocument()
  })
  it('бортик выше пластины даёт ошибку и общее предупреждение', async () => {
    render(<Harness start={S({ units: 1, lips: { height: 50, wall: 2 } })} />)
    await openSection('Shelf')
    expect(screen.getByText(/The lip must stay below the top of the plate/)).toBeInTheDocument()
    expect(screen.getByText(/Some values are out of range/)).toBeInTheDocument()
  })
  it('глубина вне диапазона показывает ошибку', async () => {
    render(<Harness start={S({ shelf: { ...defaultRackShelf.shelf, depth: 10 } })} />)
    await openSection('Shelf')
    expect(screen.getByText('Shelf depth must be between 20 and 400 mm.')).toBeInTheDocument()
  })
})
