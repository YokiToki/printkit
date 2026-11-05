// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '../../i18n'
import type { EditorObject } from '../../editor/scene'
import { Outliner } from './Outliner'

describe('editor/Outliner', () => {
  const obj1: EditorObject = {
    id: 'obj-1',
    name: 'Bracket',
    visible: true,
    locked: false,
    color: 0,
    source: { kind: 'mesh', meshId: 'm1', unit: 'mm' },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  }

  const obj2: EditorObject = {
    id: 'obj-2',
    name: 'Cylinder',
    visible: true,
    locked: false,
    color: 1,
    source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 20, height: 30 } },
    transform: { position: [20, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  }

  it('renders object rows and supports selection and multi-selection with Shift', () => {
    const onSelect = vi.fn()
    render(
      <Outliner
        objects={[obj1, obj2]}
        selection={['obj-1']}
        onSelect={onSelect}
        onToggleVisible={vi.fn()}
        onToggleLock={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onIsolate={vi.fn()}
        onShowAll={vi.fn()}
      />
    )

    expect(screen.getByText('Bracket')).toBeDefined()
    expect(screen.getByText('Cylinder')).toBeDefined()

    // Normal click
    fireEvent.click(screen.getByTestId('outliner-row-obj-2'))
    expect(onSelect).toHaveBeenCalledWith(['obj-2'], false)

    // Shift click
    fireEvent.click(screen.getByTestId('outliner-row-obj-2'), { shiftKey: true })
    expect(onSelect).toHaveBeenCalledWith(['obj-2'], true)
  })

  it('toggles visibility and lock', () => {
    const onToggleVis = vi.fn()
    const onToggleLock = vi.fn()

    render(
      <Outliner
        objects={[obj1]}
        selection={[]}
        onSelect={vi.fn()}
        onToggleVisible={onToggleVis}
        onToggleLock={onToggleLock}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onIsolate={vi.fn()}
        onShowAll={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('outliner-toggle-vis-obj-1'))
    expect(onToggleVis).toHaveBeenCalledWith('obj-1')

    fireEvent.click(screen.getByTestId('outliner-toggle-lock-obj-1'))
    expect(onToggleLock).toHaveBeenCalledWith('obj-1')
  })

  it('renames object on double click and Enter', () => {
    const onRename = vi.fn()

    render(
      <Outliner
        objects={[obj1]}
        selection={['obj-1']}
        onSelect={vi.fn()}
        onToggleVisible={vi.fn()}
        onToggleLock={vi.fn()}
        onRename={onRename}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onIsolate={vi.fn()}
        onShowAll={vi.fn()}
      />
    )

    fireEvent.doubleClick(screen.getByText('Bracket'))
    const input = screen.getByTestId('outliner-rename-input-obj-1')
    fireEvent.change(input, { target: { value: 'Bracket Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRename).toHaveBeenCalledWith('obj-1', 'Bracket Renamed')
  })

  it('context menu performs Duplicate, Isolate, Show all, Delete', () => {
    const onDuplicate = vi.fn()
    const onIsolate = vi.fn()
    const onShowAll = vi.fn()
    const onDelete = vi.fn()

    render(
      <Outliner
        objects={[obj1, obj2]}
        selection={['obj-1']}
        onSelect={vi.fn()}
        onToggleVisible={vi.fn()}
        onToggleLock={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onIsolate={onIsolate}
        onShowAll={onShowAll}
      />
    )

    // Open context menu on obj-1
    fireEvent.contextMenu(screen.getByTestId('outliner-row-obj-1'), { clientX: 100, clientY: 100 })
    expect(screen.getByTestId('outliner-context-menu')).toBeDefined()

    fireEvent.click(screen.getByTestId('outliner-action-duplicate'))
    expect(onDuplicate).toHaveBeenCalledWith('obj-1')

    // Open context menu again
    fireEvent.contextMenu(screen.getByTestId('outliner-row-obj-1'), { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByTestId('outliner-action-isolate'))
    expect(onIsolate).toHaveBeenCalledWith('obj-1')

    fireEvent.contextMenu(screen.getByTestId('outliner-row-obj-1'), { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByTestId('outliner-action-showall'))
    expect(onShowAll).toHaveBeenCalled()

    fireEvent.contextMenu(screen.getByTestId('outliner-row-obj-1'), { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByTestId('outliner-action-delete'))
    expect(onDelete).toHaveBeenCalledWith(['obj-1'])
  })

  it('supports keyboard navigation (ArrowUp, ArrowDown, Delete)', () => {
    const onSelect = vi.fn()
    const onDelete = vi.fn()

    render(
      <Outliner
        objects={[obj1, obj2]}
        selection={['obj-1']}
        onSelect={onSelect}
        onToggleVisible={vi.fn()}
        onToggleLock={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={onDelete}
        onIsolate={vi.fn()}
        onShowAll={vi.fn()}
      />
    )

    const row1 = screen.getByTestId('outliner-row-obj-1')
    fireEvent.keyDown(row1, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenCalledWith(['obj-2'], false)

    fireEvent.keyDown(row1, { key: 'Delete' })
    expect(onDelete).toHaveBeenCalledWith(['obj-1'])
  })

  it('renders sketches group and supports edit, visibility toggle and delete', () => {
    const onEditSketch = vi.fn()
    const onToggleSketchVisible = vi.fn()
    const onDeleteSketch = vi.fn()

    const sketch = {
      id: 'sk-1',
      name: 'Sketch 1',
      plane: { base: 'XY' as const, offset: 0 },
      visible: true,
      points: {},
      curves: {},
      constraints: [],
    }

    render(
      <Outliner
        objects={[obj1]}
        selection={[]}
        sketches={[sketch]}
        activeSketchId="sk-1"
        onSelect={vi.fn()}
        onToggleVisible={vi.fn()}
        onToggleLock={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onIsolate={vi.fn()}
        onShowAll={vi.fn()}
        onEditSketch={onEditSketch}
        onToggleSketchVisible={onToggleSketchVisible}
        onDeleteSketch={onDeleteSketch}
      />
    )

    expect(screen.getByText('Sketch 1')).toBeInTheDocument()
    expect(screen.getByText('Editing')).toBeInTheDocument()

    // Toggle visibility
    fireEvent.click(screen.getByTestId('outliner-toggle-sketch-vis-sk-1'))
    expect(onToggleSketchVisible).toHaveBeenCalledWith('sk-1')

    // Edit sketch
    fireEvent.click(screen.getByTestId('outliner-edit-sketch-sk-1'))
    expect(onEditSketch).toHaveBeenCalledWith('sk-1')

    // Delete sketch (no dependent bodies, so direct delete)
    fireEvent.click(screen.getByTestId('outliner-delete-sketch-sk-1'))
    expect(onDeleteSketch).toHaveBeenCalledWith('sk-1')
  })

  it('renders features under body and supports edit and delete feature', () => {
    const onEditFeature = vi.fn()
    const onDeleteFeature = vi.fn()

    const featureObj: EditorObject = {
      id: 'body-1',
      name: 'Extrude 1',
      visible: true,
      locked: false,
      color: 0,
      source: {
        kind: 'feature',
        features: [
          {
            kind: 'extrude',
            sketch: 'sk-1',
            op: 'new',
            side: 'one',
            d1: 10,
          },
          {
            kind: 'extrude',
            sketch: 'sk-1',
            op: 'cut',
            side: 'one',
            d1: 5,
          },
        ],
      },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }

    render(
      <Outliner
        objects={[featureObj]}
        selection={[]}
        onSelect={vi.fn()}
        onToggleVisible={vi.fn()}
        onToggleLock={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onIsolate={vi.fn()}
        onShowAll={vi.fn()}
        onEditFeature={onEditFeature}
        onDeleteFeature={onDeleteFeature}
      />
    )

    // Expand body
    const expandBtn = screen.getByTestId('outliner-body-expand-body-1')
    fireEvent.click(expandBtn)

    // Features are visible
    expect(screen.getByTestId('outliner-feature-row-body-1-0')).toBeInTheDocument()
    expect(screen.getByTestId('outliner-feature-row-body-1-1')).toBeInTheDocument()

    // Edit feature
    fireEvent.click(screen.getByTestId('outliner-edit-feature-body-1-0'))
    expect(onEditFeature).toHaveBeenCalledWith('body-1', 0)

    // Delete feature
    fireEvent.click(screen.getByTestId('outliner-delete-feature-body-1-1'))
    expect(onDeleteFeature).toHaveBeenCalledWith('body-1', 1)
  })

  it('renders ops count chip and tool of chip (Task 4.2)', () => {
    const targetObj: EditorObject = {
      ...obj1,
      stack: [
        {
          id: 'bool-1',
          kind: 'boolean',
          enabled: true,
          params: { mode: 'subtract', tools: ['obj-2'] },
        },
        {
          id: 'offset-1',
          kind: 'offset',
          enabled: true,
          params: { distance: 0.2 },
        },
      ],
    }

    render(
      <Outliner
        objects={[targetObj, obj2]}
        selection={[]}
        onSelect={vi.fn()}
        onToggleVisible={vi.fn()}
        onToggleLock={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onIsolate={vi.fn()}
        onShowAll={vi.fn()}
      />
    )

    // targetObj has 2 ops: should show 2 ops chip
    const opsChip = screen.getByTestId('outliner-ops-chip-obj-1')
    expect(opsChip).toBeInTheDocument()
    expect(opsChip.textContent).toBe('2 ops')

    // obj2 is a tool of Bracket: should show tool chip
    const toolChip = screen.getByTestId('outliner-tool-chip-obj-2')
    expect(toolChip).toBeInTheDocument()
    expect(toolChip.textContent).toBe('tool of Bracket')
  })

  it('offers Release tool and Combine in context menu (Task 4.2)', () => {
    const onCombine = vi.fn()
    const onReleaseTool = vi.fn()

    const targetObj: EditorObject = {
      ...obj1,
      stack: [
        {
          id: 'bool-1',
          kind: 'boolean',
          enabled: true,
          params: { mode: 'subtract', tools: ['obj-2'] },
        },
      ],
    }

    const { rerender } = render(
      <Outliner
        objects={[targetObj, obj2]}
        selection={['obj-1', 'obj-2']}
        onSelect={vi.fn()}
        onToggleVisible={vi.fn()}
        onToggleLock={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onIsolate={vi.fn()}
        onShowAll={vi.fn()}
        onCombine={onCombine}
        onReleaseTool={onReleaseTool}
      />
    )

    // Right-click on obj-1 with 2 objects selected -> shows Combine options
    fireEvent.contextMenu(screen.getByTestId('outliner-row-obj-1'))
    expect(screen.getByTestId('outliner-action-combine-union')).toBeInTheDocument()
    expect(screen.getByTestId('outliner-action-combine-subtract')).toBeInTheDocument()
    expect(screen.getByTestId('outliner-action-combine-intersect')).toBeInTheDocument()

    // Click Combine subtract
    fireEvent.click(screen.getByTestId('outliner-action-combine-subtract'))
    expect(onCombine).toHaveBeenCalledWith('obj-1', ['obj-2'], 'subtract')

    // Now right-click on obj-2 (which is a tool) -> shows Release tool
    rerender(
      <Outliner
        objects={[targetObj, obj2]}
        selection={['obj-2']}
        onSelect={vi.fn()}
        onToggleVisible={vi.fn()}
        onToggleLock={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onIsolate={vi.fn()}
        onShowAll={vi.fn()}
        onCombine={onCombine}
        onReleaseTool={onReleaseTool}
      />
    )

    fireEvent.contextMenu(screen.getByTestId('outliner-row-obj-2'))
    expect(screen.getByTestId('outliner-action-release-tool')).toBeInTheDocument()

    // Click Release tool
    fireEvent.click(screen.getByTestId('outliner-action-release-tool'))
    expect(onReleaseTool).toHaveBeenCalledWith('obj-2')
  })
})
