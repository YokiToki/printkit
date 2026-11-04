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
})
