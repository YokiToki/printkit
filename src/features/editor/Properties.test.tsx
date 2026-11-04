// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Properties } from './Properties'
import type { EditorObject } from '../../editor/scene'
import type { MeshHealth } from '../../editor/health'
import { UnitProvider } from '../../ui/UnitProvider'
import { expectAllNumericSteppers } from '../../ui/stepperAssert'
import '../../i18n'

describe('Properties', () => {
  const boxObject: EditorObject = {
    id: 'box-1',
    name: 'Box 1',
    visible: true,
    locked: false,
    color: 0,
    source: {
      kind: 'primitive',
      shape: 'box',
      params: { width: 20, depth: 30, height: 10 },
    },
    transform: {
      position: [10, 20, 5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  }

  const cylinderObject: EditorObject = {
    id: 'cyl-1',
    name: 'Cylinder 1',
    visible: true,
    locked: false,
    color: 1,
    source: {
      kind: 'primitive',
      shape: 'cylinder',
      params: { diameter: 20, height: 40 },
    },
    transform: {
      position: [40, 20, 20],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  }

  const meshObject: EditorObject = {
    id: 'mesh-1',
    name: 'Bracket',
    visible: true,
    locked: false,
    color: 2,
    source: {
      kind: 'mesh',
      meshId: 'bracket-mesh-id',
      unit: 'mm',
    },
    transform: {
      position: [0, 0, 15],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  }

  const mockHealthMap = new Map<string, MeshHealth>([
    [
      'mesh-1',
      {
        triangles: 1200,
        openEdges: 0,
        nonManifoldEdges: 0,
        degenerate: 0,
        volume: 24000,
        closed: true,
      },
    ],
  ])

  let onUpdateObject: Mock<(id: string, patch: Partial<EditorObject>, mergeKey?: string) => void>
  let onUpdateTransform: Mock<(id: string, newTransform: EditorObject['transform'], mergeKey?: string) => void>
  let onUpdatePrimitiveParams: Mock<(id: string, params: Record<string, number>, mergeKey?: string) => void>

  beforeEach(() => {
    onUpdateObject = vi.fn()
    onUpdateTransform = vi.fn()
    onUpdatePrimitiveParams = vi.fn()
  })

  function renderProperties(props: {
    objects?: EditorObject[]
    selection?: string[]
    healthMap?: Map<string, MeshHealth>
  } = {}) {
    return render(
      <UnitProvider>
        <Properties
          objects={props.objects ?? [boxObject, cylinderObject]}
          selection={props.selection ?? ['box-1']}
          onUpdateObject={onUpdateObject}
          onUpdateTransform={onUpdateTransform}
          onUpdatePrimitiveParams={onUpdatePrimitiveParams}
          healthMap={props.healthMap}
        />
      </UnitProvider>
    )
  }

  it('renders scene summary when selection is empty', () => {
    renderProperties({ selection: [] })
    expect(screen.getByText(/Scene Summary/i)).toBeInTheDocument()
    expect(screen.getAllByText('2').length).toBe(2) // 2 objects total, 2 visible
  })

  it('renders single object properties and updates name and color', async () => {
    renderProperties({ selection: ['box-1'] })

    const nameInput = screen.getByTestId('property-name-input') as HTMLInputElement
    expect(nameInput.value).toBe('Box 1')
    fireEvent.change(nameInput, { target: { value: 'Renamed Box' } })
    expect(onUpdateObject).toHaveBeenCalledWith('box-1', { name: 'Renamed Box' })

    const colorBtn = screen.getByTestId('property-color-2')
    fireEvent.click(colorBtn)
    expect(onUpdateObject).toHaveBeenCalledWith('box-1', { color: 2 })
  })

  it('applies size on blur/Enter as one step', async () => {
    const user = userEvent.setup()
    renderProperties({ selection: ['box-1'] })

    // Expand Transform section
    await user.click(screen.getByRole('button', { name: /Expand:.*Transform/i }))

    // Find Size X input
    const sizeXInput = screen.getByRole('textbox', { name: 'Size X' })
    await user.clear(sizeXInput)
    await user.type(sizeXInput, '40{enter}')

    expect(onUpdateTransform).toHaveBeenCalled()
    const lastCall = onUpdateTransform.mock.calls[onUpdateTransform.mock.calls.length - 1]
    expect(lastCall[0]).toBe('box-1')
    expect(lastCall[2]).toBe('scale-x')
    // Scaling X from 20 to 40 is factor 2. Since proportion lock is on by default, all scales should be 2.
    expect(lastCall[1].scale).toEqual([2, 2, 2])
  })

  it('allows unlocking proportions', async () => {
    const user = userEvent.setup()
    renderProperties({ selection: ['box-1'] })

    // Expand Transform section
    await user.click(screen.getByRole('button', { name: /Expand:.*Transform/i }))

    const lockBtn = screen.getByTestId('property-proportion-lock')
    await user.click(lockBtn)

    const sizeXInput = screen.getByRole('textbox', { name: 'Size X' })
    await user.clear(sizeXInput)
    await user.type(sizeXInput, '40')
    fireEvent.blur(sizeXInput)

    const lastCall = onUpdateTransform.mock.calls[onUpdateTransform.mock.calls.length - 1]
    expect(lastCall[1].scale).toEqual([2, 1, 1])
  })

  it('triggers quick transform buttons (drop to bed, center, mirror, reset)', async () => {
    const user = userEvent.setup()
    renderProperties({ selection: ['box-1'] })

    // Expand Transform section
    await user.click(screen.getByRole('button', { name: /Expand:.*Transform/i }))

    await user.click(screen.getByTestId('property-drop-bed'))
    expect(onUpdateTransform).toHaveBeenCalledWith('box-1', expect.objectContaining({ position: [10, 20, 0] }))

    await user.click(screen.getByTestId('property-center-bed'))
    expect(onUpdateTransform).toHaveBeenCalledWith('box-1', expect.objectContaining({ position: [0, 0, 5] }))

    await user.click(screen.getByTestId('property-mirror-x'))
    expect(onUpdateTransform).toHaveBeenCalled()

    await user.click(screen.getByTestId('property-reset-transform'))
    expect(onUpdateTransform).toHaveBeenCalledWith('box-1', {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })
  })

  it('renders primitive parameters and updates them', async () => {
    const user = userEvent.setup()
    renderProperties({ selection: ['box-1'] })

    // Expand Parameters section
    await user.click(screen.getByRole('button', { name: /Expand:.*Parameters/i }))

    const widthInput = screen.getByRole('textbox', { name: 'Width' })
    await user.clear(widthInput)
    await user.type(widthInput, '25{enter}')

    expect(onUpdatePrimitiveParams).toHaveBeenCalledWith(
      'box-1',
      expect.objectContaining({ width: 25 }),
      'param-width'
    )
  })

  it('renders mesh health section for mesh objects', async () => {
    const user = userEvent.setup()
    renderProperties({
      objects: [meshObject],
      selection: ['mesh-1'],
      healthMap: mockHealthMap,
    })

    // Expand Mesh Health section
    await user.click(screen.getByRole('button', { name: /Expand:.*Mesh health/i }))

    expect(screen.getByText(/1200/)).toBeInTheDocument()
    expect(screen.getByText(/Closed solid|Замкнутое тело/i)).toBeInTheDocument()
  })

  it('renders multi-selection transform and affects all selected objects', async () => {
    const user = userEvent.setup()
    renderProperties({
      objects: [boxObject, cylinderObject],
      selection: ['box-1', 'cyl-1'],
    })

    expect(screen.getByText(/2 objects selected|Выбрано: 2/i)).toBeInTheDocument()

    // Expand Transform section
    await user.click(screen.getByRole('button', { name: /Expand:.*Transform/i }))

    // Position X for selection: box is at 10 (size 20 -> 0..20), cyl is at 40 (size 20 -> 30..50)
    // Common bounds: min 0, max 50 -> center is 25.
    const posXInput = screen.getByRole('textbox', { name: 'Pos X' })
    await user.clear(posXInput)
    await user.type(posXInput, '35{enter}')

    // Delta is 35 - 25 = 10
    expect(onUpdateTransform).toHaveBeenCalledWith(
      'box-1',
      expect.objectContaining({ position: [20, 20, 5] }),
      'multi-pos'
    )
    expect(onUpdateTransform).toHaveBeenCalledWith(
      'cyl-1',
      expect.objectContaining({ position: [50, 20, 20] }),
      'multi-pos'
    )
  })

  it('passes stepperAssert for single object view', async () => {
    renderProperties({ selection: ['box-1'] })
    await expectAllNumericSteppers()
  })
})
