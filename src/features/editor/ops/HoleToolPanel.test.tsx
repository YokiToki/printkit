// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { HoleToolPanel } from './HoleToolPanel'
import { expectAllNumericSteppers } from '../../../ui/stepperAssert'

describe('HoleToolPanel', () => {
  it('renders presets and steppers on all numeric inputs', async () => {
    const onApply = vi.fn()
    const onCancel = vi.fn()

    render(
      <HoleToolPanel
        initialPoint={[10, 20, 30]}
        initialNormal={[0, 0, 1]}
        onApply={onApply}
        onCancel={onCancel}
      />
    )

    expect(screen.getByTestId('hole-tool-panel')).toBeInTheDocument()

    // Verify all numeric inputs have - / + stepper buttons
    await expectAllNumericSteppers()

    // Apply
    fireEvent.click(screen.getByTestId('btn-hole-apply'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        point: [10, 20, 30],
        normal: [0, 0, 1],
        kind: 'counterbore',
      })
    )

    // Cancel
    fireEvent.click(screen.getByTestId('btn-hole-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('switches thread and head type', () => {
    const onApply = vi.fn()
    render(
      <HoleToolPanel
        initialPoint={[0, 0, 0]}
        initialNormal={[0, 0, 1]}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    )

    // Switch thread to M4
    fireEvent.click(screen.getByText('M4'))

    // Switch head to ISO 7380
    fireEvent.click(screen.getByText('ISO 7380'))

    // Apply
    fireEvent.click(screen.getByTestId('btn-hole-apply'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: 'M4 counterbore',
        headType: 'iso7380',
        cbDiameter: 8.3,
        cbDepth: 2.6,
      })
    )
  })
})
