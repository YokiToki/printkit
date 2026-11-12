import type { Meta, StoryObj } from '@storybook/react'
import { Banner } from './Banner'

const meta: Meta<typeof Banner> = {
  title: 'UI/Banner',
  component: Banner,
  argTypes: {
    kind: {
      control: 'select',
      options: ['info', 'warn', 'error'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Banner>

export const Info: Story = {
  args: {
    kind: 'info',
    children: 'Model generated in 24 ms. 1,420 triangles.',
  },
}

export const Warning: Story = {
  args: {
    kind: 'warn',
    children: 'Wall thickness is below the recommended minimum of 0.8 mm for FDM printing.',
  },
}

export const ErrorState: Story = {
  args: {
    kind: 'error',
    children: 'Non-manifold mesh geometry detected. Self-intersecting faces cannot be sliced.',
  },
}
