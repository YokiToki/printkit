// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { CutPanel } from './CutPanel'

describe('CutPanel', () => {
  it('renders plane modes, cut modes, position field and applies', () => {
    const onApply = vi.fn()
    const onCancel = vi.fn()

    render(
      <CutPanel
        initialPosition={15}
        onApply={onApply}
        onCancel={onCancel}
      />
    )

    expect(screen.getByTestId('cut-panel')).toBeInTheDocument()

    // Mode options: Both parts, Keep lower, Keep upper, Slice
    expect(screen.getByText('Both parts')).toBeInTheDocument()
    expect(screen.getByText('Keep lower')).toBeInTheDocument()
    expect(screen.getByText('Keep upper')).toBeInTheDocument()
    expect(screen.getByText('Slice into N')).toBeInTheDocument()

    // Switch axis to X
    fireEvent.click(screen.getByText('X'))

    // Click apply
    fireEvent.click(screen.getByTestId('btn-cut-apply'))

    expect(onApply).toHaveBeenCalledWith({
      plane: expect.objectContaining({
        kind: 'axis',
        axis: 'x',
        position: 15,
      }),
      mode: 'both',
      sliceCount: undefined,
      connector: undefined,
    })

    // Cancel
    fireEvent.click(screen.getByTestId('btn-cut-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('toggles connectors and slice mode', () => {
    const onApply = vi.fn()
    const { rerender } = render(
      <CutPanel
        initialPosition={0}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    )

    // Toggle connectors
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    // ConnectorEditor appears
    expect(screen.getByTestId('connector-editor')).toBeInTheDocument()

    // Switch to slice mode
    fireEvent.click(screen.getByText('Slice into N'))

    // Apply with slice count
    fireEvent.click(screen.getByTestId('btn-cut-apply'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'slice',
        sliceCount: 3,
      })
    )
  })

  it('supports picked face plane mode', () => {
    const onApply = vi.fn()
    render(
      <CutPanel
        initialPosition={5}
        pickedFace={{ normal: [0, 1, 0], origin: [0, 10, 0] }}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('btn-cut-apply'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        plane: {
          kind: 'face',
          normal: [0, 1, 0],
          origin: [0, 15, 0],
        },
      })
    )
  })

  it('computes section from targetMesh and auto-places connectors', () => {
    const onApply = vi.fn()
    // 20x20x20 cube from -10 to 10
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
      <CutPanel
        initialPosition={0}
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

    // Toggle connectors
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    // Apply
    fireEvent.click(screen.getByTestId('btn-cut-apply'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: expect.objectContaining({
          kind: 'pegs',
          positions: expect.arrayContaining([expect.any(Array)]),
        }),
      })
    )
  })
})
