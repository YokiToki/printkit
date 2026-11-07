// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { ConnectorEditor } from './ConnectorEditor'
import type { CutConnectorConfig, ConnectorReport } from '../../../geometry/cut/connectors'
import type { Polygon } from '../../../geometry/cut/place'

describe('ConnectorEditor', () => {
  const initialConfig: CutConnectorConfig = {
    kind: 'pegs',
    diameter: 4,
    depth: 6,
    clearance: 0.2,
    tolerance: 0.1,
    positions: [[0, 0], [10, 0]],
  }

  const samplePolygon: Polygon = [
    [-20, -10],
    [20, -10],
    [20, 10],
    [-20, 10],
  ]

  it('renders kind options, presets and fields', () => {
    const onChange = vi.fn()
    render(
      <ConnectorEditor
        config={initialConfig}
        onChange={onChange}
        polygons={[samplePolygon]}
      />
    )

    expect(screen.getByTestId('connector-editor')).toBeInTheDocument()
    expect(screen.getByText('Pegs')).toBeInTheDocument()
    expect(screen.getByText('Pins')).toBeInTheDocument()
    expect(screen.getByText('Magnets')).toBeInTheDocument()
    expect(screen.getByText('Dovetail')).toBeInTheDocument()

    // 2 markers rendered
    expect(screen.getByTestId('connector-marker-0')).toBeInTheDocument()
    expect(screen.getByTestId('connector-marker-1')).toBeInTheDocument()
  })

  it('changes connector kind and selects presets', () => {
    const onChange = vi.fn()
    render(
      <ConnectorEditor
        config={initialConfig}
        onChange={onChange}
        polygons={[samplePolygon]}
      />
    )

    // Switch kind to magnets
    fireEvent.click(screen.getByText('Magnets'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'magnets',
        diameter: 6,
        depth: 2,
      })
    )

    // Select preset (e.g. Filament 1.75)
    const presetBtn = screen.getByText('1.75 mm filament')
    fireEvent.click(presetBtn)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        diameter: 1.9,
      })
    )
  })

  it('supports adding and removing markers', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ConnectorEditor
        config={initialConfig}
        onChange={onChange}
        polygons={[samplePolygon]}
      />
    )

    // Add marker
    fireEvent.click(screen.getByTestId('btn-add-connector'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        positions: expect.arrayContaining([[0, 0], [10, 0]]),
      })
    )
    expect(onChange.mock.calls[0][0].positions).toHaveLength(3)

    // Select marker 0 to show remove button
    fireEvent.pointerDown(screen.getByTestId('connector-marker-0'))
    expect(screen.getByTestId('btn-remove-connector')).toBeInTheDocument()

    // Remove marker
    fireEvent.click(screen.getByTestId('btn-remove-connector'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        positions: [[10, 0]],
      })
    )
  })

  it('displays connector issues from reports', () => {
    const reports: ConnectorReport[] = [
      {
        index: 0,
        kind: 'pegs',
        position: [0, 0],
        valid: false,
        issue: 'outside',
      },
      {
        index: 1,
        kind: 'pegs',
        position: [10, 0],
        valid: false,
        issue: 'thin',
      },
    ]

    render(
      <ConnectorEditor
        config={initialConfig}
        onChange={vi.fn()}
        polygons={[samplePolygon]}
        reports={reports}
      />
    )

    const issueList = screen.getByTestId('connector-issue-list')
    expect(issueList).toBeInTheDocument()
    expect(issueList.textContent).toContain('#1')
    expect(issueList.textContent).toContain('#2')
  })
})
