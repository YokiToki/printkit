import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'
import { IconDownload, IconTrash } from '@tabler/icons-react'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  argTypes: {
    primary: { control: 'boolean' },
    danger: { control: 'boolean' },
    compact: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
}

export default meta
type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: {
    children: 'Standard Action',
    primary: false,
    danger: false,
    compact: false,
    disabled: false,
  },
}

export const Primary: Story = {
  args: {
    children: 'Primary Action',
    primary: true,
  },
}

export const Danger: Story = {
  args: {
    children: (
      <>
        <IconTrash size={16} /> Delete Object
      </>
    ),
    danger: true,
  },
}

export const Compact: Story = {
  args: {
    children: 'Compact',
    compact: true,
  },
}

export const WithIcon: Story = {
  args: {
    primary: true,
    children: (
      <>
        <IconDownload size={18} /> Export STL
      </>
    ),
  },
}

export const Disabled: Story = {
  args: {
    children: 'Unavailable',
    disabled: true,
  },
}
