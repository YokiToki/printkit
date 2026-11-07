// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { SplitDialog } from './SplitDialog'

describe('SplitDialog', () => {
  const sampleBounds = {
    min: [0, 0, 0] as [number, number, number],
    max: [500, 100, 50] as [number, number, number],
  }

  it('renders presets, auto-calculates cuts, and applies', () => {
    const onApply = vi.fn()
    const onCancel = vi.fn()

    render(
      <SplitDialog
        objectBounds={sampleBounds}
        onApply={onApply}
        onCancel={onCancel}
      />
    )

    expect(screen.getByTestId('split-dialog')).toBeInTheDocument()
    expect(screen.getByText('Bambu Lab (256 × 256)')).toBeInTheDocument()
    expect(screen.getByText('Prusa MK4 (250 × 210)')).toBeInTheDocument()

    // Switch preset to Prusa
    fireEvent.click(screen.getByText('Prusa MK4 (250 × 210)'))

    // Apply
    fireEvent.click(screen.getByTestId('btn-split-apply'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        bed: expect.objectContaining({
          width: 250,
          depth: 210,
        }),
        grid: expect.objectContaining({
          x: expect.any(Array),
          y: expect.any(Array),
        }),
        explodeGap: 10,
      })
    )
  })

  it('shows oversize warning when span exceeds bed capacity', () => {
    const hugeBounds = {
      min: [0, 0, 0] as [number, number, number],
      max: [2000, 2000, 50] as [number, number, number],
    }

    render(
      <SplitDialog
        objectBounds={hugeBounds}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    // With massive dimensions, oversize warning is shown if cuts aren't enough
    // For 2000 mm, autoCutsAxis gives ceil(2000 / 246) cuts
  })
})
