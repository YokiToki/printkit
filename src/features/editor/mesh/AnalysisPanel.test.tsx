// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalysisPanel, type AnalysisSettings } from './AnalysisPanel'
import { UnitProvider } from '../../../ui/UnitProvider'
import { expectAllNumericSteppers } from '../../../ui/stepperAssert'
import '../../../i18n'

describe('AnalysisPanel', () => {
  const initialSettings: AnalysisSettings = {
    overhangEnabled: true,
    overhangThreshold: 45,
    thinWallEnabled: true,
    thinWallThreshold: 0.8,
    sectionEnabled: true,
    sectionAxis: 'z',
    sectionOffset: 10,
  }

  it('renders toggles and controls for overhang, thin wall, and section view', () => {
    render(
      <UnitProvider>
        <AnalysisPanel settings={initialSettings} onChange={() => {}} />
      </UnitProvider>
    )

    expect(screen.getByText('Overhang angle')).toBeInTheDocument()
    expect(screen.getByText('Thin walls')).toBeInTheDocument()
    expect(screen.getByText('Section view')).toBeInTheDocument()
  })

  it('calls onChange when section axis is changed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <UnitProvider>
        <AnalysisPanel settings={initialSettings} onChange={onChange} />
      </UnitProvider>
    )

    const xButton = screen.getByRole('button', { name: 'X' })
    await user.click(xButton)

    expect(onChange).toHaveBeenCalledWith({ sectionAxis: 'x' })
  })

  it('passes stepper assertion on all numeric inputs', async () => {
    render(
      <UnitProvider>
        <AnalysisPanel settings={initialSettings} onChange={() => {}} />
      </UnitProvider>
    )

    await expectAllNumericSteppers()
  })
})
