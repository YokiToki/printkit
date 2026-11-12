import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { LengthField } from './LengthField'

const meta: Meta<typeof LengthField> = {
  title: 'UI/LengthField',
  component: LengthField,
}

export default meta
type Story = StoryObj<typeof LengthField>

export const Default: Story = {
  render: () => {
    const [val, setVal] = useState(42)
    return (
      <div className="w-56 space-y-2">
        <LengthField
          label="Pitch Distance"
          value={val}
          onChange={setVal}
          min={10}
          max={200}
        />
        <div className="font-mono text-xs text-text-subtle">Stored value: {val} mm</div>
      </div>
    )
  },
}

export const ExtrudeDepth: Story = {
  render: () => {
    const [val, setVal] = useState(15)
    return (
      <div className="w-56 space-y-2">
        <LengthField
          label="Extrude Depth"
          value={val}
          onChange={setVal}
          min={1}
          max={500}
          step={5}
        />
        <div className="font-mono text-xs text-text-subtle">Stored value: {val} mm</div>
      </div>
    )
  },
}

export const Disabled: Story = {
  render: () => (
    <div className="w-56">
      <LengthField
        label="Base Height"
        value={4.65}
        onChange={() => {}}
        min={4.65}
        max={100}
        disabled
      />
    </div>
  ),
}
