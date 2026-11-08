// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorMode } from './EditorMode'
import { UnitProvider } from '../../ui/UnitProvider'
import '../../i18n'

vi.mock('../viewport/Viewport', () => ({
  Viewport: () => <div data-testid="viewport" />,
}))

// Модель сцены подменяется: по умолчанию её нет, отдельные тесты задают статусы операций.
const mocks = vi.hoisted(() => ({ model: null as any }))

vi.mock('../../app/useModel', () => ({
  useModel: () => ({ model: mocks.model, busy: false, pending: false, error: null }),
  getModelClient: () => ({ registerMesh: () => {}, generate: async () => null }),
}))

describe('EditorMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function renderEditor() {
    return render(
      <UnitProvider>
        <EditorMode />
      </UnitProvider>
    )
  }

  it('renders toolbar, outliner, viewport and properties panels on desktop', () => {
    renderEditor()

    expect(screen.getByTestId('editor-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('editor-outliner-panel')).toBeInTheDocument()
    expect(screen.getByTestId('viewport')).toBeInTheDocument()
    expect(screen.getByTestId('editor-properties-panel')).toBeInTheDocument()
  })

  it('collapses and expands the outliner panel', async () => {
    const user = userEvent.setup()
    renderEditor()

    const collapseBtn = screen.getByTestId('outliner-collapse-btn')
    await user.click(collapseBtn)

    // Expand button should now be visible in viewport
    const expandBtn = screen.getByTestId('outliner-expand-btn')
    expect(expandBtn).toBeInTheDocument()

    // Click expand
    await user.click(expandBtn)
    expect(screen.queryByTestId('outliner-expand-btn')).not.toBeInTheDocument()
    expect(screen.getByTestId('outliner-collapse-btn')).toBeInTheDocument()
  })

  it('collapses and expands the properties panel', async () => {
    const user = userEvent.setup()
    renderEditor()

    const collapseBtn = screen.getByTestId('properties-collapse-btn')
    await user.click(collapseBtn)

    // Expand button should now be visible in viewport
    const expandBtn = screen.getByTestId('properties-expand-btn')
    expect(expandBtn).toBeInTheDocument()

    // Click expand
    await user.click(expandBtn)
    expect(screen.queryByTestId('properties-expand-btn')).not.toBeInTheDocument()
    expect(screen.getByTestId('properties-collapse-btn')).toBeInTheDocument()
  })

  it('provides mobile drawer buttons and opens bottom drawers', async () => {
    const user = userEvent.setup()
    renderEditor()

    expect(screen.getByTestId('mobile-drawer-bar')).toBeInTheDocument()
    const mobileOutlinerBtn = screen.getByTestId('mobile-outliner-btn')
    const mobilePropertiesBtn = screen.getByTestId('mobile-properties-btn')

    // Open mobile outliner
    await user.click(mobileOutlinerBtn)
    expect(screen.getByTestId('mobile-drawer')).toBeInTheDocument()

    // Close mobile drawer
    await user.click(screen.getByTestId('mobile-drawer-close'))
    expect(screen.queryByTestId('mobile-drawer')).not.toBeInTheDocument()

    // Open mobile properties
    await user.click(mobilePropertiesBtn)
    expect(screen.getByTestId('mobile-drawer')).toBeInTheDocument()
  })

  it('adds a sketch, enters sketch mode, and finishes sketch', async () => {
    const user = userEvent.setup()
    renderEditor()

    // Initially 3D Toolbar is present
    expect(screen.getByTestId('toolbar-add-button')).toBeInTheDocument()

    // Click Add menu
    await user.click(screen.getByTestId('toolbar-add-button'))

    // Click Add Sketch (XY)
    const addSketchBtn = screen.getByTestId('toolbar-add-sketch-xy')
    await user.click(addSketchBtn)

    // Now SketchToolbar is displayed
    expect(screen.getByTestId('sketch-tool-finish')).toBeInTheDocument()
    expect(screen.getByTestId('sketch-tool-line')).toBeInTheDocument()
    expect(screen.getByTestId('sketch-dof-status')).toBeInTheDocument()

    // Properties panel shows ConstraintPanel
    expect(screen.getByTestId('constraint-panel')).toBeInTheDocument()

    // Finish sketch
    await user.click(screen.getByTestId('sketch-tool-finish'))

    // Returned to 3D Toolbar and 3D Properties
    expect(screen.getByTestId('toolbar-add-button')).toBeInTheDocument()
    expect(screen.queryByTestId('sketch-tool-finish')).not.toBeInTheDocument()
  })

  it('extruding a sketch creates a feature body and hides the sketch', async () => {
    const user = userEvent.setup()
    renderEditor()

    // Add sketch
    await user.click(screen.getByTestId('toolbar-add-button'))
    await user.click(screen.getByTestId('toolbar-add-sketch-xy'))
    await user.click(screen.getByTestId('sketch-tool-finish'))

    // Now sketch exists -> Open Add menu
    await user.click(screen.getByTestId('toolbar-add-button'))
    const extrudeBtn = screen.getByTestId('toolbar-add-extrude')
    expect(extrudeBtn).toBeInTheDocument()
    await user.click(extrudeBtn)

    // FeatureDialog is open in properties sidebar
    expect(screen.getByTestId('feature-dialog')).toBeInTheDocument()
    const applyBtn = screen.getByTestId('feature-dialog-apply')
    await user.click(applyBtn)

    // FeatureDialog closed, new body in outliner
    expect(screen.queryByTestId('feature-dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Extrude')).toBeInTheDocument()
  })

  it('re-picking a failed operation switches to face mode and selects the owning object', async () => {
    const user = userEvent.setup()
    // Любая операция помечена как невыполненная: строка показывает кнопку пере-выбора.
    const failedOps = {
      find: () => ({ opId: 'any', status: 'failed', reason: 'edge.error.missing', params: {} }),
    }
    mocks.model = { parts: [], editor: { statuses: new Proxy({}, { get: () => ({ ops: failedOps }) }) } }
    renderEditor()

    // Примитив добавляется и выделяется — в свойствах появляется стек операций.
    await user.click(screen.getByTestId('toolbar-add-button'))
    await user.click(screen.getByTestId('toolbar-add-box'))

    await user.click(screen.getByRole('button', { name: /Expand:.*Operations/i }))
    await user.click(screen.getByTestId('stack-add-op-btn'))
    await user.click(screen.getByTestId('add-op-boolean'))

    const repick = await screen.findByTestId('op-repick-btn-0')
    await user.click(repick)

    // Режим переключился на грани, панель инструментов граней на месте.
    expect(screen.getByRole('button', { name: 'Face' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('face-tools-panel')).toBeInTheDocument()
    mocks.model = null
  })

  it('editing an extrude updates the body and does not duplicate it in outliner', async () => {
    const user = userEvent.setup()
    renderEditor()

    // Add sketch
    await user.click(screen.getByTestId('toolbar-add-button'))
    await user.click(screen.getByTestId('toolbar-add-sketch-xy'))
    await user.click(screen.getByTestId('sketch-tool-finish'))

    // Extrude
    await user.click(screen.getByTestId('toolbar-add-button'))
    await user.click(screen.getByTestId('toolbar-add-extrude'))
    await user.click(screen.getByTestId('feature-dialog-apply'))

    // Initially 1 body with name Extrude
    expect(screen.getAllByText('Extrude')).toHaveLength(1)

    // Expand Operations section
    const expandSectionBtn = screen.getByRole('button', { name: /Expand:.*Operations/i })
    await user.click(expandSectionBtn)

    // In StackSection, expand op 0 and click edit
    await user.click(screen.getByTestId('op-expand-btn-0'))
    const editBtn = screen.getByTestId('op-edit-feature-btn')
    expect(editBtn).toBeInTheDocument()
    await user.click(editBtn)

    // FeatureDialog is open for editing
    expect(screen.getByTestId('feature-dialog')).toBeInTheDocument()
    await user.click(screen.getByTestId('feature-dialog-apply'))

    // Still exactly 1 body with name Extrude (no duplicate created!)
    expect(screen.getAllByText('Extrude')).toHaveLength(1)
  })
})
