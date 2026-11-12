import type { Meta, StoryObj } from '@storybook/react'
import { FeatureDialog } from './FeatureDialog'
import { createSketch, addLine } from '../../../editor/sketch/model'

const meta: Meta<typeof FeatureDialog> = {
  title: 'Editor/FeatureDialog',
  component: FeatureDialog,
}

export default meta
type Story = StoryObj<typeof FeatureDialog>

const mockSketch = () => {
  let s = createSketch('Base Profile')
  s = addLine(s, [0, 0], [42, 0])
  s = addLine(s, [42, 0], [42, 42])
  s = addLine(s, [42, 42], [0, 42])
  s = addLine(s, [0, 42], [0, 0])
  return s
}

export const Extrude: Story = {
  render: () => (
    <div className="w-80 rounded-card border border-border bg-surface-1 p-4 shadow-float">
      <FeatureDialog
        kind="extrude"
        sketches={[mockSketch()]}
        objects={[]}
        onApply={(feature) => alert(`Applied extrude feature: ${JSON.stringify(feature)}`)}
        onCancel={() => {}}
      />
    </div>
  ),
}

export const Revolve: Story = {
  render: () => (
    <div className="w-80 rounded-card border border-border bg-surface-1 p-4 shadow-float">
      <FeatureDialog
        kind="revolve"
        sketches={[mockSketch()]}
        objects={[]}
        onApply={(feature) => alert(`Applied revolve feature: ${JSON.stringify(feature)}`)}
        onCancel={() => {}}
      />
    </div>
  ),
}
