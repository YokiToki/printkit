// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConstraintPanel } from './ConstraintPanel'
import { createSketch, addLine } from '../../../editor/sketch/model'
import { UnitProvider } from '../../../ui/UnitProvider'
import { expectAllNumericSteppers } from '../../../ui/stepperAssert'
import '../../../i18n'

describe('5.3 ConstraintPanel in Properties', () => {
  it('renders curve, constraints and dimensions, supports editing', () => {
    let s = createSketch('PanelTest')
    const l = addLine(s, { x: 0, y: 0 }, { x: 30, y: 0 })
    s = l.sketch
    s.constraints.push(
      { id: 'c1', kind: 'horizontal', refs: [l.curveId] },
      { id: 'c2', kind: 'distance', refs: [l.p1Id, l.p2Id], value: 30 },
    )

    const onUpdate = vi.fn()
    const onDelete = vi.fn()
    const onHover = vi.fn()

    render(
      <UnitProvider>
        <ConstraintPanel
          sketch={s}
          selectedCurveIds={[l.curveId]}
          selectedPointIds={[]}
          onUpdateConstraint={onUpdate}
          onDeleteConstraint={onDelete}
          onHoverConstraint={onHover}
        />
      </UnitProvider>,
    )

    // 1. Shows line title
    expect(screen.getByText('Line')).toBeDefined()

    // 2. Shows geometric constraint 'horizontal'
    expect(screen.getByText('horizontal')).toBeDefined()

    // 3. Shows dimension with input
    const input = screen.getByRole('textbox')
    expect((input as HTMLInputElement).value).toBe('30')

    // Change dimension value
    fireEvent.change(input, { target: { value: '45' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith('c2', 45)

    // Delete constraint
    const deleteButtons = screen.getAllByTitle('Delete')
    expect(deleteButtons.length).toBe(2)
    fireEvent.click(deleteButtons[0])
    expect(onDelete).toHaveBeenCalled()
  })

  it('names conflicts and redundant constraints with Fix action', () => {
    let s = createSketch('ConflictTest')
    const l = addLine(s, { x: 0, y: 0 }, { x: 30, y: 0 })
    s = l.sketch
    s.constraints.push(
      { id: 'c1', kind: 'horizontal', refs: [l.curveId] },
      { id: 'c2', kind: 'vertical', refs: [l.curveId] },
    )

    const onFix = vi.fn()

    render(
      <UnitProvider>
        <ConstraintPanel
          sketch={s}
          selectedCurveIds={[l.curveId]}
          selectedPointIds={[]}
          conflicts={{
            constraints: ['c1'],
            redundant: ['c2'],
          }}
          onUpdateConstraint={vi.fn()}
          onDeleteConstraint={vi.fn()}
          onFixConflict={onFix}
        />
      </UnitProvider>,
    )

    expect(screen.getByText('Conflicting constraints')).toBeDefined()
    expect(screen.getByText('(conflict)')).toBeDefined()
    expect(screen.getByText('(redundant)')).toBeDefined()

    const fixBtn = screen.getByRole('button', { name: 'Fix conflicts' })
    fireEvent.click(fixBtn)
    expect(onFix).toHaveBeenCalled()
  })

  it('passes stepperAssert for dimension fields', async () => {
    let s = createSketch('StepperTest')
    const l = addLine(s, { x: 0, y: 0 }, { x: 30, y: 0 })
    s = l.sketch
    s.constraints.push({ id: 'c-dist', kind: 'distance', refs: [l.p1Id, l.p2Id], value: 30 })

    render(
      <UnitProvider>
        <ConstraintPanel
          sketch={s}
          selectedCurveIds={[l.curveId]}
          selectedPointIds={[]}
          onUpdateConstraint={vi.fn()}
          onDeleteConstraint={vi.fn()}
        />
      </UnitProvider>,
    )

    await expectAllNumericSteppers()
  })
})
