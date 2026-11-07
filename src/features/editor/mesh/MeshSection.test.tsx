// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MeshSection } from './MeshSection'
import { UnitProvider } from '../../../ui/UnitProvider'
import { expectAllNumericSteppers } from '../../../ui/stepperAssert'
import '../../../i18n'
import type { EditorObject } from '../../../editor/scene'
import type { IndexedMesh } from '../../../geometry/stl-import'
import { meshRegistry } from '../../../geometry/model'
import { boxSoup } from '../../../geometry/stl-fixtures'
import { weld } from '../../../geometry/mesh/weld'

describe('MeshSection', () => {
  const cubeMesh: IndexedMesh = weld(boxSoup(10, 10, 10)).mesh

  const testObject: EditorObject = {
    id: 'obj-cube',
    name: 'Cube',
    visible: true,
    locked: false,
    color: 0,
    source: {
      kind: 'mesh',
      meshId: 'cube-mesh-id',
      originMeshId: 'origin-cube-id',
      unit: 'mm',
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  }

  function setup(props: Partial<Parameters<typeof MeshSection>[0]> = {}) {
    meshRegistry.set('cube-mesh-id', cubeMesh)
    meshRegistry.set('origin-cube-id', cubeMesh)

    const user = userEvent.setup()
    const onUpdateObject = vi.fn()
    const onHighlight = vi.fn()
    const onFrame = vi.fn()

    const res = render(
      <UnitProvider>
        <MeshSection
          object={testObject}
          meshData={{
            vertProperties: cubeMesh.vertProperties,
            triVerts: cubeMesh.triVerts,
            min: [0, 0, 0],
            max: [10, 10, 10],
            volume: 1000,
            numProp: 3,
          }}
          onUpdateObject={onUpdateObject}
          onHighlight={onHighlight}
          onFrame={onFrame}
          isOpen={true}
          {...props}
        />
      </UnitProvider>
    )

    return { user, onUpdateObject, onHighlight, onFrame, ...res }
  }

  it('renders health summary for a solid cube', async () => {
    setup()
    expect(screen.getByText('Mesh health')).toBeInTheDocument()
    expect(screen.getByText('Closed solid')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument() // triangles
  })

  it('expands details and shows boundary loops / shells highlights', async () => {
    const { user, onHighlight } = setup()

    const detailsToggle = screen.getByTestId('mesh-details-toggle')
    await user.click(detailsToggle)

    // Shell 1 show button
    const showShell = screen.getByTestId('show-shell-0')
    expect(showShell).toBeInTheDocument()
    await user.click(showShell)
    expect(onHighlight).toHaveBeenCalled()
  })

  it('runs Auto repair and displays report', async () => {
    const { user, onUpdateObject } = setup()

    const autoRepairBtn = screen.getByTestId('mesh-auto-repair-btn')
    await user.click(autoRepairBtn)

    expect(screen.getByTestId('auto-repair-report')).toBeInTheDocument()
    expect(onUpdateObject).toHaveBeenCalled()
  })

  it('opens Weld dialog, adjusts tolerance and applies', async () => {
    const { user, onUpdateObject } = setup()

    const weldBtn = screen.getByTestId('repair-weld-btn')
    await user.click(weldBtn)

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()

    const applyBtn = within(dialog).getByRole('button', { name: 'Apply' })
    await user.click(applyBtn)

    expect(onUpdateObject).toHaveBeenCalled()
  })

  it('opens Make Solid confirmation with memory estimate', async () => {
    const { user, onUpdateObject } = setup()

    const makeSolidBtn = screen.getByTestId('repair-make-solid-btn')
    await user.click(makeSolidBtn)

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/Estimated grid:/)).toBeInTheDocument()

    const confirmBtn = within(dialog).getByRole('button', { name: 'Confirm Make Solid' })
    await user.click(confirmBtn)

    expect(onUpdateObject).toHaveBeenCalled()
  })

  it('opens Decimate dialog and applies decimation', async () => {
    const { user, onUpdateObject } = setup()

    const decimateBtn = screen.getByTestId('repair-decimate-btn')
    await user.click(decimateBtn)

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()

    const applyBtn = within(dialog).getByRole('button', { name: 'Apply' })
    await user.click(applyBtn)

    expect(onUpdateObject).toHaveBeenCalled()
  })

  it('opens Smooth dialog and applies smoothing', async () => {
    const { user, onUpdateObject } = setup()

    const smoothBtn = screen.getByTestId('repair-smooth-btn')
    await user.click(smoothBtn)

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()

    const applyBtn = within(dialog).getByRole('button', { name: 'Apply' })
    await user.click(applyBtn)

    expect(onUpdateObject).toHaveBeenCalled()
  })

  it('opens Best orientation dialog and applies candidate orientation', async () => {
    const { user, onUpdateObject } = setup()

    const bestOrientBtn = screen.getByTestId('mesh-best-orientation-btn')
    await user.click(bestOrientBtn)

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()

    const applyCandidate = within(dialog).getAllByRole('button', { name: 'Apply' })[0]
    await user.click(applyCandidate)

    expect(onUpdateObject).toHaveBeenCalled()
  })

  it('allows reverting to imported mesh', async () => {
    const { user, onUpdateObject } = setup()

    const revertBtn = screen.getByTestId('mesh-revert-btn')
    await user.click(revertBtn)

    const dialog = screen.getByRole('alertdialog')
    const confirmRevert = within(dialog).getByRole('button', { name: 'Revert to imported' })
    await user.click(confirmRevert)

    expect(onUpdateObject).toHaveBeenCalledWith(
      testObject.id,
      expect.objectContaining({
        source: expect.objectContaining({
          meshId: 'origin-cube-id',
        }),
      })
    )
  })

  it('passes stepper assertion on Make Solid form', async () => {
    const { user } = setup()

    const makeSolidBtn = screen.getByTestId('repair-make-solid-btn')
    await user.click(makeSolidBtn)

    await expectAllNumericSteppers()
  })
})
