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
})
