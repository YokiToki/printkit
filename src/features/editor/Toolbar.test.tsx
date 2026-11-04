// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PrimitiveShape } from '../../editor/scene'
import { Toolbar, EditorDropZone, type TransformTool } from './Toolbar'
import '../../i18n'

describe('Toolbar and EditorDropZone', () => {
  let onToolChange: Mock<(tool: TransformTool) => void>
  let onSnapChange: Mock<(snap: boolean) => void>
  let onSnapStepChange: Mock<(mm: number, deg: number) => void>
  let onProjectionChange: Mock<(projection: 'persp' | 'ortho') => void>
  let onFit: Mock<() => void>
  let onAddPrimitive: Mock<(shape: PrimitiveShape) => void>
  let onImportFiles: Mock<(files: File[], unit: 'mm' | 'in') => void>

  beforeEach(() => {
    localStorage.clear()
    onToolChange = vi.fn()
    onSnapChange = vi.fn()
    onSnapStepChange = vi.fn()
    onProjectionChange = vi.fn()
    onFit = vi.fn()
    onAddPrimitive = vi.fn()
    onImportFiles = vi.fn()
  })

  function renderToolbar(props: {
    tool?: TransformTool
    snap?: boolean
    snapStepMm?: number
    snapStepDeg?: number
    projection?: 'persp' | 'ortho'
  } = {}) {
    return render(
      <Toolbar
        tool={props.tool ?? 'select'}
        onToolChange={onToolChange}
        snap={props.snap ?? true}
        onSnapChange={onSnapChange}
        snapStepMm={props.snapStepMm ?? 5}
        snapStepDeg={props.snapStepDeg ?? 15}
        onSnapStepChange={onSnapStepChange}
        projection={props.projection ?? 'persp'}
        onProjectionChange={onProjectionChange}
        onFit={onFit}
        onAddPrimitive={onAddPrimitive}
        onImportFiles={onImportFiles}
      />
    )
  }

  it('renders toolbar buttons and switches tools', async () => {
    const user = userEvent.setup()
    renderToolbar({ tool: 'select' })

    expect(screen.getByTestId('toolbar-import-button')).toBeInTheDocument()
    expect(screen.getByTestId('toolbar-add-button')).toBeInTheDocument()

    // Switch tool to translate (Move)
    await user.click(screen.getByTestId('toolbar-tool-move'))
    expect(onToolChange).toHaveBeenCalledWith('translate')

    // Switch tool to rotate
    await user.click(screen.getByTestId('toolbar-tool-rotate'))
    expect(onToolChange).toHaveBeenCalledWith('rotate')

    // Switch tool to scale
    await user.click(screen.getByTestId('toolbar-tool-scale'))
    expect(onToolChange).toHaveBeenCalledWith('scale')
  })

  it('opens Add menu and creates selected primitive', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByTestId('toolbar-add-button'))
    expect(screen.getByTestId('toolbar-add-menu')).toBeInTheDocument()

    // Click Box
    await user.click(screen.getByTestId('toolbar-add-box'))
    expect(onAddPrimitive).toHaveBeenCalledWith('box')
    expect(screen.queryByTestId('toolbar-add-menu')).not.toBeInTheDocument()
  })

  it('toggles snap and changes snap step', async () => {
    const user = userEvent.setup()
    renderToolbar({ snap: true, snapStepMm: 5 })

    // Click snap toggle
    await user.click(screen.getByTestId('toolbar-snap-toggle'))
    expect(onSnapChange).toHaveBeenCalledWith(false)

    // Open snap menu
    await user.click(screen.getByTestId('toolbar-snap-menu-btn'))
    expect(screen.getByTestId('toolbar-snap-menu')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '10 mm' }))
    expect(onSnapStepChange).toHaveBeenCalledWith(10, 15)
  })

  it('switches projection and calls fit', async () => {
    const user = userEvent.setup()
    renderToolbar({ projection: 'persp' })

    await user.click(screen.getByTestId('toolbar-projection-toggle'))
    expect(onProjectionChange).toHaveBeenCalledWith('ortho')

    await user.click(screen.getByTestId('toolbar-fit-button'))
    expect(onFit).toHaveBeenCalled()
  })

  it('opens and closes hotkeys popover', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByTestId('toolbar-hotkeys-button'))
    expect(screen.getByTestId('toolbar-hotkeys-popover')).toBeInTheDocument()
    expect(screen.getByText('Ctrl+D')).toBeInTheDocument()
  })

  it('handles file selection via input with unit choice dialog', async () => {
    renderToolbar()

    const fileInput = screen.getByTestId('stl-file-input')
    const file = new File(['mock binary content'], 'model.stl', { type: 'model/stl' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    // Dialog should appear
    expect(screen.getByTestId('unit-choice-dialog')).toBeInTheDocument()

    // Select inches
    fireEvent.click(screen.getByTestId('unit-choice-in'))
    // Check remember choice
    fireEvent.click(screen.getByTestId('unit-choice-remember'))

    // Confirm
    fireEvent.click(screen.getByTestId('unit-choice-confirm'))

    expect(onImportFiles).toHaveBeenCalledWith([file], 'in')
    expect(screen.queryByTestId('unit-choice-dialog')).not.toBeInTheDocument()

    // Next time, rememberChoice skips dialog
    fireEvent.change(fileInput, { target: { files: [file] } })
    expect(screen.queryByTestId('unit-choice-dialog')).not.toBeInTheDocument()
    expect(onImportFiles).toHaveBeenCalledWith([file], 'in')
  })

  it('handles drop event in EditorDropZone', () => {
    const onDropFiles = vi.fn()
    render(
      <EditorDropZone onDropFiles={onDropFiles}>
        <div data-testid="viewport-content">Viewport</div>
      </EditorDropZone>
    )

    const dropZone = screen.getByTestId('editor-dropzone')
    expect(screen.getByTestId('viewport-content')).toBeInTheDocument()

    // Simulate drag enter
    fireEvent.dragEnter(dropZone, {
      dataTransfer: { items: [{ kind: 'file', type: 'application/octet-stream' }] },
    })
    expect(screen.getByTestId('editor-drop-hint')).toBeInTheDocument()

    // Drop an STL file
    const file = new File(['content'], 'part.stl', { type: 'application/octet-stream' })
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    })

    expect(onDropFiles).toHaveBeenCalledWith([file])
    expect(screen.queryByTestId('editor-drop-hint')).not.toBeInTheDocument()
  })
})
