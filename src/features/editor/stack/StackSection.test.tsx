// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StackSection } from './StackSection'
import type { EditorObject } from '../../../editor/scene'
import type { Op } from '../../../editor/stack'
import type { ObjectStatus } from '../../../geometry/model'
import { UnitProvider } from '../../../ui/UnitProvider'
import { expectAllNumericSteppers } from '../../../ui/stepperAssert'
import '../../../i18n'

describe('StackSection (Task 4.1)', () => {
  const initialOps: Op[] = [
    {
      id: 'op-offset-1',
      kind: 'offset',
      enabled: true,
      params: { distance: 0.5 },
    },
    {
      id: 'op-lin-1',
      kind: 'linearPattern',
      enabled: true,
      params: { axis: 'x', count: 3, mode: 'spacing', step: 25, symmetric: false, merge: true },
    },
    {
      id: 'op-hollow-1',
      kind: 'hollow',
      enabled: false,
      params: { wall: 2 },
    },
  ]

  const testObject: EditorObject = {
    id: 'obj-1',
    name: 'Test Bracket',
    visible: true,
    locked: false,
    color: 0,
    source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    stack: initialOps,
    rollback: null,
  }

  const otherObject: EditorObject = {
    id: 'tool-cyl',
    name: 'Tool Cylinder',
    visible: true,
    locked: false,
    color: 1,
    source: { kind: 'primitive', shape: 'cylinder', params: {} },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  }

  function setup(props: Partial<Parameters<typeof StackSection>[0]> = {}) {
    const user = userEvent.setup()
    const onAddOp = vi.fn()
    const onUpdateOp = vi.fn()
    const onRemoveOp = vi.fn()
    const onToggleOp = vi.fn()
    const onMoveOp = vi.fn()
    const onSetRollback = vi.fn()
    const onFlatten = vi.fn()

    const res = render(
      <UnitProvider>
        <StackSection
          object={testObject}
          allObjects={[testObject, otherObject]}
          onAddOp={onAddOp}
          onUpdateOp={onUpdateOp}
          onRemoveOp={onRemoveOp}
          onToggleOp={onToggleOp}
          onMoveOp={onMoveOp}
          onSetRollback={onSetRollback}
          onFlatten={onFlatten}
          {...props}
        />
      </UnitProvider>
    )

    // Expand the Section since Section starts collapsed by convention
    const expandBtn = screen.getByRole('button', { name: /Expand:.*Operations/i })
    fireEvent.click(expandBtn)

    return {
      user,
      onAddOp,
      onUpdateOp,
      onRemoveOp,
      onToggleOp,
      onMoveOp,
      onSetRollback,
      onFlatten,
      ...res,
    }
  }

  it('renders rows for all operations with summary and status', () => {
    setup()
    expect(screen.getByTestId('op-row-0')).toBeInTheDocument()
    expect(screen.getByTestId('op-row-1')).toBeInTheDocument()
    expect(screen.getByTestId('op-row-2')).toBeInTheDocument()
    expect(screen.getByText('Offset +0.5 mm')).toBeInTheDocument()
  })

  it('adds an operation from the Add menu', async () => {
    const { user, onAddOp } = setup()

    const addBtn = screen.getByTestId('stack-add-op-btn')
    await user.click(addBtn)

    expect(screen.getByTestId('stack-add-menu')).toBeInTheDocument()
    const addOffsetBtn = screen.getByTestId('add-op-offset')
    await user.click(addOffsetBtn)

    expect(onAddOp).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'offset',
        enabled: true,
        params: expect.objectContaining({ distance: 0.2 }),
      })
    )
  })

  it('toggles operation suppression (eye)', async () => {
    const { user, onToggleOp } = setup()

    const eyeBtn = screen.getByTestId('op-toggle-enabled-0')
    await user.click(eyeBtn)

    expect(onToggleOp).toHaveBeenCalledWith('op-offset-1')
  })

  it('deletes an operation', async () => {
    const { user, onRemoveOp } = setup()

    const deleteBtn = screen.getByTestId('op-delete-btn-1')
    await user.click(deleteBtn)

    expect(onRemoveOp).toHaveBeenCalledWith('op-lin-1')
  })

  it('reorders operations using move buttons and keyboard', async () => {
    const { user, onMoveOp } = setup()

    // Move down via button
    const moveDown0 = screen.getByTestId('op-move-down-0')
    await user.click(moveDown0)
    expect(onMoveOp).toHaveBeenCalledWith(0, 1)

    // Move up via button
    const moveUp1 = screen.getByTestId('op-move-up-1')
    await user.click(moveUp1)
    expect(onMoveOp).toHaveBeenCalledWith(1, 0)

    // Keyboard Alt+ArrowDown
    const row0 = screen.getByTestId('op-row-0')
    fireEvent.keyDown(row0, { key: 'ArrowDown', altKey: true })
    expect(onMoveOp).toHaveBeenCalledWith(0, 1)

    // Keyboard Alt+ArrowUp
    const row1 = screen.getByTestId('op-row-1')
    fireEvent.keyDown(row1, { key: 'ArrowUp', altKey: true })
    expect(onMoveOp).toHaveBeenCalledWith(1, 0)
  })

  it('reorders operations via drag and drop', () => {
    const { onMoveOp } = setup()

    const dragHandle0 = screen.getByTestId('op-drag-handle-0')
    const dragHandle2 = screen.getByTestId('op-drag-handle-2')

    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(key: string, val: string) {
        this.data[key] = val
      },
      getData(key: string) {
        return this.data[key]
      },
    }

    fireEvent.dragStart(dragHandle0, { dataTransfer })
    fireEvent.dragOver(dragHandle2, { dataTransfer })
    fireEvent.drop(dragHandle2, { dataTransfer })

    expect(onMoveOp).toHaveBeenCalledWith(0, 2)
  })

  it('edits an operation in place when row is expanded', async () => {
    const { user, onUpdateOp } = setup()

    // Expand first op (offset)
    const expandBtn = screen.getByTestId('op-expand-btn-0')
    await user.click(expandBtn)

    expect(screen.getByTestId('op-form-op-offset-1')).toBeInTheDocument()

    // Find input field for Distance
    const distInput = screen.getByRole('textbox', { name: /Distance/i })
    await user.clear(distInput)
    await user.type(distInput, '1.5')
    fireEvent.blur(distInput)

    expect(onUpdateOp).toHaveBeenCalledWith(
      'op-offset-1',
      expect.objectContaining({ params: { distance: 1.5 } }),
      expect.any(String)
    )
  })

  it('sets and clears rollback marker', async () => {
    const { user, onSetRollback } = setup()

    // Click divider at index 1
    const divider1 = screen.getByTestId('rollback-divider-1')
    await user.click(divider1)
    expect(onSetRollback).toHaveBeenCalledWith(1)

    cleanup()

    // With active rollback at 1: clicking again clears it
    const { user: user2, onSetRollback: onSetRollback2 } = setup({
      object: { ...testObject, rollback: 1 },
    })

    const activeDivider = screen.getByTestId('rollback-divider-1')
    await user2.click(activeDivider)
    expect(onSetRollback2).toHaveBeenCalledWith(null)
  })

  it('flattens stack with confirmation dialog', async () => {
    const { user, onFlatten } = setup()

    const flattenBtn = screen.getByTestId('stack-flatten-btn')
    await user.click(flattenBtn)

    // Confirm dialog is shown
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Flatten operations?')).toBeInTheDocument()

    // Click confirm
    const confirmBtn = within(dialog).getByRole('button', { name: 'Flatten stack' })
    await user.click(confirmBtn)

    expect(onFlatten).toHaveBeenCalledTimes(1)
  })

  it('passes stepperAssert when numeric forms are expanded', async () => {
    const { user } = setup()

    // Expand the linear pattern op
    const expandBtn = screen.getByTestId('op-expand-btn-1')
    await user.click(expandBtn)

    // Check that numeric steppers exist and have valid labels
    await expectAllNumericSteppers()
  })

  it('renders Repair action when op fails with notSolid and clicking it invokes onRepairMesh', async () => {
    const onRepairMesh = vi.fn()
    const failedStatus: ObjectStatus = {
      objectId: 'obj-1',
      ops: [
        {
          opId: 'op-offset-1',
          status: 'failed',
          reason: 'stack.error.notSolid',
          params: { name: 'Cube', openEdges: 3 },
        },
      ],
    }

    const { user } = setup({
      objectStatus: failedStatus,
      onRepairMesh,
    })

    const repairBtn = screen.getByTestId('op-repair-btn-0')
    expect(repairBtn).toBeInTheDocument()
    await user.click(repairBtn)
    expect(onRepairMesh).toHaveBeenCalled()
  })
})
