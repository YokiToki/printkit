// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FeatureDialog } from './FeatureDialog'
import { UnitProvider } from '../../../ui/UnitProvider'
import { expectAllNumericSteppers } from '../../../ui/stepperAssert'
import '../../../i18n'
import type { Sketch } from '../../../editor/sketch/model'

describe('FeatureDialog', () => {
  const dummySketch: Sketch = {
    id: 'sk-1',
    name: 'Sketch 1',
    plane: { base: 'XY', offset: 0 },
    visible: true,
    points: {
      p1: { x: 0, y: 0 },
      p2: { x: 40, y: 0 },
    },
    curves: {
      l1: { id: 'l1', kind: 'line', a: 'p1', b: 'p2', construction: false },
    },
    constraints: [],
  }

  it('passes stepperAssert for Extrude dialog', async () => {
    render(
      <UnitProvider>
        <FeatureDialog
          kind="extrude"
          sketches={[dummySketch]}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      </UnitProvider>
    )

    await expectAllNumericSteppers()
  })

  it('passes stepperAssert for Revolve dialog', async () => {
    render(
      <UnitProvider>
        <FeatureDialog
          kind="revolve"
          sketches={[dummySketch]}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      </UnitProvider>
    )

    await expectAllNumericSteppers()
  })

  it('creates an Extrude feature and calls onApply', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onCancel = vi.fn()

    render(
      <UnitProvider>
        <FeatureDialog
          kind="extrude"
          sketches={[dummySketch]}
          onApply={onApply}
          onCancel={onCancel}
        />
      </UnitProvider>
    )

    expect(screen.getByTestId('feature-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('feature-dialog-apply')).toBeInTheDocument()

    // Click Apply
    await user.click(screen.getByTestId('feature-dialog-apply'))

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'extrude',
        sketch: 'sk-1',
        op: 'new',
        side: 'one',
        d1: 10,
      }),
      undefined,
      undefined
    )
  })

  it('creates a Revolve feature with Plane Y and calls onApply', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onCancel = vi.fn()

    render(
      <UnitProvider>
        <FeatureDialog
          kind="revolve"
          sketches={[dummySketch]}
          onApply={onApply}
          onCancel={onCancel}
        />
      </UnitProvider>
    )

    // Click Apply
    await user.click(screen.getByTestId('feature-dialog-apply'))

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'revolve',
        sketch: 'sk-1',
        op: 'new',
        axis: { kind: 'planeAxis', axis: 'y' },
        angle: 360,
      }),
      undefined,
      undefined
    )
  })

  it('passes targetObjectId when editing an existing feature even if op is new', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onCancel = vi.fn()

    render(
      <UnitProvider>
        <FeatureDialog
          kind="extrude"
          sketches={[dummySketch]}
          targetObjectId="body-1"
          featureIndex={0}
          initialFeature={{
            kind: 'extrude',
            sketch: 'sk-1',
            side: 'one',
            op: 'new',
            d1: 15,
          }}
          onApply={onApply}
          onCancel={onCancel}
        />
      </UnitProvider>
    )

    await user.click(screen.getByTestId('feature-dialog-apply'))

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'extrude',
        sketch: 'sk-1',
        op: 'new',
        d1: 15,
      }),
      'body-1',
      0
    )
  })
})
