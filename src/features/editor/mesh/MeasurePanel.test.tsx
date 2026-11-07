// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MeasurePanel, type MeasurementItem } from './MeasurePanel'
import { UnitProvider } from '../../../ui/UnitProvider'
import '../../../i18n'

describe('MeasurePanel', () => {
  const sampleMeasurements: MeasurementItem[] = [
    {
      id: 'm-dist',
      kind: 'distance',
      value: 53.85,
      points: [
        [0, 0, 0],
        [40, 30, 20],
      ],
    },
    {
      id: 'm-circle',
      kind: 'circle',
      value: 6.0,
      residual: 0.002,
      points: [
        [3, 0, 0],
        [0, 3, 0],
        [-3, 0, 0],
      ],
    },
    {
      id: 'm-angle',
      kind: 'angle',
      value: 90.0,
      points: [
        [10, 0, 0],
        [0, 0, 0],
        [0, 10, 0],
      ],
    },
  ]

  it('renders pick prompt when empty', () => {
    render(
      <UnitProvider>
        <MeasurePanel measurements={[]} onClear={() => {}} />
      </UnitProvider>
    )

    expect(screen.getByText(/Click on the mesh to measure/)).toBeInTheDocument()
  })

  it('renders measurements with correct units and values', () => {
    render(
      <UnitProvider>
        <MeasurePanel measurements={sampleMeasurements} onClear={() => {}} />
      </UnitProvider>
    )

    expect(screen.getByText('53.85 mm')).toBeInTheDocument()
    expect(screen.getByText('6 mm')).toBeInTheDocument()
    expect(screen.getByText('90.0°')).toBeInTheDocument()
    expect(screen.getByText(/residual: 0 mm/)).toBeInTheDocument()
  })

  it('copies measurement to clipboard on copy click', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })

    render(
      <UnitProvider>
        <MeasurePanel measurements={sampleMeasurements} onClear={() => {}} />
      </UnitProvider>
    )

    const copyBtn = screen.getByTestId('copy-measurement-m-dist')
    await user.click(copyBtn)

    expect(writeText).toHaveBeenCalledWith('53.85 mm')
  })

  it('clears measurements on clear click', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(
      <UnitProvider>
        <MeasurePanel measurements={sampleMeasurements} onClear={onClear} />
      </UnitProvider>
    )

    const clearBtn = screen.getByTestId('clear-measurements-btn')
    await user.click(clearBtn)

    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
