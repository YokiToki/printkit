import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Toggle } from './Toggle'

const meta: Meta<typeof Toggle> = {
  title: 'UI/Toggle',
  component: Toggle,
  render: (args) => {
    const [checked, setChecked] = useState(args.checked)
    return (
      <div className="w-64">
        <Toggle {...args} checked={checked} onChange={setChecked} />
      </div>
    )
  },
}

export default meta
type Story = StoryObj<typeof Toggle>

export const Default: Story = {
  args: {
    label: 'Enable Magnet Holes',
    checked: false,
    disabled: false,
    compact: false,
  },
}

export const Checked: Story = {
  args: {
    label: 'Exploded View',
    checked: true,
  },
}

export const Compact: Story = {
  args: {
    label: 'Wireframe Overlay',
    checked: true,
    compact: true,
  },
}

export const Disabled: Story = {
  args: {
    label: 'Locked Feature',
    checked: false,
    disabled: true,
  },
}
