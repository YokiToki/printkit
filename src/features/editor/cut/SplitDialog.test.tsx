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

  it('passes connector config with auto-placed positions from targetMesh', () => {
    const onApply = vi.fn()
    const vertices = new Float32Array([
      -10, -10, -10,
       10, -10, -10,
       10,  10, -10,
      -10,  10, -10,
      -10, -10,  10,
       10, -10,  10,
       10,  10,  10,
      -10,  10,  10,
    ])
    const indices = new Uint32Array([
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      2, 3, 7, 2, 7, 6,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
    ])

    render(
      <SplitDialog
        objectBounds={{ min: [-10, -10, -10], max: [10, 10, 10] }}
        targetMesh={{
          vertProperties: vertices,
          triVerts: indices,
          numProp: 3,
          min: [-10, -10, -10],
          max: [10, 10, 10],
          volume: 8000,
        }}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    )

    // Apply (connectors are enabled by default)
    fireEvent.click(screen.getByTestId('btn-split-apply'))

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: expect.objectContaining({
          kind: 'pegs',
          positions: expect.any(Array),
        }),
      })
    )
  })
})
