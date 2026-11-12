import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { NumberField } from './NumberField'

const meta: Meta<typeof NumberField> = {
  title: 'UI/NumberField',
  component: NumberField,
}

export default meta
type Story = StoryObj<typeof NumberField>

export const Default: Story = {
  render: () => {
    const [val, setVal] = useState(3)
    return (
      <div className="w-56">
        <NumberField
          label="Grid Units (X)"
          value={val}
          onChange={setVal}
          min={1}
          max={10}
          step={1}
          digits={0}
        />
      </div>
    )
  },
}

export const WithUnit: Story = {
  render: () => {
    const [val, setVal] = useState(45.5)
    return (
      <div className="w-56">
        <NumberField
          label="Wall Thickness"
          value={val}
          onChange={setVal}
          min={0.8}
          max={100}
          step={0.5}
          unit="mm"
          digits={1}
        />
      </div>
    )
  },
}

export const WithError: Story = {
  render: () => {
    const [val, setVal] = useState(0)
    return (
      <div className="w-56">
        <NumberField
          label="Corner Radius"
          value={val}
          onChange={setVal}
          min={0}
          max={10}
          error="Radius must be at least 1 mm"
        />
      </div>
    )
  },
}

export const WithoutStepper: Story = {
  render: () => {
    const [val, setVal] = useState(120)
    return (
      <div className="w-56">
        <NumberField
          label="Custom Angle"
          value={val}
          onChange={setVal}
          min={0}
          max={360}
          stepper={false}
          unit="°"
        />
      </div>
    )
  },
}

export const Disabled: Story = {
  render: () => (
    <div className="w-56">
      <NumberField
        label="Locked Height"
        value={42}
        onChange={() => {}}
        min={10}
        max={100}
        disabled
      />
    </div>
  ),
}
