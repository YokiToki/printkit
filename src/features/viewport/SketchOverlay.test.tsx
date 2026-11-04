// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SketchOverlay } from './SketchOverlay'
import { createSketch, addLine, addCircle } from '../../editor/sketch/model'
import type { ViewportSketchConfig } from './sketchMesh'
import { UnitProvider } from '../../ui/UnitProvider'

describe('4.2 SketchOverlay: Constraint glyphs and dimension labels', () => {
  it('renders dimension labels and geometric constraint glyphs, supports in-place editing', () => {
    let s = createSketch('TestSketch')
    const lineRes = addLine(s, { x: 0, y: 0 }, { x: 50, y: 0 })
    s = lineRes.sketch
    s.constraints.push(
      { id: 'c-horiz', kind: 'horizontal', refs: [lineRes.curveId] },
      { id: 'c-dist', kind: 'distance', refs: [lineRes.p1Id, lineRes.p2Id], value: 50 },
    )

    const circRes = addCircle(s, { x: 20, y: 20 }, 10)
    s = circRes.sketch
    s.constraints.push({ id: 'c-rad', kind: 'radius', refs: [circRes.curveId], value: 10 })

    const config: ViewportSketchConfig = {
      plane: { base: 'XY', offset: 0 },
      sketch: s,
    }

    // 1 unit = 1 pixel mapping for testing
    const project = (pt: { x: number; y: number }) => ({ x: pt.x + 200, y: 200 - pt.y })
    const onUpdate = vi.fn()
    const onDelete = vi.fn()

    render(
      <UnitProvider>
        <SketchOverlay
          config={config}
          project={project}
          onUpdateConstraint={onUpdate}
          onDeleteConstraint={onDelete}
        />
      </UnitProvider>,
    )

    // 1. Check distance label '50.0 mm' is rendered
    const distBtn = screen.getByText(/50\.0 mm/)
    expect(distBtn).toBeDefined()

    // 2. Check radius label 'R 10.0 mm' is rendered
    const radBtn = screen.getByText(/R 10\.0 mm/)
    expect(radBtn).toBeDefined()

    // 3. Check horizontal glyph 'H' is rendered
    const horizGlyph = screen.getByText('H')
    expect(horizGlyph).toBeDefined()

    // 4. Test in-place editing of distance: click label, LengthField input appears
    fireEvent.click(distBtn)
    const input = screen.getByRole('textbox')
    expect(input).toBeDefined()
    expect((input as HTMLInputElement).value).toBe('50')

    // Change value and press Enter
    fireEvent.change(input, { target: { value: '65.00' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledWith('c-dist', 65)

    // 5. Test right-click to delete constraint
    fireEvent.contextMenu(horizGlyph)
    expect(onDelete).toHaveBeenCalledWith('c-horiz')
  })

  it('renders conflicted constraints with error styling', () => {
    let s = createSketch('ConflictSketch')
    const lineRes = addLine(s, { x: 0, y: 0 }, { x: 50, y: 0 })
    s = lineRes.sketch
    s.constraints.push({ id: 'c-conflict', kind: 'horizontal', refs: [lineRes.curveId] })

    const config: ViewportSketchConfig = {
      plane: { base: 'XY', offset: 0 },
      sketch: s,
      conflicts: {
        constraints: ['c-conflict'],
      },
    }

    const project = (pt: { x: number; y: number }) => ({ x: pt.x + 200, y: 200 - pt.y })

    render(
      <UnitProvider>
        <SketchOverlay config={config} project={project} />
      </UnitProvider>,
    )

    const glyph = screen.getByText('H')
    // Should contain error styling classes
    expect(glyph.className).toContain('text-(--color-error-text)')
  })
})
