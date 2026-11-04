// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SvgImportDialog } from './SvgImportDialog'
import { UnitProvider } from '../../../ui/UnitProvider'
import { expectAllNumericSteppers } from '../../../ui/stepperAssert'
import '../../../i18n'
import { createSketch, type Sketch } from '../../../editor/sketch/model'
import { evaluateFeatures } from '../../../geometry/features/evaluate'
import { expectValidSolid } from '../../../geometry/testing'

describe('SvgImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes expectAllNumericSteppers assertion', () => {
    render(
      <UnitProvider>
        <SvgImportDialog
          initialSvgText={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" /></svg>`}
          onImport={vi.fn()}
          onClose={vi.fn()}
        />
      </UnitProvider>
    )
    expectAllNumericSteppers()
  })

  it('renders and allows switching target mode between active sketch and new sketch', async () => {
    const activeSketch: Sketch = createSketch('Active Sketch', { base: 'XY', offset: 0 })
    const onImport = vi.fn()
    const onClose = vi.fn()

    render(
      <UnitProvider>
        <SvgImportDialog
          initialSvgText={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" /></svg>`}
          activeSketch={activeSketch}
          onImport={onImport}
          onClose={onClose}
        />
      </UnitProvider>
    )

    // Check dialog appears
    expect(screen.getByTestId('svg-import-dialog')).toBeInTheDocument()

    // Switch to new sketch
    const newSketchBtn = screen.getByRole('button', { name: /new sketch/i })
    fireEvent.click(newSketchBtn)

    // Plane buttons should now appear
    expect(screen.getByRole('button', { name: 'XY' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'XZ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'YZ' })).toBeInTheDocument()

    // Click confirm
    const confirmBtn = screen.getByTestId('svg-confirm-btn')
    fireEvent.click(confirmBtn)

    expect(onImport).toHaveBeenCalledTimes(1)
    const [sketch, isNew, meta] = onImport.mock.calls[0]
    expect(isNew).toBe(true)
    expect(meta.curves).toBeGreaterThan(0)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('switches scale mode between fitWidth and dpi', () => {
    render(
      <UnitProvider>
        <SvgImportDialog
          initialSvgText={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" /></svg>`}
          onImport={vi.fn()}
          onClose={vi.fn()}
        />
      </UnitProvider>
    )

    const dpiBtn = screen.getByRole('button', { name: /dpi/i })
    fireEvent.click(dpiBtn)
    expectAllNumericSteppers()
  })

  it('displays warning when SVG contains unsupported elements', () => {
    render(
      <UnitProvider>
        <SvgImportDialog
          initialSvgText={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="50" height="50" /><text x="10" y="10">Hello</text></svg>`}
          onImport={vi.fn()}
          onClose={vi.fn()}
        />
      </UnitProvider>
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/text/)).toBeInTheDocument()
  })

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn()
    render(
      <UnitProvider>
        <SvgImportDialog
          initialSvgText={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" /></svg>`}
          onImport={vi.fn()}
          onClose={onClose}
        />
      </UnitProvider>
    )

    fireEvent.click(screen.getByTestId('svg-cancel-btn'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('end-to-end: SVG -> sketch -> extrude -> valid solid with expectValidSolid', async () => {
    let importedSketch: Sketch | null = null
    render(
      <UnitProvider>
        <SvgImportDialog
          initialSvgText={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="25" /></svg>`}
          onImport={(sketch) => {
            importedSketch = sketch
          }}
          onClose={vi.fn()}
        />
      </UnitProvider>
    )

    fireEvent.click(screen.getByTestId('svg-confirm-btn'))
    expect(importedSketch).not.toBeNull()

    // Extrude the imported circle
    const res = await evaluateFeatures(
      [
        {
          id: 'extrude-svg-1',
          kind: 'extrude',
          sketch: importedSketch!.id,
          side: 'one',
          d1: 10,
          op: 'new',
        },
      ],
      [importedSketch!],
      'coarse'
    )

    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
    expect(res.solid!.volume()).toBeGreaterThan(100)
  })
})
