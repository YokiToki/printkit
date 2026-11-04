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

  it('renders CAD guidelines and HUD inputs for Point 1 (X, Y relative to axes) and Point 2 (W, H)', () => {
    const s = createSketch('HudTest')
    const project = (pt: { x: number; y: number }) => ({ x: pt.x + 200, y: 200 - pt.y })
    const onSubmitDraft = vi.fn()

    // 1. Stage 0: First point relative to origin axes
    const configStage0: ViewportSketchConfig = {
      plane: { base: 'XY', offset: 0 },
      sketch: s,
      tool: 'rect-2pt',
      toolStage: 0,
      cursorPlanePos: { x: 25, y: 15 },
    }

    const { rerender } = render(
      <UnitProvider>
        <SketchOverlay
          config={configStage0}
          project={project}
          onSubmitDraftInput={onSubmitDraft}
        />
      </UnitProvider>,
    )

    const hud0 = screen.getByTestId('sketch-draft-hud-stage0')
    expect(hud0).toBeDefined()
    expect(screen.getByText('X')).toBeDefined()
    expect(screen.getByText('Y')).toBeDefined()

    const inputs0 = hud0.querySelectorAll('input')
    expect(inputs0.length).toBe(2)
    expect(inputs0[0].value).toBe('25.0')
    expect(inputs0[1].value).toBe('15.0')

    // Change X to 30, Tab, Enter -> submits (30, 15)
    fireEvent.change(inputs0[0], { target: { value: '30' } })
    fireEvent.keyDown(inputs0[0], { key: 'Tab' })
    fireEvent.keyDown(inputs0[1], { key: 'Enter' })
    expect(onSubmitDraft).toHaveBeenCalledWith(30, 15)

    // 2. Stage 1: Point 2 extending rectangle with sides W and H
    onSubmitDraft.mockClear()
    const configStage1: ViewportSketchConfig = {
      plane: { base: 'XY', offset: 0 },
      sketch: s,
      tool: 'rect-2pt',
      toolStage: 1,
      toolStartPt: { x: 30, y: 15 },
      cursorPlanePos: { x: 70, y: 45 },
    }

    rerender(
      <UnitProvider>
        <SketchOverlay
          config={configStage1}
          project={project}
          onSubmitDraftInput={onSubmitDraft}
        />
      </UnitProvider>,
    )

    const hud1 = screen.getByTestId('sketch-draft-hud-stage1')
    expect(hud1).toBeDefined()
    expect(screen.getByText('W')).toBeDefined()
    expect(screen.getByText('H')).toBeDefined()

    const inputs1 = hud1.querySelectorAll('input')
    expect(inputs1[0].value).toBe('40.0') // 70 - 30
    expect(inputs1[1].value).toBe('30.0') // 45 - 15

    // Type W = 50, H = 20, Enter -> submits (50, 20)
    fireEvent.change(inputs1[0], { target: { value: '50' } })
    fireEvent.change(inputs1[1], { target: { value: '20' } })
    fireEvent.keyDown(inputs1[1], { key: 'Enter' })
    expect(onSubmitDraft).toHaveBeenCalledWith(50, 20)
  })
})
