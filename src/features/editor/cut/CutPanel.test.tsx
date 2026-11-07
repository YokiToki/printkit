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
})
