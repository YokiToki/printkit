// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { TextToolPanel } from './TextToolPanel'
import { expectAllNumericSteppers } from '../../../ui/stepperAssert'

describe('TextToolPanel', () => {
  it('renders inputs, font options, and steppers on all numeric inputs', async () => {
    const onApply = vi.fn()
    const onCancel = vi.fn()

    render(
      <TextToolPanel
        initialPoint={[0, 0, 10]}
        initialNormal={[0, 0, 1]}
        onApply={onApply}
        onCancel={onCancel}
      />
    )

    expect(screen.getByTestId('text-tool-panel')).toBeInTheDocument()

    // Verify all numeric inputs have - / + stepper buttons
    await expectAllNumericSteppers()

    // Change text input
    const input = screen.getByTestId('input-text-content')
    fireEvent.change(input, { target: { value: 'Custom Label' } })

    // Apply
    fireEvent.click(screen.getByTestId('btn-text-apply'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        point: [0, 0, 10],
        normal: [0, 0, 1],
        text: 'Custom Label',
        mode: 'emboss',
      })
    )

    // Cancel
    fireEvent.click(screen.getByTestId('btn-text-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('switches between emboss and engrave modes', () => {
    const onApply = vi.fn()
    render(
      <TextToolPanel
        onApply={onApply}
        onCancel={vi.fn()}
      />
    )

    // Switch to engrave
    fireEvent.click(screen.getByText('Engrave'))

    fireEvent.click(screen.getByTestId('btn-text-apply'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'engrave',
      })
    )
  })
})
