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
  const s0 = createSketch('Base Profile')
  const r1 = addLine(s0, { x: 0, y: 0 }, { x: 42, y: 0 })
  const r2 = addLine(r1.sketch, { x: 42, y: 0 }, { x: 42, y: 42 })
  const r3 = addLine(r2.sketch, { x: 42, y: 42 }, { x: 0, y: 42 })
  const r4 = addLine(r3.sketch, { x: 0, y: 42 }, { x: 0, y: 0 })
  return r4.sketch
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
