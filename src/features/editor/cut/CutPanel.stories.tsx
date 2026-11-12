import type { Meta, StoryObj } from '@storybook/react'
import { CutPanel } from './CutPanel'

const meta: Meta<typeof CutPanel> = {
  title: 'Editor/CutPanel',
  component: CutPanel,
}

export default meta
type Story = StoryObj<typeof CutPanel>

export const Default: Story = {
  render: () => (
    <div className="w-80 rounded-card border border-border bg-surface-1 p-4 shadow-float">
      <CutPanel
        initialPosition={15}
        onApply={(params) => alert(`Cut applied: ${JSON.stringify(params)}`)}
        onCancel={() => {}}
      />
    </div>
  ),
}

export const PickedFace: Story = {
  render: () => (
    <div className="w-80 rounded-card border border-border bg-surface-1 p-4 shadow-float">
      <CutPanel
        pickedFace={{ normal: [0, 0, 1], origin: [0, 0, 25] }}
        onApply={(params) => alert(`Cut on face applied: ${JSON.stringify(params)}`)}
        onCancel={() => {}}
      />
    </div>
  ),
}
